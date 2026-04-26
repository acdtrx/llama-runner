import { readSettings } from '../config/settings.js';
import { llamaServer } from '../process/llamaServer.js';
import { bus } from '../sse/bus.js';
import { fetchMetricsText, fetchSlots, LlamaServerNotFound, LlamaServerUnreachable } from './client.js';
import { parsePrometheusText } from './prometheus.js';
import { normalizeSlots } from './slots.js';
import type {
  RuntimeMetricsSnapshot,
  RuntimeNotice,
  RuntimeSlotsSnapshot,
  SlotState,
} from './types.js';

const FALLBACK_INTERVAL_MS = 1000;

interface PrevCounters {
  at: number;
  promptTokens: number;
  requestsTotal: number;
}

interface PrevSlotsSample {
  at: number;
  byId: Map<number, { nPast: number; nDecoded: number; isProcessing: boolean }>;
}

let metricsAvailable = true;
let metricsNoticeSent = false;
let prev: PrevCounters | null = null;
let prevSlots: PrevSlotsSample | null = null;
let runningSessionId: string | null = null;

// Last emitted snapshots, retained so that clients reconnecting (e.g. after a
// page refresh) mid-session can be replayed the current runtime state instead
// of waiting for the next poller tick — which may be a full interval away, or
// never arrive if all slots are idle (poller is activity-gated).
let lastMetricsSnapshot: RuntimeMetricsSnapshot | null = null;
let lastSlotsSnapshot: RuntimeSlotsSnapshot | null = null;

// Polling is gated on actual activity to avoid waking llama-server's
// scheduler with HTTP noise when idle. We detect activity by watching the
// log stream for slot launch / release lines. When activeCount > 0 we
// poll; when it drops to 0 we do one trailing tick to capture final state.
let activeCount = 0;
let trailingTicksRemaining = 0;
let wakeUpTick: (() => void) | null = null;

function reset(): void {
  metricsAvailable = true;
  metricsNoticeSent = false;
  prev = null;
  prevSlots = null;
  activeCount = 0;
  trailingTicksRemaining = 0;
  lastMetricsSnapshot = null;
  lastSlotsSnapshot = null;
}

export function getLastRuntimeMetrics(): RuntimeMetricsSnapshot | null {
  return lastMetricsSnapshot;
}

export function getLastRuntimeSlots(): RuntimeSlotsSnapshot | null {
  return lastSlotsSnapshot;
}

function snapshotSlots(slots: SlotState[], at: number): PrevSlotsSample {
  const byId = new Map<number, { nPast: number; nDecoded: number; isProcessing: boolean }>();
  for (const s of slots) {
    byId.set(s.id, {
      nPast: s.nPast ?? 0,
      nDecoded: s.nDecoded ?? 0,
      isProcessing: s.isProcessing,
    });
  }
  return { at, byId };
}

// Instant generation rate from /slots n_decoded deltas. n_decoded advances
// once per generated token (real-time). When a new request starts, n_decoded
// resets to 0 or a lower value — treat that as a reset, not a negative rate.
function computeInstantGenRate(
  slots: SlotState[],
  prevSample: PrevSlotsSample | null,
  nowMs: number,
): number | undefined {
  if (!prevSample) return undefined;
  const dt = (nowMs - prevSample.at) / 1000;
  if (dt <= 0) return undefined;
  let maxDelta = 0;
  for (const slot of slots) {
    const before = prevSample.byId.get(slot.id);
    if (!before) continue;
    const nDecoded = slot.nDecoded ?? 0;
    const dDecoded = nDecoded - before.nDecoded;
    if (dDecoded > 0 && dDecoded > maxDelta) maxDelta = dDecoded;
  }
  return maxDelta > 0 ? maxDelta / dt : undefined;
}

function emitNotice(notice: Omit<RuntimeNotice, 'at'>): void {
  bus.emitEvent('runtime.notice', { at: new Date().toISOString(), ...notice });
}

async function fetchMetricsCounters(): Promise<Record<string, number> | null> {
  if (!metricsAvailable) return null;
  try {
    const text = await fetchMetricsText();
    return parsePrometheusText(text);
  } catch (err) {
    if (err instanceof LlamaServerNotFound) {
      metricsAvailable = false;
      if (!metricsNoticeSent) {
        metricsNoticeSent = true;
        emitNotice({
          severity: 'warn',
          code: 'METRICS_UNAVAILABLE',
          message:
            'llama-server /metrics endpoint returned 404. --metrics is auto-injected; your llama-server build may be too old to support it.',
        });
      }
      return null;
    }
    return null; // transient unreachable
  }
}

async function fetchSlotsNormalized(): Promise<SlotState[] | null> {
  try {
    const raw = await fetchSlots();
    return normalizeSlots(raw);
  } catch (err) {
    if (err instanceof LlamaServerNotFound) return null;
    if (err instanceof LlamaServerUnreachable) return null;
    return null;
  }
}

const LAUNCH_RE = /^slot\s+launch_slot_:\s+id\s+\d+\s+\|\s+task\s+(-?\d+)/;
const RELEASE_RE = /^slot\s+release:\s+id\s+\d+\s+\|\s+task\s+\d+/;

