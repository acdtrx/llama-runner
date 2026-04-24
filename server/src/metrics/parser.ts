import { basename } from 'node:path';

import {
  METRICS_SCHEMA_VERSION,
  emptySessionMetrics,
} from './types.js';
import type {
  Backend,
  BaseModelRef,
  CachePromptState,
  ConfigNotice,
  ErrorEntry,
  MemoryBreakdownDevice,
  MemoryBreakdownExit,
  ModelMetadata,
  MultimodalInfo,
  ParserEvent,
  RequestMetrics,
  SessionMetrics,
  StopReason,
} from './types.js';

const REQUESTS_RING_SIZE = 100;
const ERRORS_RING_SIZE = 500;
const CACHE_HIT_THRESHOLD = 0.1;
const LISTENING_PREFIX = 'main: server is listening on ';

interface InFlightRequest {
  slotId: number;
  taskId: number;
  startedAt: string;
  cacheSimilarity?: number;
  promptTokensHint?: number;
  httpMethod?: string;
  endpoint?: string;
  clientIp?: string;
  httpStatus?: number;
  promptEvalMs?: number;
  evalMs?: number;
  totalMs?: number;
  promptTokens?: number;
  generatedTokens?: number;
  promptTokensPerSecond?: number;
  generationTokensPerSecond?: number;
  stopReason?: StopReason;
  stopWord?: string;
}

interface CacheBuffer {
  summary?: {
    promptsStored: number;
    usedMiB: number;
    limitMiB: number;
    limitTokens: number;
  };
  prompts: CachePromptState[];
}

// Endpoints our own runtime poller hits. Filter them out of log_server_r
// attachment so they don't contaminate user-driven request rows.
const POLLER_ENDPOINTS = new Set(['/slots', '/metrics', '/props', '/health']);

// How long we keep a just-finalized request available for late-attach of
// its log_server_r line (endpoint/method/status arrive AFTER slot release).
const LATE_ATTACH_WINDOW_MS = 5000;

interface FinalizedEntry {
  ref: RequestMetrics; // mutable reference — lives in the ring too
  finalizedAt: number;
}

