export type ModelSource = 'file' | 'hf';

export interface Profile {
  id: string;
  name: string;
  description?: string;
  modelSource: ModelSource;
  modelFile?: string;
  modelRepo?: string;
  argsLine: string;
  clonedFromTemplateId?: string;
  createdAt: string;
  updatedAt: string;
}

export type NewProfile = Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>;

export interface PredefinedTemplate {
  id: string;
  name: string;
  description?: string;
  modelSource: ModelSource;
  modelFile?: string;
  modelRepo?: string;
  argsLine: string;
  tags?: string[];
}

export interface PredefinedProfiles {
  version: number;
  templates: PredefinedTemplate[];
}

export const RESERVED_FLAGS = ['--model', '-m', '--host', '--port', '-hf'] as const;

export type ServerState = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped' | 'crashed';

export interface ServerStatus {
  state: ServerState;
  profileId: string | null;
  sessionId: string | null;
  startedAt: string | null;
  pid: number | null;
  listeningUrl: string | null;
}

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
  exitSignal: string | null;
  crashed: boolean;
}

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

export interface MetricsSnapshotEvent {
  sessionId: string;
  metrics: SessionMetrics;
}

export interface SessionSummary {
  sessionId: string;
  profileId: string;
  profileSnapshot: Profile;
  settingsSnapshot?: {
    llamaServerBinaryPath: string;
    modelsDir: string;
    llamaServerHost: string;
    llamaServerPort: number;
  };
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  exitSignal?: string;
  crashed?: boolean;
}

export interface Settings {
  llamaServerBinaryPath: string;
  modelsDir: string;
  llamaServerHost: string;
  llamaServerPort: number;
  sessionsPerProfileLimit: number;
  uiNoiseFilterEnabledByDefault: boolean;
}

export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PRECONDITION_FAILED'
  | 'RESERVED_FLAG'
  | 'NOT_CONFIGURED'
  | 'INTERNAL_ERROR';

export interface ApiError {
  code: ErrorCode;
  message: string;
  details?: { field?: string; path?: string } & Record<string, unknown>;
}
