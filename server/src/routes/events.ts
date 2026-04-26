import type { FastifyInstance } from 'fastify';

import { bus } from '../sse/bus.js';
import type { BusEventName, BusEvents } from '../sse/bus.js';
import { llamaServer } from '../process/llamaServer.js';
import { getActiveMetricsSnapshot } from '../logs/pipeline.js';
import { getLastRuntimeMetrics, getLastRuntimeSlots } from '../llama/runtimePoller.js';

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
    //   - runtime.metrics / runtime.slots (last poller emission; cleared on
    //     session change/stop, so non-null implies current data)
    send('server.status', llamaServer.getStatus());
    const snapshot = getActiveMetricsSnapshot();
    if (snapshot) {
      send('metrics.snapshot', { sessionId: snapshot.sessionId, metrics: snapshot.metrics });
    }
    const lastRuntimeMetrics = getLastRuntimeMetrics();
    if (lastRuntimeMetrics) send('runtime.metrics', lastRuntimeMetrics);
    const lastRuntimeSlots = getLastRuntimeSlots();
    if (lastRuntimeSlots) send('runtime.slots', lastRuntimeSlots);
    send('ready', { at: new Date().toISOString() });

    const onStatus = (payload: BusEvents['server.status']): void => send('server.status', payload);
    const onLine = (payload: BusEvents['log.line']): void => send('log.line', payload, payload.lineId);
    const onEnded = (payload: BusEvents['session.ended']): void => send('session.ended', payload);
    const onMetricsStartup = (payload: BusEvents['metrics.startup']): void => send('metrics.startup', payload);
    const onMetricsRequest = (payload: BusEvents['metrics.request']): void => send('metrics.request', payload);
    const onMetricsCache = (payload: BusEvents['metrics.cache']): void => send('metrics.cache', payload);
    const onMetricsError = (payload: BusEvents['metrics.error']): void => send('metrics.error', payload);
    const onMetricsNotice = (payload: BusEvents['metrics.notice']): void => send('metrics.notice', payload);
    const onMetricsMemoryBreakdown = (payload: BusEvents['metrics.memory-breakdown']): void =>
      send('metrics.memory-breakdown', payload);
    const onSystemStats = (payload: BusEvents['system.stats']): void => send('system.stats', payload);
    const onRuntimeMetrics = (payload: BusEvents['runtime.metrics']): void => send('runtime.metrics', payload);
    const onRuntimeSlots = (payload: BusEvents['runtime.slots']): void => send('runtime.slots', payload);
    const onRuntimeNotice = (payload: BusEvents['runtime.notice']): void => send('runtime.notice', payload);

    bus.on('server.status', onStatus);
    bus.on('log.line', onLine);
    bus.on('session.ended', onEnded);
    bus.on('metrics.startup', onMetricsStartup);
    bus.on('metrics.request', onMetricsRequest);
    bus.on('metrics.cache', onMetricsCache);
    bus.on('metrics.error', onMetricsError);
    bus.on('metrics.notice', onMetricsNotice);
    bus.on('metrics.memory-breakdown', onMetricsMemoryBreakdown);
    bus.on('system.stats', onSystemStats);
    bus.on('runtime.metrics', onRuntimeMetrics);
    bus.on('runtime.slots', onRuntimeSlots);
    bus.on('runtime.notice', onRuntimeNotice);

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
      bus.off('metrics.notice', onMetricsNotice);
      bus.off('metrics.memory-breakdown', onMetricsMemoryBreakdown);
      bus.off('system.stats', onSystemStats);
      bus.off('runtime.metrics', onRuntimeMetrics);
      bus.off('runtime.slots', onRuntimeSlots);
      bus.off('runtime.notice', onRuntimeNotice);
    };

    request.raw.on('close', cleanup);
    raw.on('close', cleanup);
  });
}