const RX = {
  buildInfo: /^build_info:\s*(.+)$/,
  systemInfo: /^system_info:\s*(.*)$/,
  threads: /n_threads\s*=\s*(\d+)/,
  usingDevice: /using device (\S+)\s*\(([^)]+)\).*?(\d+)\s*MiB free/,
  loadModel: /load_model:\s*loading model '([^']+)'/,
  printInfoFileFormat: /^print_info:\s*file format\s*=\s*(.+?)\s*$/,
  printInfoFileType: /^print_info:\s*file type\s*=\s*(\S+)/,
  printInfoFileSize: /^print_info:\s*file size\s*=\s*([\d.]+)\s*GiB\s*\(([\d.]+)\s*BPW\)/,
  printInfoArch: /^print_info:\s*arch\s*=\s*(\S+)/,
  printInfoCtxTrain: /^print_info:\s*n_ctx_train\s*=\s*(\d+)/,
  printInfoModelParams: /^print_info:\s*model params\s*=\s*([\d.]+)\s*B/,
  printInfoNVocab: /^print_info:\s*n_vocab\s*=\s*(\d+)/,
  printInfoNMerges: /^print_info:\s*n_merges\s*=\s*(\d+)/,
  kvMeta: /^llama_model_loader:\s*-\s+kv\s+\d+:\s+(\S+)\s+\S+\s+=\s+(.+?)\s*$/,
  tensorType: /^llama_model_loader:\s*-\s+type\s+(\S+):\s*(\d+)\s+tensors/,
  llamaContext: /^llama_context:\s+(\S+)\s+=\s+(\S+)/,
  ctxSeqVsTrainWarning: /^llama_context:\s*n_ctx_seq\s*\((\d+)\)\s*<\s*n_ctx_train\s*\((\d+)\)/,
  kvBufferSize: /^llama_kv_cache:\s+\S+\s+KV buffer size\s*=\s*([\d.]+)\s*MiB/,
  kvCacheSwa: /^llama_kv_cache_iswa:\s+creating\s+SWA\s+KV cache/,
  computeBuffer: /compute buffer size\s*=\s*([\d.]+)\s*MiB/,
  cacheLimits: /limits:\s*([\d.]+)\s*MiB,\s*(\d+)\s*tokens/,
  listening: /^main:\s*server is listening on\s+(\S+)/,
  launchSlot: /^slot\s+launch_slot_:\s+id\s+(\d+)\s+\|\s+task\s+(-?\d+)\s+\|\s+processing task/,
  lcpSimilarity: /selected slot by LCP similarity,\s*sim_best\s*=\s*([\d.]+)/,
  lruSelection: /selected slot by LRU/,
  newPromptHint: /new prompt,[^|]*task\.n_tokens\s*=\s*(\d+)/,
  logServerR: /^srv\s+log_server_r:\s*done request:\s+(\S+)\s+(\S+)\s+(\S+)\s+(\d+)$/,
  slotReleasePrefix: /^slot\s+release:\s+id\s+(\d+)\s+\|\s+task\s+(\d+)/,
  slotReleaseFull: /^slot\s+release:\s+id\s+(\d+)\s+\|\s+task\s+(\d+).*?n_tokens\s*=\s*(\d+).*?truncated\s*=\s*(\d+)/,
  stopByLimit: /stop(?:ped)?(?:\s+by)?\s*(?:limit|max\s+tokens)/i,
  stopByWord: /stop(?:ped)?(?:\s+by)?\s*word\s*['"](.+?)['"]/i,
  stopByEog: /stop(?:ped)?(?:\s+by)?\s*(?:EOG|eos)\s*token/i,
  stopAborted: /stop(?:ped)?(?:\s+by)?\s*abort/i,
  promptEvalTime: /^prompt eval time\s*=\s*([\d.]+)\s*ms\s*\/\s*(\d+)\s+tokens\s*\(\s*[\d.]+\s*ms per token,\s*([\d.]+)\s*tokens per second\)/,
  evalTime: /^\s*eval time\s*=\s*([\d.]+)\s*ms\s*\/\s*(\d+)\s+tokens\s*\(\s*[\d.]+\s*ms per token,\s*([\d.]+)\s*tokens per second\)/,
  totalTime: /^\s*total time\s*=\s*([\d.]+)\s*ms/,
  cacheUpdateStart: /^srv\s+get_availabl:\s*updating prompt cache/,
  cacheState: /cache state:\s*(\d+)\s*prompts,\s*([\d.]+)\s*MiB\s*\(limits:\s*([\d.]+)\s*MiB,\s*(\d+)\s*tokens/,
  cachePrompt: /-\s+prompt\s+(0x[0-9a-f]+):\s+(\d+)\s+tokens,\s+checkpoints:\s+(\d+),\s+([\d.]+)\s+MiB/,
  cacheUpdateDone: /prompt cache update took\s+([\d.]+)\s+ms/,
  errorLike: /(^|\s)(error|warn|warning|panic|abort)[\s:]/i,

  // --- GPU capabilities (Metal) ---
  metalGpuFamily: /ggml_metal_device_init:\s*GPU family:\s*(\S+)/,
  metalHasUnified: /ggml_metal_device_init:\s*has unified memory\s*=\s*(true|false)/,
  metalHasBfloat: /ggml_metal_device_init:\s*has bfloat\s*=\s*(true|false)/,
  metalHasTensor: /ggml_metal_device_init:\s*has tensor\s*=\s*(true|false)/,
  metalUseResidencySets: /ggml_metal_device_init:\s*use residency sets\s*=\s*(true|false)/,
  metalUseSharedBuffers: /ggml_metal_device_init:\s*use shared buffers\s*=\s*(true|false)/,
  metalSimdReduction: /ggml_metal_device_init:\s*simdgroup reduction\s*=\s*(true|false)/,
  metalSimdMatmul: /ggml_metal_device_init:\s*simdgroup matrix mul\.\s*=\s*(true|false)/,
  metalRecommendedMax: /ggml_metal_device_init:\s*recommendedMaxWorkingSetSize\s*=\s*([\d.]+)\s*MB/,

  // --- param fit ---
  paramFitProjected: /llama_params_fit_impl:\s*projected to use\s+(\d+)\s*MiB of device memory vs\.\s*(\d+)\s*MiB of free device memory/,
  paramFitWillLeave: /llama_params_fit_impl:\s*will leave\s+(\d+)\s*>=\s*(\d+)\s*MiB of free device memory/,
  paramFitSuccess: /llama_params_fit:\s*successfully fit params/,
  paramFitAdjusted: /llama_params_fit:\s*adjusted params/i,
  paramFitDuration: /llama_params_fit:\s*fitting params to free memory took\s+([\d.]+)\s+seconds/,

  // --- layer offload ---
  layerOffloaded: /^load_tensors:\s*offloaded\s+(\d+)\/(\d+)\s+layers to GPU/,
  outputOffload: /^load_tensors:\s*offloading output layer to GPU/,
  bufferCpuMapped: /^load_tensors:\s*CPU_Mapped model buffer size\s*=\s*([\d.]+)\s*MiB/,
  bufferGpuMapped: /^load_tensors:\s*(\S+)_Mapped model buffer size\s*=\s*([\d.]+)\s*MiB/,

  // --- multimodal / CLIP ---
  clipHasVision: /^clip_model_loader:\s*has vision encoder/,
  clipHasAudio: /^clip_model_loader:\s*has audio encoder/,
  clipProjector: /^load_hparams:\s*projector:\s*(\S+)/,
  clipImageSize: /^load_hparams:\s*image_size:\s*(\d+)/,
  clipPatchSize: /^load_hparams:\s*patch_size:\s*(\d+)/,
  clipImageMinPixels: /^load_hparams:\s*image_min_pixels:\s*(\d+)/,
  clipImageMaxPixels: /^load_hparams:\s*image_max_pixels:\s*(\d+)/,
  clipAudioSampleRate: /^load_hparams:\s*audio_sample_rate:\s*(\d+)/,
  clipAudioNMelBins: /^load_hparams:\s*n_mel_bins:\s*(\d+)/,
  clipModelSize: /^load_hparams:\s*model size:\s*([\d.]+)\s*MiB/,
  visionHparamsMarker: /^---\s*vision hparams\s*---/,
  audioHparamsMarker: /^---\s*audio hparams\s*---/,
  mmprojLoaded: /^srv\s+load_model:\s*loaded multimodal model,\s*'([^']+)'/,

  // --- chat template ---
  chatTemplateThinking: /chat template,\s*thinking\s*=\s*(\d+)/,
  chatTemplateExampleStart: /chat template,\s*example_format:\s*'(.*)$/,

  // --- memory breakdown on exit ---
  memBreakdownHeader: /^llama_memory_breakdown_print:\s*\|\s*memory breakdown/,
  memBreakdownRow: /^llama_memory_breakdown_print:\s*\|\s*-\s*(.+?)\s*\|/,
};

