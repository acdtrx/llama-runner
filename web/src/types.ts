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

export const RESERVED_FLAGS = ['--model', '-m', '--host', '--port', '-hf', '--metrics'] as const;

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

export type StopReason = 'eog' | 'limit' | 'word' | 'aborted' | 'unknown';

export interface BaseModelRef {
  name?: string;
  organization?: string;
  repoUrl?: string;
}

export interface ModelMetadata {
  license?: string;
  licenseLink?: string;
  repoUrl?: string;
  tags?: string[];
  baseModels?: BaseModelRef[];
  imatrixEntries?: number;
  imatrixChunks?: number;
  imatrixDataset?: string;
  nParamsBillion?: number;
  nVocab?: number;
  nMerges?: number;
}

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
  metadata?: ModelMetadata;
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

export interface GpuCapabilities {
  families: string[];
  unifiedMemory?: boolean;
  bfloat?: boolean;
  tensor?: boolean;
  residencySets?: boolean;
  sharedBuffers?: boolean;
  simdgroupReduction?: boolean;
  simdgroupMatmul?: boolean;
  recommendedMaxWorkingSetMiB?: number;
}

export interface ParamFit {
  projectedMiB?: number;
  freeMiB?: number;
  willLeaveMiB?: number;
  minRequiredFreeMiB?: number;
  durationMs?: number;
  outcome?: 'fit' | 'adjusted' | 'error';
}

export interface LayerOffload {
  layersOffloaded?: number;
  layersTotal?: number;
  outputLayerOffloaded?: boolean;
  cpuBufferMiB?: number;
  gpuBufferMiB?: number;
  gpuDeviceLabel?: string;
}

export interface TensorTypeHistogram {
  [type: string]: number;
}

export interface MultimodalInfo {
  hasVision?: boolean;
  hasAudio?: boolean;
  mmprojPath?: string;
  visionProjector?: string;
  audioProjector?: string;
  imageSize?: number;
  patchSize?: number;
  imageMinPixels?: number;
  imageMaxPixels?: number;
  visionModelSizeMiB?: number;
  audioModelSizeMiB?: number;
  audioSampleRate?: number;
  audioNMelBins?: number;
}

export interface ChatTemplateInfo {
  thinking?: boolean;
  exampleFormat?: string;
}

export interface ContextWarning {
  nCtxSeq: number;
  nCtxTrain: number;
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
  tensorTypes?: TensorTypeHistogram;
  gpuCapabilities?: GpuCapabilities;
  paramFit?: ParamFit;
  layerOffload?: LayerOffload;
  multimodal?: MultimodalInfo;
  chatTemplate?: ChatTemplateInfo;
  contextWarning?: ContextWarning;
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
  stopReason?: StopReason;
  stopWord?: string;
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
  stopReasons: Record<StopReason, number>;
}

export interface ErrorEntry {
  at: string;
  severity: 'warn' | 'error';
  line: string;
}

export interface ConfigNotice {
  at: string;
  severity: 'info' | 'warn';
  code: string;
  message: string;
}

export interface MemoryBreakdownDevice {
  label: string;
  totalMiB?: number;
  freeMiB?: number;
  selfMiB?: number;
  modelMiB?: number;
  contextMiB?: number;
  computeMiB?: number;
  unaccountedMiB?: number;
}

export interface MemoryBreakdownExit {
  at: string;
  devices: MemoryBreakdownDevice[];
}

export interface SessionMetrics {
  schemaVersion: number;
  startup: StartupMetrics;
  requests: RequestMetrics[];
  cache: CacheState | null;
  totals: TotalsMetrics;
  errors: ErrorEntry[];
  configNotices: ConfigNotice[];
  memoryBreakdownExit?: MemoryBreakdownExit;
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

export interface RuntimeMetricsSnapshot {
  at: string;
  counters: Record<string, number>;
  kvCacheUsageRatio?: number;
  kvCacheTokens?: number;
  requestsProcessing?: number;
  requestsDeferred?: number;
  nDecodeTotal?: number;
  nBusySlotsPerDecode?: number;
  nTokensMax?: number;
  promptTokensTotal: number;
  generationTokensTotal: number;
  promptTokensPerSecond?: number;
  generationTokensPerSecond?: number;
  promptTokensPerSecondInstant?: number;
  generationTokensPerSecondInstant?: number;
  requestsPerSecond?: number;
}

export interface SlotState {
  id: number;
  taskId?: number;
  isProcessing: boolean;
  nPast?: number;
  nCtx?: number;
  nPredict?: number;
  nDecoded?: number;
  prompt?: string;
  stopped?: boolean;
  stoppingWord?: string;
  samplingParams?: {
    temperature?: number;
    topP?: number;
    topK?: number;
    minP?: number;
    repeatPenalty?: number;
  };
}

export interface RuntimeSlotsSnapshot {
  at: string;
  slots: SlotState[];
}

export interface RuntimeNotice {
  at: string;
  severity: 'info' | 'warn' | 'error';
  code: string;
  message: string;
}

export interface SystemStatsEvent {
  at: string;
  system: {
    cpuPercent: number;
    cpuCores: number;
    memTotalMiB: number;
    memUsedMiB: number;
  };
  process: {
    pid: number;
    cpuPercent: number;
    rssMiB: number;
  } | null;
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
  telemetryIntervalMs: number;
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
