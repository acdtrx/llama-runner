import { basename } from 'node:path';

import {
  METRICS_SCHEMA_VERSION,
  emptySessionMetrics,
} from './types.js';
import type {
  Backend,
  CachePromptState,
  ErrorEntry,
  ParserEvent,
  RequestMetrics,
  SessionMetrics,
} from './types.js';

const REQUESTS_RING_SIZE = 100;
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
  kvMeta: /^llama_model_loader:\s*-\s+kv\s+\d+:\s+(\S+)\s+\S+\s+=\s+(.+?)\s*$/,
  llamaContext: /^llama_context:\s+(\S+)\s+=\s+(\S+)/,
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
  promptEvalTime: /^prompt eval time\s*=\s*([\d.]+)\s*ms\s*\/\s*(\d+)\s+tokens\s*\(\s*[\d.]+\s*ms per token,\s*([\d.]+)\s*tokens per second\)/,
  evalTime: /^\s*eval time\s*=\s*([\d.]+)\s*ms\s*\/\s*(\d+)\s+tokens\s*\(\s*[\d.]+\s*ms per token,\s*([\d.]+)\s*tokens per second\)/,
  totalTime: /^\s*total time\s*=\s*([\d.]+)\s*ms/,
  cacheUpdateStart: /^srv\s+get_availabl:\s*updating prompt cache/,
  cacheState: /cache state:\s*(\d+)\s*prompts,\s*([\d.]+)\s*MiB\s*\(limits:\s*([\d.]+)\s*MiB,\s*(\d+)\s*tokens/,
  cachePrompt: /-\s+prompt\s+(0x[0-9a-f]+):\s+(\d+)\s+tokens,\s+checkpoints:\s+(\d+),\s+([\d.]+)\s+MiB/,
  cacheUpdateDone: /prompt cache update took\s+([\d.]+)\s+ms/,
  errorLike: /(^|\s)(error|warn|warning|panic|abort)[\s:]/i,
};

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

export class MetricsParser {
  private metrics: SessionMetrics = emptySessionMetrics();
  private phase: 'startup' | 'runtime' = 'startup';

  // Startup-phase accumulators
  private kvBufferReadings: number[] = [];
  private sawSwaHint = false;
  private computeBufferAccum = 0;

  // Per-request state
  private inFlightByTask = new Map<number, InFlightRequest>();
  private pendingSimilarityBySlot = new Map<number, number>();

  // Cache update buffer (between `updating prompt cache` and `prompt cache update took`)
  private cacheBuffer: CacheBuffer | null = null;

  feed(rawLine: string): ParserEvent[] {
    const line = rawLine.replace(/\r$/, '');
    const events: ParserEvent[] = [];

    this.feedCacheLimitsOnce(line);

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

  getSnapshot(): SessionMetrics {
    return this.metrics;
  }

  // --- startup ------------------------------------------------------------

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
    if ((m = RX.kvMeta.exec(line))) {
      const [, key, value] = m;
      if (key === 'general.size_label') s.model.sizeLabel = value;
      else if (key === 'general.quantized_by') s.model.quantizedBy = value;
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
  }

  private finalizeStartup(): void {
    const kv = this.metrics.startup.kvCache;
    if (this.computeBufferAccum > 0) kv.computeBufferMiB = this.computeBufferAccum;
    const primary = kv.primaryMiB ?? 0;
    const swa = kv.swaMiB ?? 0;
    if (primary > 0 || swa > 0) kv.totalMiB = primary + swa;
    if (this.metrics.startup.backend === undefined) this.metrics.startup.backend = 'cpu';
  }

  // --- requests -----------------------------------------------------------

  private feedRequestRules(line: string, events: ParserEvent[]): void {
    let m: RegExpExecArray | null;

    if ((m = RX.lcpSimilarity.exec(line))) {
      const sim = Number.parseFloat(m[1] ?? '0');
      // Attach to next launched task on any slot (we don't know which yet).
      // Record under a sentinel key to be consumed by the next real launch.
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
      if (taskId < 0) return; // sampler-chain debug print, ignore
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
      const inflight = this.latestInFlight();
      if (inflight) {
        inflight.httpMethod = method;
        inflight.endpoint = endpoint;
        inflight.clientIp = clientIp;
        inflight.httpStatus = Number.parseInt(status ?? '0', 10);
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

      const ring = this.metrics.requests;
      ring.push(req);
      if (ring.length > REQUESTS_RING_SIZE) ring.shift();

      const totals = this.metrics.totals;
      totals.requests += 1;
      if (req.promptTokens) totals.promptTokens += req.promptTokens;
      if (req.generatedTokens) totals.generatedTokens += req.generatedTokens;
      if ((req.cacheSimilarity ?? 0) > CACHE_HIT_THRESHOLD) totals.cacheHits += 1;

      events.push({ type: 'request', request: req, totals: { ...totals } });
    }
  }

  private latestInFlight(): InFlightRequest | null {
    let latest: InFlightRequest | null = null;
    for (const v of this.inFlightByTask.values()) {
      if (!latest || v.taskId > latest.taskId) latest = v;
    }
    return latest;
  }

  // --- cache --------------------------------------------------------------

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

  // --- errors -------------------------------------------------------------

  private feedErrorRules(line: string, events: ParserEvent[]): void {
    if (this.phase !== 'runtime' && !/^(error|warn)(ing)?[:\s]/i.test(line)) return;
    if (!RX.errorLike.test(line)) return;
    const severity: ErrorEntry['severity'] = /\b(error|panic|abort)\b/i.test(line) ? 'error' : 'warn';
    const entry: ErrorEntry = { at: nowIso(), severity, line };
    this.metrics.errors.push(entry);
    this.metrics.totals.errors += 1;
    events.push({ type: 'error', entry });
  }
}

export { METRICS_SCHEMA_VERSION };