// Silent-disable / config notice patterns. Each entry maps a substring or
// regex to a stable code + severity so the UI can group/filter.
interface NoticePattern {
  code: string;
  severity: 'info' | 'warn';
  match: (line: string) => string | null;
}

const NOTICE_PATTERNS: NoticePattern[] = [
  {
    code: 'CACHE_IDLE_SLOTS_DISABLED',
    severity: 'warn',
    match: (l) => (/--cache-idle-slots requires --kv-unified, disabling/.test(l) ? l : null),
  },
  {
    code: 'AUDIO_EXPERIMENTAL',
    severity: 'info',
    match: (l) =>
      /init_audio:\s*audio input is in experimental stage/.test(l) ? l : null,
  },
  {
    code: 'NO_REMOTE_PRESET',
    severity: 'info',
    match: (l) => (/no remote preset found, skipping/.test(l) ? l : null),
  },
  {
    code: 'DEPRECATED_FLAG',
    severity: 'warn',
    match: (l) =>
      /\bdeprecated\b.*\b(flag|option|argument)\b/i.test(l) ? l : null,
  },
  {
    code: 'FEATURE_DISABLED',
    severity: 'warn',
    match: (l) => (/\b(disabling|will be disabled|not supported)\b/i.test(l) ? l : null),
  },
];

function detectBackend(deviceToken: string): Backend {
  if (deviceToken.startsWith('MTL')) return 'metal';
  if (deviceToken.startsWith('CUDA')) return 'cuda';
  if (deviceToken.startsWith('ROCM')) return 'rocm';
  if (deviceToken.toLowerCase().startsWith('vulkan')) return 'vulkan';
  return 'unknown';
}

function nowIso(): string {
  return new Date().toISOString();
}

function parseTagsArray(raw: string): string[] {
  // llama-server renders tag arrays as ["foo", "bar", ...] or truncated.
  const out: string[] = [];
  for (const m of raw.matchAll(/"([^"]+)"/g)) {
    if (m[1]) out.push(m[1]);
  }
  return out;
}

export class MetricsParser {
  private metrics: SessionMetrics = emptySessionMetrics();
  private phase: 'startup' | 'runtime' = 'startup';

  private kvBufferReadings: number[] = [];
  private sawSwaHint = false;
  private computeBufferAccum = 0;

  private inFlightByTask = new Map<number, InFlightRequest>();
  private pendingSimilarityBySlot = new Map<number, number>();

  private cacheBuffer: CacheBuffer | null = null;
  private recentlyFinalized: FinalizedEntry[] = [];

  private clipMode: 'vision' | 'audio' | null = null;
  private chatTemplateCapture: { lines: string[] } | null = null;
  private emittedNoticeKeys = new Set<string>();
  private emittedMemoryBreakdown = false;
  private memoryBreakdownBuffer: MemoryBreakdownDevice[] | null = null;

  feed(rawLine: string): ParserEvent[] {
    const line = rawLine.replace(/\r$/, '');
    const events: ParserEvent[] = [];

    this.feedCacheLimitsOnce(line);
    this.feedNotices(line, events);
    this.feedMemoryBreakdown(line, events);

    if (this.chatTemplateCapture) {
      // Accumulate multi-line example_format body until we hit the closing '.
      if (line.endsWith("'")) {
        this.chatTemplateCapture.lines.push(line.slice(0, -1));
        this.metrics.startup.chatTemplate = {
          ...(this.metrics.startup.chatTemplate ?? {}),
          exampleFormat: this.chatTemplateCapture.lines.join('\n'),
        };
        this.chatTemplateCapture = null;
      } else {
        this.chatTemplateCapture.lines.push(line);
      }
    }

    if (this.phase === 'startup') {
      this.feedStartup(line);
      if (line.startsWith(LISTENING_PREFIX)) {
        this.finalizeStartup();
        this.metrics.startup.listeningUrl = line.slice(LISTENING_PREFIX.length).trim();
        this.phase = 'runtime';
        events.push({ type: 'startup', startup: this.metrics.startup });
      }
    }

    this.feedRequestRules(line, events);
    this.feedCacheRules(line, events);
    this.feedErrorRules(line, events);
    return events;
  }

  private feedCacheLimitsOnce(line: string): void {
    const s = this.metrics.startup;
    if (s.promptCacheLimitMiB !== undefined) return;
    const m = RX.cacheLimits.exec(line);
    if (m) {
      s.promptCacheLimitMiB = Number.parseFloat(m[1] ?? '0');
      s.promptCacheLimitTokens = Number.parseInt(m[2] ?? '0', 10);
    }
  }

  private feedNotices(line: string, events: ParserEvent[]): void {
    for (const p of NOTICE_PATTERNS) {
      const msg = p.match(line);
      if (!msg) continue;
      // Dedupe: one notice per (code, line) so a repeated pattern across
      // restarts-in-one-session doesn't flood.
      const key = `${p.code}:${msg}`;
      if (this.emittedNoticeKeys.has(key)) return;
      this.emittedNoticeKeys.add(key);
      const notice: ConfigNotice = {
        at: nowIso(),
        severity: p.severity,
        code: p.code,
        message: msg,
      };
      this.metrics.configNotices.push(notice);
      events.push({ type: 'notice', notice });
      return;
    }
  }

