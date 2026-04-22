import type { FastifyInstance } from 'fastify';

import { bus } from '../sse/bus.js';
import type { BusEventName, BusEvents } from '../sse/bus.js';
import { llamaServer } from '../process/llamaServer.js';
import { getActiveMetricsSnapshot } from '../logs/pipeline.js';

const HEARTBEAT_MS = 15_000;
const SSE_HEADERS = {
  'Content-Type': 'text/event-stream',
  'Cache-Control': 'no-cache, no-transform',
  Connection: 'keep-alive',
  'X-Accel-Buffering': 'no',
} as const;

export async function registerEventsRoute(app: FastifyInstance): Promise<void> {
  app.get('/api/events', (request, reply) => {
    reply.hijack();
    const raw = reply.raw;

    for (const [k, v] of Object.entries(SSE_HEADERS)) raw.setHeader(k, v);
    raw.writeHead(200);
    raw.write('retry: 1000\n\n');

    const send = (event: BusEventName | 'ready', data: unknown, id?: number): void => {
      if (raw.destroyed || raw.writableEnded) return;
      if (id !== undefined) raw.write(`id: ${id}\n`);
      raw.write(`event: ${event}\n`);
      raw.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Initial snapshot so late-connecting clients see current state without
    // waiting for the next transition. Replays:
    //   - server.status (always)
    //   - metrics.snapshot (full SessionMetrics; only when a session is active)
    send('server.status', llamaServer.getStatus());
    const snapshot = getActiveMetricsSnapshot();
    if (snapshot) {
      send('metrics.snapshot', { sessionId: snapshot.sessionId, metrics: snapshot.metrics });
    }
    send('ready', { at: new Date().toISOString() });

    const onStatus = (payload: BusEvents['server.status']): void => send('server.status', payload);
    const onLine = (payload: BusEvents['log.line']): void => send('log.line', payload, payload.lineId);
    const onEnded = (payload: BusEvents['session.ended']): void => send('session.ended', payload);
    const onMetricsStartup = (payload: BusEvents['metrics.startup']): void => send('metrics.startup', payload);
    const onMetricsRequest = (payload: BusEvents['metrics.request']): void => send('metrics.request', payload);
    const onMetricsCache = (payload: BusEvents['metrics.cache']): void => send('metrics.cache', payload);
    const onMetricsError = (payload: BusEvents['metrics.error']): void => send('metrics.error', payload);

    bus.on('server.status', onStatus);
    bus.on('log.line', onLine);
    bus.on('session.ended', onEnded);
    bus.on('metrics.startup', onMetricsStartup);
    bus.on('metrics.request', onMetricsRequest);
    bus.on('metrics.cache', onMetricsCache);
    bus.on('metrics.error', onMetricsError);

    const heartbeat = setInterval(() => {
      if (raw.destroyed || raw.writableEnded) return;
      raw.write(': ping\n\n');
    }, HEARTBEAT_MS);

    const cleanup = (): void => {
      clearInterval(heartbeat);
      bus.off('server.status', onStatus);
      bus.off('log.line', onLine);
      bus.off('session.ended', onEnded);
      bus.off('metrics.startup', onMetricsStartup);
      bus.off('metrics.request', onMetricsRequest);
      bus.off('metrics.cache', onMetricsCache);
      bus.off('metrics.error', onMetricsError);
    };

    request.raw.on('close', cleanup);
    raw.on('close', cleanup);
  });
}
