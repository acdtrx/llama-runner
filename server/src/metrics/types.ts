export const METRICS_SCHEMA_VERSION = 2;

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

export type ParserEvent =
  | { type: 'startup'; startup: StartupMetrics }
  | { type: 'request'; request: RequestMetrics; totals: TotalsMetrics }
  | { type: 'cache'; cache: CacheState }
  | { type: 'error'; entry: ErrorEntry }
  | { type: 'notice'; notice: ConfigNotice }
  | { type: 'memory-breakdown'; breakdown: MemoryBreakdownExit };

export function emptyTotals(): TotalsMetrics {
  return {
    requests: 0,
    promptTokens: 0,
    generatedTokens: 0,
    cacheHits: 0,
    errors: 0,
    stopReasons: { eog: 0, limit: 0, word: 0, aborted: 0, unknown: 0 },
  };
}

export function emptySessionMetrics(): SessionMetrics {
  return {
    schemaVersion: METRICS_SCHEMA_VERSION,
    startup: { model: {}, context: {}, kvCache: {} },
    requests: [],
    cache: null,
    totals: emptyTotals(),
    errors: [],
    configNotices: [],
  };
}