  private feedMemoryBreakdown(line: string, events: ParserEvent[]): void {
    if (this.emittedMemoryBreakdown) return;
    if (RX.memBreakdownHeader.test(line)) {
      this.memoryBreakdownBuffer = [];
      return;
    }
    if (!this.memoryBreakdownBuffer) return;
    const labelMatch = RX.memBreakdownRow.exec(line);
    if (labelMatch) {
      const label = labelMatch[1] ?? '';
      const numbers = Array.from(line.matchAll(/(\d+(?:\.\d+)?)/g))
        .map((m) => Number.parseFloat(m[1] ?? '0'))
        .filter((n) => Number.isFinite(n));
      const device: MemoryBreakdownDevice = { label };
      if (numbers.length >= 7) {
        // Device row: total = free + (self = model + context + compute) + unaccounted
        device.totalMiB = numbers[0];
        device.freeMiB = numbers[1];
        device.selfMiB = numbers[2];
        device.modelMiB = numbers[3];
        device.contextMiB = numbers[4];
        device.computeMiB = numbers[5];
        device.unaccountedMiB = numbers[6];
      } else if (numbers.length >= 4) {
        // Host row: self = model + context + compute (no total/free/unaccounted columns)
        device.selfMiB = numbers[0];
        device.modelMiB = numbers[1];
        device.contextMiB = numbers[2];
        device.computeMiB = numbers[3];
      }
      this.memoryBreakdownBuffer.push(device);
      return;
    }
    // Any non-matching line after header + at least one row finalizes the table.
    if (this.memoryBreakdownBuffer.length > 0) {
      const breakdown: MemoryBreakdownExit = {
        at: nowIso(),
        devices: this.memoryBreakdownBuffer,
      };
      this.metrics.memoryBreakdownExit = breakdown;
      this.emittedMemoryBreakdown = true;
      this.memoryBreakdownBuffer = null;
      events.push({ type: 'memory-breakdown', breakdown });
    }
  }

  getSnapshot(): SessionMetrics {
    return this.metrics;
  }

