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