export function startRuntimePoller(dataDir: string): void {
  // Reset derived state across sessions so rates aren't computed with stale
  // counters from a prior llama-server invocation.
  llamaServer.on('status', (status) => {
    if (status.state === 'running' && status.sessionId !== runningSessionId) {
      runningSessionId = status.sessionId;
      reset();
    }
    if (status.state !== 'running') {
      runningSessionId = null;
      lastMetricsSnapshot = null;
      lastSlotsSnapshot = null;
    }
  });

  // Listen to the log stream for activity transitions. Increment on
  // launch_slot_, decrement on release. Immediately wake up the tick on
  // activation so the UI sees the first sample without waiting a full
  // polling interval.
  bus.on('log.line', (evt) => {
    const launchMatch = LAUNCH_RE.exec(evt.text);
    if (launchMatch) {
      const taskId = Number.parseInt(launchMatch[1] ?? '0', 10);
      if (taskId < 0) return; // sampler-chain debug print, not a real launch
      const wasIdle = activeCount === 0;
      activeCount += 1;
      if (wasIdle && wakeUpTick) wakeUpTick();
      return;
    }
    if (RELEASE_RE.test(evt.text)) {
      activeCount = Math.max(0, activeCount - 1);
      if (activeCount === 0) trailingTicksRemaining = 1;
      return;
    }
  });

  let stopped = false;

  let currentTimer: NodeJS.Timeout | null = null;
  const scheduleNext = async (): Promise<void> => {
    if (stopped) return;
    let interval = FALLBACK_INTERVAL_MS;
    try {
      const settings = await readSettings(dataDir);
      interval = settings.telemetryIntervalMs;
    } catch {
      // fallback
    }
    currentTimer = setTimeout(() => {
      currentTimer = null;
      void tick().finally(scheduleNext);
    }, interval);
    currentTimer.unref();
  };
  wakeUpTick = (): void => {
    if (stopped) return;
    if (currentTimer) {
      clearTimeout(currentTimer);
      currentTimer = null;
    }
    void tick().finally(scheduleNext);
  };

  const tick = async (): Promise<void> => {
    const status = llamaServer.getStatus();
    if (status.state !== 'running' || !status.listeningUrl) return;

    // Gate all HTTP polling on observed log activity. llama-server's
    // scheduler logs "update_slots: all slots are idle" on every HTTP
    // request to /metrics and /slots, so idle-time polling fills the log.
    if (activeCount === 0 && trailingTicksRemaining === 0) return;
    // Trailing tick: no slot is active right now, we're firing one last time
    // to flush the final idle state (KV fill, queue, counters). The instant
    // rate deltas would still be positive from tokens decoded between the
    // last mid-gen sample and now, so clear them explicitly — otherwise the
    // UI's "now" value sticks at the last mid-gen reading until the next
    // request starts.
    const isTrailingTick = activeCount === 0 && trailingTicksRemaining > 0;
    if (isTrailingTick) trailingTicksRemaining -= 1;

    const nowMs = Date.now();
    const counters = await fetchMetricsCounters();
    const slots = await fetchSlotsNormalized();

    if (slots !== null) {
      const slotsSnapshot: RuntimeSlotsSnapshot = { at: new Date(nowMs).toISOString(), slots };
      lastSlotsSnapshot = slotsSnapshot;
      bus.emitEvent('runtime.slots', slotsSnapshot);
    }

    if (counters !== null) {
      const promptTokens = counters['llamacpp:prompt_tokens_total'] ?? 0;
      const generationTokens = counters['llamacpp:tokens_predicted_total'] ?? 0;
      const requestsTotal = counters['llamacpp:n_decode_total'] ?? 0;
      const promptTokensPerSecond = counters['llamacpp:prompt_tokens_seconds'];
      const generationTokensPerSecond = counters['llamacpp:predicted_tokens_seconds'];

      // Gen rate from /slots n_decoded delta (per-token, real-time).
      // Prompt rate from /metrics counter delta — llama-server bumps
      // prompt_tokens_total at batch boundaries during prompt processing,
      // so this catches prompt progress even though /slots doesn't expose
      // n_past in this build.
      const genPerSec = isTrailingTick
        ? undefined
        : slots
          ? computeInstantGenRate(slots, prevSlots, nowMs)
          : undefined;

      let promptPerSec: number | undefined;
      let requestsPerSecond: number | undefined;
      if (prev) {
        const dtSec = (nowMs - prev.at) / 1000;
        if (dtSec > 0) {
          const dPrompt = promptTokens - prev.promptTokens;
          if (dPrompt > 0 && !isTrailingTick) promptPerSec = dPrompt / dtSec;
          requestsPerSecond = (requestsTotal - prev.requestsTotal) / dtSec;
        }
      }
      prev = { at: nowMs, promptTokens, requestsTotal };

      const snapshot: RuntimeMetricsSnapshot = {
        at: new Date(nowMs).toISOString(),
        counters,
        kvCacheUsageRatio: counters['llamacpp:kv_cache_usage_ratio'],
        kvCacheTokens: counters['llamacpp:kv_cache_tokens'],
        requestsProcessing: counters['llamacpp:requests_processing'],
        requestsDeferred: counters['llamacpp:requests_deferred'],
        nDecodeTotal: counters['llamacpp:n_decode_total'],
        nBusySlotsPerDecode: counters['llamacpp:n_busy_slots_per_decode'],
        nTokensMax: counters['llamacpp:n_tokens_max'],
        promptTokensTotal: promptTokens,
        generationTokensTotal: generationTokens,
        promptTokensPerSecond,
        generationTokensPerSecond,
        promptTokensPerSecondInstant: promptPerSec,
        generationTokensPerSecondInstant: genPerSec,
        requestsPerSecond,
      };
      lastMetricsSnapshot = snapshot;
      bus.emitEvent('runtime.metrics', snapshot);
    }

    if (slots !== null) {
      prevSlots = snapshotSlots(slots, nowMs);
    }
  };

  void scheduleNext();
}