  private feedStartup(line: string): void {
    const s = this.metrics.startup;

    let m: RegExpExecArray | null;

    if ((m = RX.buildInfo.exec(line))) {
      s.buildInfo = m[1];
      return;
    }
    if ((m = RX.systemInfo.exec(line))) {
      s.systemInfo = m[1];
      const tm = RX.threads.exec(line);
      if (tm?.[1]) s.threads = Number.parseInt(tm[1], 10);
      const simd: string[] = [];
      for (const fm of line.matchAll(/\b([A-Z][A-Z0-9_]+)\s*=\s*1\b/g)) {
        if (fm[1]) simd.push(fm[1]);
      }
      if (simd.length > 0) s.simdFeatures = simd;
      return;
    }
    if ((m = RX.usingDevice.exec(line))) {
      const token = m[1] ?? '';
      s.backend = detectBackend(token);
      s.deviceName = m[2];
      s.deviceFreeMiB = Number.parseInt(m[3] ?? '0', 10);
      return;
    }
    if ((m = RX.loadModel.exec(line))) {
      s.model.path = m[1];
      if (m[1]) s.model.filename = basename(m[1]);
      return;
    }
    if ((m = RX.printInfoFileFormat.exec(line))) {
      s.model.fileFormat = m[1];
      return;
    }
    if ((m = RX.printInfoFileType.exec(line))) {
      s.model.fileType = m[1];
      return;
    }
    if ((m = RX.printInfoFileSize.exec(line))) {
      s.model.fileSizeGiB = Number.parseFloat(m[1] ?? '0');
      s.model.bpw = Number.parseFloat(m[2] ?? '0');
      return;
    }
    if ((m = RX.printInfoArch.exec(line))) {
      s.model.architecture = m[1];
      return;
    }
    if ((m = RX.printInfoCtxTrain.exec(line))) {
      s.model.contextLengthTrained = Number.parseInt(m[1] ?? '0', 10);
      return;
    }
    if ((m = RX.printInfoModelParams.exec(line))) {
      const md = ensureMetadata(s.model);
      md.nParamsBillion = Number.parseFloat(m[1] ?? '0');
      return;
    }
    if ((m = RX.printInfoNVocab.exec(line))) {
      const md = ensureMetadata(s.model);
      md.nVocab = Number.parseInt(m[1] ?? '0', 10);
      return;
    }
    if ((m = RX.printInfoNMerges.exec(line))) {
      const md = ensureMetadata(s.model);
      md.nMerges = Number.parseInt(m[1] ?? '0', 10);
      return;
    }
    if ((m = RX.kvMeta.exec(line))) {
      this.applyGgufKv(m[1] ?? '', m[2] ?? '');
      return;
    }
    if ((m = RX.tensorType.exec(line))) {
      const type = m[1] ?? '';
      const count = Number.parseInt(m[2] ?? '0', 10);
      if (!s.tensorTypes) s.tensorTypes = {};
      s.tensorTypes[type] = (s.tensorTypes[type] ?? 0) + count;
      return;
    }
    if ((m = RX.ctxSeqVsTrainWarning.exec(line))) {
      s.contextWarning = {
        nCtxSeq: Number.parseInt(m[1] ?? '0', 10),
        nCtxTrain: Number.parseInt(m[2] ?? '0', 10),
      };
      return;
    }
    if ((m = RX.llamaContext.exec(line))) {
      const [, key, value] = m;
      if (key === 'n_ctx') s.context.nCtx = Number.parseInt(value ?? '0', 10);
      else if (key === 'n_ctx_seq') s.context.nCtxSeq = Number.parseInt(value ?? '0', 10);
      else if (key === 'n_batch') s.context.nBatch = Number.parseInt(value ?? '0', 10);
      else if (key === 'n_ubatch') s.context.nUbatch = Number.parseInt(value ?? '0', 10);
      else if (key === 'flash_attn') s.context.flashAttn = value;
      return;
    }
    if (RX.kvCacheSwa.test(line)) {
      this.sawSwaHint = true;
      return;
    }
    if ((m = RX.kvBufferSize.exec(line))) {
      const mib = Number.parseFloat(m[1] ?? '0');
      this.kvBufferReadings.push(mib);
      if (this.kvBufferReadings.length === 1) {
        s.kvCache.primaryMiB = mib;
      } else if (this.sawSwaHint && s.kvCache.swaMiB === undefined) {
        s.kvCache.swaMiB = mib;
      }
      return;
    }
    if ((m = RX.computeBuffer.exec(line))) {
      this.computeBufferAccum += Number.parseFloat(m[1] ?? '0');
      return;
    }

    // --- GPU capabilities
    if ((m = RX.metalGpuFamily.exec(line))) {
      const caps = ensureGpuCaps(s);
      if (!caps.families.includes(m[1] ?? '')) caps.families.push(m[1] ?? '');
      return;
    }
    if ((m = RX.metalHasUnified.exec(line))) {
      ensureGpuCaps(s).unifiedMemory = m[1] === 'true';
      return;
    }
    if ((m = RX.metalHasBfloat.exec(line))) {
      ensureGpuCaps(s).bfloat = m[1] === 'true';
      return;
    }
    if ((m = RX.metalHasTensor.exec(line))) {
      ensureGpuCaps(s).tensor = m[1] === 'true';
      return;
    }
    if ((m = RX.metalUseResidencySets.exec(line))) {
      ensureGpuCaps(s).residencySets = m[1] === 'true';
      return;
    }
    if ((m = RX.metalUseSharedBuffers.exec(line))) {
      ensureGpuCaps(s).sharedBuffers = m[1] === 'true';
      return;
    }
    if ((m = RX.metalSimdReduction.exec(line))) {
      ensureGpuCaps(s).simdgroupReduction = m[1] === 'true';
      return;
    }
    if ((m = RX.metalSimdMatmul.exec(line))) {
      ensureGpuCaps(s).simdgroupMatmul = m[1] === 'true';
      return;
    }
    if ((m = RX.metalRecommendedMax.exec(line))) {
      ensureGpuCaps(s).recommendedMaxWorkingSetMiB = Number.parseFloat(m[1] ?? '0');
      return;
    }

    // --- param fit
    if ((m = RX.paramFitProjected.exec(line))) {
      const fit = ensureParamFit(s);
      fit.projectedMiB = Number.parseFloat(m[1] ?? '0');
      fit.freeMiB = Number.parseFloat(m[2] ?? '0');
      return;
    }
    if ((m = RX.paramFitWillLeave.exec(line))) {
      const fit = ensureParamFit(s);
      fit.willLeaveMiB = Number.parseFloat(m[1] ?? '0');
      fit.minRequiredFreeMiB = Number.parseFloat(m[2] ?? '0');
      return;
    }
    if (RX.paramFitSuccess.test(line)) {
      const fit = ensureParamFit(s);
      if (!fit.outcome) fit.outcome = 'fit';
      return;
    }
    if (RX.paramFitAdjusted.test(line)) {
      ensureParamFit(s).outcome = 'adjusted';
      return;
    }
    if ((m = RX.paramFitDuration.exec(line))) {
      ensureParamFit(s).durationMs = Number.parseFloat(m[1] ?? '0') * 1000;
      return;
    }

    // --- layer offload
    if (RX.outputOffload.test(line)) {
      const off = ensureLayerOffload(s);
      off.outputLayerOffloaded = true;
      return;
    }
    if ((m = RX.layerOffloaded.exec(line))) {
      const off = ensureLayerOffload(s);
      off.layersOffloaded = Number.parseInt(m[1] ?? '0', 10);
      off.layersTotal = Number.parseInt(m[2] ?? '0', 10);
      return;
    }
    if ((m = RX.bufferCpuMapped.exec(line))) {
      const off = ensureLayerOffload(s);
      off.cpuBufferMiB = Number.parseFloat(m[1] ?? '0');
      return;
    }
    if ((m = RX.bufferGpuMapped.exec(line))) {
      const deviceLabel = m[1] ?? '';
      if (deviceLabel !== 'CPU') {
        const off = ensureLayerOffload(s);
        off.gpuDeviceLabel = deviceLabel;
        off.gpuBufferMiB = Number.parseFloat(m[2] ?? '0');
      }
      return;
    }

    // --- multimodal
    if (RX.visionHparamsMarker.test(line)) {
      this.clipMode = 'vision';
      return;
    }
    if (RX.audioHparamsMarker.test(line)) {
      this.clipMode = 'audio';
      return;
    }
    if (RX.clipHasVision.test(line)) {
      ensureMultimodal(s).hasVision = true;
      return;
    }
    if (RX.clipHasAudio.test(line)) {
      ensureMultimodal(s).hasAudio = true;
      return;
    }
    if ((m = RX.clipProjector.exec(line))) {
      const mm = ensureMultimodal(s);
      const proj = m[1] ?? '';
      // llama.cpp convention: vision projectors end in 'v', audio in 'a'
      // (e.g. gemma4v, gemma4a). The projector line appears BEFORE the
      // --- vision/audio hparams --- marker, so clipMode is unreliable here.
      if (proj.endsWith('v')) mm.visionProjector = proj;
      else if (proj.endsWith('a')) mm.audioProjector = proj;
      return;
    }
    if ((m = RX.clipImageSize.exec(line))) {
      ensureMultimodal(s).imageSize = Number.parseInt(m[1] ?? '0', 10);
      return;
    }
    if ((m = RX.clipPatchSize.exec(line))) {
      ensureMultimodal(s).patchSize = Number.parseInt(m[1] ?? '0', 10);
      return;
    }
    if ((m = RX.clipImageMinPixels.exec(line))) {
      ensureMultimodal(s).imageMinPixels = Number.parseInt(m[1] ?? '0', 10);
      return;
    }
    if ((m = RX.clipImageMaxPixels.exec(line))) {
      ensureMultimodal(s).imageMaxPixels = Number.parseInt(m[1] ?? '0', 10);
      return;
    }
    if ((m = RX.clipAudioSampleRate.exec(line))) {
      ensureMultimodal(s).audioSampleRate = Number.parseInt(m[1] ?? '0', 10);
      return;
    }
    if ((m = RX.clipAudioNMelBins.exec(line))) {
      ensureMultimodal(s).audioNMelBins = Number.parseInt(m[1] ?? '0', 10);
      return;
    }
    if ((m = RX.clipModelSize.exec(line))) {
      const mm = ensureMultimodal(s);
      const size = Number.parseFloat(m[1] ?? '0');
      if (this.clipMode === 'vision') mm.visionModelSizeMiB = size;
      else if (this.clipMode === 'audio') mm.audioModelSizeMiB = size;
      return;
    }
    if ((m = RX.mmprojLoaded.exec(line))) {
      ensureMultimodal(s).mmprojPath = m[1];
      return;
    }

    // --- chat template
    if ((m = RX.chatTemplateThinking.exec(line))) {
      const t = this.metrics.startup.chatTemplate ?? {};
      t.thinking = m[1] === '1';
      this.metrics.startup.chatTemplate = t;
      return;
    }
    if ((m = RX.chatTemplateExampleStart.exec(line))) {
      const first = m[1] ?? '';
      // The example can either end on the same line (terminated by ') or
      // continue on subsequent lines. Handle both cases.
      if (first.endsWith("'")) {
        const t = this.metrics.startup.chatTemplate ?? {};
        t.exampleFormat = first.slice(0, -1);
        this.metrics.startup.chatTemplate = t;
      } else {
        this.chatTemplateCapture = { lines: first.length > 0 ? [first] : [] };
      }
      return;
    }
  }

