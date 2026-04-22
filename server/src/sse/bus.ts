import { EventEmitter } from 'node:events';

import type { ServerStatus } from '../process/llamaServer.js';
import type { SystemStatsPayload } from '../system/monitor.js';
import type {
  RuntimeMetricsSnapshot,
  RuntimeNotice,
  RuntimeSlotsSnapshot,
} from '../llama/types.js';
import type {
  CacheState,
  ConfigNotice,
  ErrorEntry,
  MemoryBreakdownExit,
  RequestMetrics,
  SessionMetrics,
  StartupMetrics,
  TotalsMetrics,
} from '../metrics/types.js';

export interface LogLineEvent {
  sessionId: string;
  at: string;
  lineId: number;
  stream: 'stdout' | 'stderr';
  noise: boolean;
  text: string;
}

export interface SessionEndedEvent {
  sessionId: string;
  profileId: string;
  endedAt: string;
  exitCode: number | null;
  exitSignal: NodeJS.Signals | null;
  crashed: boolean;
}

export interface MetricsStartupEvent {
  sessionId: string;
  startup: StartupMetrics;
}

export interface MetricsRequestEvent {
  sessionId: string;
  request: RequestMetrics;
  totals: TotalsMetrics;
}

export interface MetricsCacheEvent {
  sessionId: string;
  cache: CacheState;
}

export interface MetricsErrorEvent {
  sessionId: string;
  entry: ErrorEntry;
}

export interface MetricsNoticeEvent {
  sessionId: string;
  notice: ConfigNotice;
}

export interface MetricsMemoryBreakdownEvent {
  sessionId: string;
  breakdown: MemoryBreakdownExit;
}

export interface MetricsSnapshotEvent {
  sessionId: string;
  metrics: SessionMetrics;
}

export interface BusEvents {
  'server.status': ServerStatus;
  'log.line': LogLineEvent;
  'session.ended': SessionEndedEvent;
  'metrics.startup': MetricsStartupEvent;
  'metrics.request': MetricsRequestEvent;
  'metrics.cache': MetricsCacheEvent;
  'metrics.error': MetricsErrorEvent;
  'metrics.notice': MetricsNoticeEvent;
  'metrics.memory-breakdown': MetricsMemoryBreakdownEvent;
  'metrics.snapshot': MetricsSnapshotEvent;
  'system.stats': SystemStatsPayload;
  'runtime.metrics': RuntimeMetricsSnapshot;
  'runtime.slots': RuntimeSlotsSnapshot;
  'runtime.notice': RuntimeNotice;
}

export type BusEventName = keyof BusEvents;

class TypedBus extends EventEmitter {
  emitEvent<K extends BusEventName>(name: K, payload: BusEvents[K]): void {
    this.emit(name, payload);
  }

  override on<K extends BusEventName>(name: K, listener: (payload: BusEvents[K]) => void): this {
    return super.on(name, listener as (...args: unknown[]) => void);
  }

  override off<K extends BusEventName>(name: K, listener: (payload: BusEvents[K]) => void): this {
    return super.off(name, listener as (...args: unknown[]) => void);
  }
}

export const bus = new TypedBus();
bus.setMaxListeners(100);
