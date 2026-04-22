import { createWriteStream } from 'node:fs';
import type { WriteStream } from 'node:fs';

import { bus } from '../sse/bus.js';
import { llamaServer } from '../process/llamaServer.js';
import type {
  LineEvent,
  SessionCloseEvent,
  SessionOpenEvent,
  ServerStatus,
} from '../process/llamaServer.js';
import { writeJsonAtomic } from '../config/atomic.js';
import { readSettings } from '../config/settings.js';
import { pruneSessions } from '../sessions/retention.js';
import { MetricsParser } from '../metrics/parser.js';
import type { SessionMetrics } from '../metrics/types.js';
import { isNoisy } from './noise.js';

const METRICS_FLUSH_MS = 1000;

interface ActiveSession {
  sessionId: string;
  profileId: string;
  rawLog: WriteStream;
  metricsPath: string;
  nextLineId: number;
  parser: MetricsParser;
  flushTimer: NodeJS.Timeout;
}

let active: ActiveSession | null = null;

export function getActiveMetricsSnapshot(): { sessionId: string; metrics: SessionMetrics } | null {
  if (!active) return null;
  return { sessionId: active.sessionId, metrics: active.parser.getSnapshot() };
}

async function flushMetrics(session: ActiveSession): Promise<void> {
  try {
    await writeJsonAtomic(session.metricsPath, session.parser.getSnapshot());
  } catch {
    // Persistence failure is not fatal; the in-memory snapshot remains and
    // the next tick will retry. A corrupt metrics.json on disk would be
    // worse than a stale one.
  }
}

export function startLogsPipeline(dataDir: string): void {
  llamaServer.on('status', (status: ServerStatus) => {
    bus.emitEvent('server.status', status);
  });

  llamaServer.on('session-open', (evt: SessionOpenEvent) => {
    if (active) {
      clearInterval(active.flushTimer);
      active.rawLog.end();
    }
    const session: ActiveSession = {
      sessionId: evt.sessionId,
      profileId: evt.profileId,
      rawLog: createWriteStream(evt.rawLogPath, { flags: 'a', encoding: 'utf8' }),
      metricsPath: evt.metricsPath,
      nextLineId: 1,
      parser: new MetricsParser(),
      flushTimer: setInterval(() => {
        if (active === session) void flushMetrics(session);
      }, METRICS_FLUSH_MS),
    };
    session.flushTimer.unref();
    active = session;
  });

  llamaServer.on('line', (evt: LineEvent) => {
    if (!active || active.sessionId !== evt.sessionId) return;
    const line = `${evt.text}\n`;
    active.rawLog.write(line);
    const lineId = active.nextLineId;
    active.nextLineId += 1;
    bus.emitEvent('log.line', {
      sessionId: evt.sessionId,
      at: new Date().toISOString(),
      lineId,
      stream: evt.stream,
      noise: isNoisy(evt.text),
      text: evt.text,
    });

    for (const parsed of active.parser.feed(evt.text)) {
      switch (parsed.type) {
        case 'startup':
          bus.emitEvent('metrics.startup', { sessionId: evt.sessionId, startup: parsed.startup });
          break;
        case 'request':
          bus.emitEvent('metrics.request', {
            sessionId: evt.sessionId,
            request: parsed.request,
            totals: parsed.totals,
          });
          break;
        case 'cache':
          bus.emitEvent('metrics.cache', { sessionId: evt.sessionId, cache: parsed.cache });
          break;
        case 'error':
          bus.emitEvent('metrics.error', { sessionId: evt.sessionId, entry: parsed.entry });
          break;
        case 'notice':
          bus.emitEvent('metrics.notice', { sessionId: evt.sessionId, notice: parsed.notice });
          break;
        case 'memory-breakdown':
          bus.emitEvent('metrics.memory-breakdown', {
            sessionId: evt.sessionId,
            breakdown: parsed.breakdown,
          });
          break;
      }
    }
  });

  llamaServer.on('session-close', (evt: SessionCloseEvent) => {
    const session = active && active.sessionId === evt.sessionId ? active : null;
    if (session) {
      clearInterval(session.flushTimer);
      active = null;
      // Final metrics flush, then retention prune. Chained sequentially so a
      // just-finalized session is retained correctly when pruning.
      void (async () => {
        await flushMetrics(session);
        session.rawLog.end();
        try {
          const settings = await readSettings(dataDir);
          await pruneSessions(dataDir, session.profileId, settings.sessionsPerProfileLimit);
        } catch {
          // best-effort
        }
        bus.emitEvent('session.ended', {
          sessionId: evt.sessionId,
          profileId: evt.profileId,
          endedAt: evt.endedAt,
          exitCode: evt.code,
          exitSignal: evt.signal,
          crashed: evt.crashed,
        });
      })();
    } else {
      bus.emitEvent('session.ended', {
        sessionId: evt.sessionId,
        profileId: evt.profileId,
        endedAt: evt.endedAt,
        exitCode: evt.code,
        exitSignal: evt.signal,
        crashed: evt.crashed,
      });
    }
  });
}