  private applyGgufKv(key: string, rawValue: string): void {
    const s = this.metrics.startup;
    const md = ensureMetadata(s.model);
    const value = rawValue.trim();
    switch (key) {
      case 'general.size_label':
        s.model.sizeLabel = value;
        return;
      case 'general.quantized_by':
        s.model.quantizedBy = value;
        return;
      case 'general.license':
        md.license = value;
        return;
      case 'general.license.link':
        md.licenseLink = value;
        return;
      case 'general.repo_url':
        md.repoUrl = value;
        return;
      case 'general.tags': {
        const tags = parseTagsArray(value);
        if (tags.length > 0) md.tags = tags;
        return;
      }
      case 'quantize.imatrix.entries_count':
        md.imatrixEntries = Number.parseInt(value, 10);
        return;
      case 'quantize.imatrix.chunks_count':
        md.imatrixChunks = Number.parseInt(value, 10);
        return;
      case 'quantize.imatrix.dataset':
        md.imatrixDataset = value;
        return;
    }
    const baseMatch = /^general\.base_model\.(\d+)\.(\w+)/.exec(key);
    if (baseMatch) {
      const idx = Number.parseInt(baseMatch[1] ?? '0', 10);
      const field = baseMatch[2] ?? '';
      if (!md.baseModels) md.baseModels = [];
      while (md.baseModels.length <= idx) md.baseModels.push({});
      const entry = md.baseModels[idx] as BaseModelRef;
      if (field === 'name') entry.name = value;
      else if (field === 'organization') entry.organization = value;
      else if (field === 'repo_url') entry.repoUrl = value;
    }
  }

  private finalizeStartup(): void {
    const kv = this.metrics.startup.kvCache;
    if (this.computeBufferAccum > 0) kv.computeBufferMiB = this.computeBufferAccum;
    const primary = kv.primaryMiB ?? 0;
    const swa = kv.swaMiB ?? 0;
    if (primary > 0 || swa > 0) kv.totalMiB = primary + swa;
    if (this.metrics.startup.backend === undefined) this.metrics.startup.backend = 'cpu';
  }

