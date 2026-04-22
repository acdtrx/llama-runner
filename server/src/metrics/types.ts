export const METRICS_SCHEMA_VERSION = 1;

export type Backend = 'metal' | 'cuda' | 'cpu' | 'rocm' | 'vulkan' | 'unknown';

export interface StartupModel {
  path?: string;
  filename?: string;
  fileFormat?: string;
  fileType?: string;
  fileSizeGiB?: number;
  bpw?: number;
  architecture?: string;
  sizeLabel?: string;
  quantizedBy?: string;
  contextLengthTrained?: number;
}

export interface StartupContext {
  nCtx?: number;
  nCtxSeq?: number;
  nBatch?: number;
  nUbatch?: number;
  flashAttn?: string;
}

export interface StartupKvCache {
  primaryMiB?: number;
  swaMiB?: number;
  totalMiB?: number;
  computeBufferMiB?: number;
}

export interface StartupMetrics {
  buildInfo?: string;
  systemInfo?: string;
  backend?: Backend;
  deviceName?: string;
  deviceFreeMiB?: number;
  threads?: number;
  simdFeatures?: string[];
  model: StartupModel;
  context: StartupContext;
  kvCache: StartupKvCache;
  promptCacheLimitMiB?: number;
  promptCacheLimitTokens?: number;
  listeningUrl?: string;
}

export interface RequestMetrics {
  taskId: number;
  slotId: number;
  endpoint?: string;
  clientIp?: string;
  httpMethod?: string;
  httpStatus?: number;
  startedAt: string;
  completedAt?: string;
  promptTokens?: number;
  generatedTokens?: number;
  promptTokensPerSecond?: number;
  generationTokensPerSecond?: number;
  totalMs?: number;
  promptEvalMs?: number;
  evalMs?: number;
  cacheSimilarity?: number;
  finalNTokens?: number;
}

export interface CachePromptState {
  addr: string;
  tokens: number;
  checkpoints: number;
  sizeMiB: number;
}

export interface CacheState {
  promptsStored: number;
  usedMiB: number;
  limitMiB: number;
  limitTokens: number;
  prompts: CachePromptState[];
  updatedAt: string;
}

export interface TotalsMetrics {
  requests: number;
  promptTokens: number;
  generatedTokens: number;
  cacheHits: number;
  errors: number;
}

export interface ErrorEntry {
  at: string;
  severity: 'warn' | 'error';
  line: string;
}

export interface SessionMetrics {
  schemaVersion: number;
  startup: StartupMetrics;
  requests: RequestMetrics[];
  cache: CacheState | null;
  totals: TotalsMetrics;
  errors: ErrorEntry[];
}

export type ParserEvent =
  | { type: 'startup'; startup: StartupMetrics }
  | { type: 'request'; request: RequestMetrics; totals: TotalsMetrics }
  | { type: 'cache'; cache: CacheState }
  | { type: 'error'; entry: ErrorEntry };

export function emptySessionMetrics(): SessionMetrics {
  return {
    schemaVersion: METRICS_SCHEMA_VERSION,
    startup: { model: {}, context: {}, kvCache: {} },
    requests: [],
    cache: null,
    totals: { requests: 0, promptTokens: 0, generatedTokens: 0, cacheHits: 0, errors: 0 },
    errors: [],
  };
}