  private feedRequestRules(line: string, events: ParserEvent[]): void {
    let m: RegExpExecArray | null;

    if ((m = RX.lcpSimilarity.exec(line))) {
      const sim = Number.parseFloat(m[1] ?? '0');
      this.pendingSimilarityBySlot.set(-1, sim);
      return;
    }
    if (RX.lruSelection.test(line)) {
      this.pendingSimilarityBySlot.set(-1, 0);
      return;
    }

    if ((m = RX.launchSlot.exec(line))) {
      const slotId = Number.parseInt(m[1] ?? '0', 10);
      const taskId = Number.parseInt(m[2] ?? '0', 10);
      if (taskId < 0) return;
      const inflight: InFlightRequest = {
        slotId,
        taskId,
        startedAt: nowIso(),
      };
      const pending = this.pendingSimilarityBySlot.get(-1);
      if (pending !== undefined) {
        inflight.cacheSimilarity = pending;
        this.pendingSimilarityBySlot.delete(-1);
      }
      this.inFlightByTask.set(taskId, inflight);
      return;
    }

    if ((m = RX.newPromptHint.exec(line))) {
      const inflight = this.latestInFlight();
      if (inflight) inflight.promptTokensHint = Number.parseInt(m[1] ?? '0', 10);
      return;
    }

    if ((m = RX.logServerR.exec(line))) {
      const [, method, endpoint, clientIp, status] = m;
      // Skip our own runtime poller's traffic (/slots, /metrics, etc.) so
      // it doesn't overwrite user-request metadata every second.
      if (endpoint && POLLER_ENDPOINTS.has(endpoint)) return;

      const inflight = this.latestInFlight();
      if (inflight) {
        inflight.httpMethod = method;
        inflight.endpoint = endpoint;
        inflight.clientIp = clientIp;
        inflight.httpStatus = Number.parseInt(status ?? '0', 10);
        return;
      }
      // Late-attach: the real log_server_r line arrives AFTER slot release
      // for most llama.cpp versions. Find the most recent finalized request
      // without endpoint info, within the attach window, and update it.
      const now = Date.now();
      while (this.recentlyFinalized.length > 0 && now - this.recentlyFinalized[0]!.finalizedAt > LATE_ATTACH_WINDOW_MS) {
        this.recentlyFinalized.shift();
      }
      for (let i = this.recentlyFinalized.length - 1; i >= 0; i -= 1) {
        const entry = this.recentlyFinalized[i]!;
        if (entry.ref.endpoint) continue;
        entry.ref.endpoint = endpoint;
        entry.ref.httpMethod = method;
        entry.ref.clientIp = clientIp;
        entry.ref.httpStatus = Number.parseInt(status ?? '0', 10);
        events.push({
          type: 'request',
          request: entry.ref,
          totals: { ...this.metrics.totals, stopReasons: { ...this.metrics.totals.stopReasons } },
        });
        break;
      }
      return;
    }

    if ((m = RX.promptEvalTime.exec(line))) {
      const inflight = this.latestInFlight();
      if (inflight) {
        inflight.promptEvalMs = Number.parseFloat(m[1] ?? '0');
        inflight.promptTokens = Number.parseInt(m[2] ?? '0', 10);
        inflight.promptTokensPerSecond = Number.parseFloat(m[3] ?? '0');
      }
      return;
    }
    if (!line.trimStart().startsWith('prompt eval time') && (m = RX.evalTime.exec(line))) {
      const inflight = this.latestInFlight();
      if (inflight) {
        inflight.evalMs = Number.parseFloat(m[1] ?? '0');
        inflight.generatedTokens = Number.parseInt(m[2] ?? '0', 10);
        inflight.generationTokensPerSecond = Number.parseFloat(m[3] ?? '0');
      }
      return;
    }
    if ((m = RX.totalTime.exec(line))) {
      const inflight = this.latestInFlight();
      if (inflight) inflight.totalMs = Number.parseFloat(m[1] ?? '0');
      return;
    }

    // Stop reasons: llama.cpp emits these on lines near the slot release. Attach
    // to the latest in-flight so we capture whichever slot just finished.
    const stopWordMatch = RX.stopByWord.exec(line);
    if (stopWordMatch) {
      const inflight = this.latestInFlight();
      if (inflight) {
        inflight.stopReason = 'word';
        inflight.stopWord = stopWordMatch[1];
      }
      return;
    }
    if (RX.stopByEog.test(line)) {
      const inflight = this.latestInFlight();
      if (inflight) inflight.stopReason = 'eog';
      return;
    }
    if (RX.stopByLimit.test(line)) {
      const inflight = this.latestInFlight();
      if (inflight) inflight.stopReason = 'limit';
      return;
    }
    if (RX.stopAborted.test(line)) {
      const inflight = this.latestInFlight();
      if (inflight) inflight.stopReason = 'aborted';
      return;
    }

    const rel = RX.slotReleaseFull.exec(line);
    if (rel) {
      const taskId = Number.parseInt(rel[2] ?? '0', 10);
      const finalTokens = Number.parseInt(rel[3] ?? '0', 10);
      const inflight = this.inFlightByTask.get(taskId);
      if (!inflight) return;
      this.inFlightByTask.delete(taskId);

      const completedAt = nowIso();
      const req: RequestMetrics = {
        taskId: inflight.taskId,
        slotId: inflight.slotId,
        startedAt: inflight.startedAt,
        completedAt,
        finalNTokens: finalTokens,
      };
      if (inflight.endpoint !== undefined) req.endpoint = inflight.endpoint;
      if (inflight.clientIp !== undefined) req.clientIp = inflight.clientIp;
      if (inflight.httpMethod !== undefined) req.httpMethod = inflight.httpMethod;
      if (inflight.httpStatus !== undefined) req.httpStatus = inflight.httpStatus;
      if (inflight.promptTokens !== undefined) req.promptTokens = inflight.promptTokens;
      else if (inflight.promptTokensHint !== undefined) req.promptTokens = inflight.promptTokensHint;
      if (inflight.generatedTokens !== undefined) req.generatedTokens = inflight.generatedTokens;
      if (inflight.promptTokensPerSecond !== undefined) req.promptTokensPerSecond = inflight.promptTokensPerSecond;
      if (inflight.generationTokensPerSecond !== undefined) req.generationTokensPerSecond = inflight.generationTokensPerSecond;
      if (inflight.promptEvalMs !== undefined) req.promptEvalMs = inflight.promptEvalMs;
      if (inflight.evalMs !== undefined) req.evalMs = inflight.evalMs;
      if (inflight.totalMs !== undefined) req.totalMs = inflight.totalMs;
      if (inflight.cacheSimilarity !== undefined) req.cacheSimilarity = inflight.cacheSimilarity;
      req.stopReason = inflight.stopReason ?? 'unknown';
      if (inflight.stopWord !== undefined) req.stopWord = inflight.stopWord;

      const ring = this.metrics.requests;
      ring.push(req);
      if (ring.length > REQUESTS_RING_SIZE) ring.shift();
      this.recentlyFinalized.push({ ref: req, finalizedAt: Date.now() });

      const totals = this.metrics.totals;
      totals.requests += 1;
      if (req.promptTokens) totals.promptTokens += req.promptTokens;
      if (req.generatedTokens) totals.generatedTokens += req.generatedTokens;
      if ((req.cacheSimilarity ?? 0) > CACHE_HIT_THRESHOLD) totals.cacheHits += 1;
      totals.stopReasons[req.stopReason] = (totals.stopReasons[req.stopReason] ?? 0) + 1;

      events.push({ type: 'request', request: req, totals: { ...totals, stopReasons: { ...totals.stopReasons } } });
    }
  }

  private latestInFlight(): InFlightRequest | null {
    let latest: InFlightRequest | null = null;
    for (const v of this.inFlightByTask.values()) {
      if (!latest || v.taskId > latest.taskId) latest = v;
    }
    return latest;
  }

  private feedCacheRules(line: string, events: ParserEvent[]): void {
    if (RX.cacheUpdateStart.test(line)) {
      this.cacheBuffer = { prompts: [] };
      return;
    }
    if (!this.cacheBuffer) return;

    let m: RegExpExecArray | null;

    if ((m = RX.cacheState.exec(line))) {
      this.cacheBuffer.summary = {
        promptsStored: Number.parseInt(m[1] ?? '0', 10),
        usedMiB: Number.parseFloat(m[2] ?? '0'),
        limitMiB: Number.parseFloat(m[3] ?? '0'),
        limitTokens: Number.parseInt(m[4] ?? '0', 10),
      };
      return;
    }
    if ((m = RX.cachePrompt.exec(line))) {
      this.cacheBuffer.prompts.push({
        addr: m[1] ?? '',
        tokens: Number.parseInt(m[2] ?? '0', 10),
        checkpoints: Number.parseInt(m[3] ?? '0', 10),
        sizeMiB: Number.parseFloat(m[4] ?? '0'),
      });
      return;
    }
    if (RX.cacheUpdateDone.test(line)) {
      const sum = this.cacheBuffer.summary;
      if (sum) {
        const state = {
          promptsStored: sum.promptsStored,
          usedMiB: sum.usedMiB,
          limitMiB: sum.limitMiB,
          limitTokens: sum.limitTokens,
          prompts: this.cacheBuffer.prompts,
          updatedAt: nowIso(),
        };
        this.metrics.cache = state;
        events.push({ type: 'cache', cache: state });
      }
      this.cacheBuffer = null;
    }
  }

  private feedErrorRules(line: string, events: ParserEvent[]): void {
    if (this.phase !== 'runtime' && !/^(error|warn)(ing)?[:\s]/i.test(line)) return;
    if (!RX.errorLike.test(line)) return;
    const severity: ErrorEntry['severity'] = /\b(error|panic|abort)\b/i.test(line) ? 'error' : 'warn';
    const entry: ErrorEntry = { at: nowIso(), severity, line };
    this.metrics.errors.push(entry);
    if (this.metrics.errors.length > ERRORS_RING_SIZE) {
      this.metrics.errors.splice(0, this.metrics.errors.length - ERRORS_RING_SIZE);
    }
    this.metrics.totals.errors += 1;
    events.push({ type: 'error', entry });
  }
}

function ensureMetadata(model: SessionMetrics['startup']['model']): ModelMetadata {
  if (!model.metadata) model.metadata = {};
  return model.metadata;
}

function ensureGpuCaps(startup: SessionMetrics['startup']): NonNullable<SessionMetrics['startup']['gpuCapabilities']> {
  if (!startup.gpuCapabilities) startup.gpuCapabilities = { families: [] };
  return startup.gpuCapabilities;
}

function ensureParamFit(startup: SessionMetrics['startup']): NonNullable<SessionMetrics['startup']['paramFit']> {
  if (!startup.paramFit) startup.paramFit = {};
  return startup.paramFit;
}

function ensureLayerOffload(startup: SessionMetrics['startup']): NonNullable<SessionMetrics['startup']['layerOffload']> {
  if (!startup.layerOffload) startup.layerOffload = {};
  return startup.layerOffload;
}

function ensureMultimodal(startup: SessionMetrics['startup']): MultimodalInfo {
  if (!startup.multimodal) startup.multimodal = {};
  return startup.multimodal;
}

export { METRICS_SCHEMA_VERSION };
