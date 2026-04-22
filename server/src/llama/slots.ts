import type { SlotState } from './types.js';

function asNumber(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

function asString(v: unknown): string | undefined {
  return typeof v === 'string' ? v : undefined;
}

function asBool(v: unknown): boolean | undefined {
  return typeof v === 'boolean' ? v : undefined;
}

function pickSamplingParams(record: Record<string, unknown>): SlotState['samplingParams'] | undefined {
  // llama.cpp exposes sampling params either inline or nested under "params".
  const src =
    (record.params as Record<string, unknown> | undefined) ??
    (record.sampling as Record<string, unknown> | undefined) ??
    record;
  const temperature = asNumber(src.temperature ?? src.temp);
  const topP = asNumber(src.top_p);
  const topK = asNumber(src.top_k);
  const minP = asNumber(src.min_p);
  const repeatPenalty = asNumber(src.repeat_penalty);
  if (
    temperature === undefined &&
    topP === undefined &&
    topK === undefined &&
    minP === undefined &&
    repeatPenalty === undefined
  ) {
    return undefined;
  }
  const out: SlotState['samplingParams'] = {};
  if (temperature !== undefined) out.temperature = temperature;
  if (topP !== undefined) out.topP = topP;
  if (topK !== undefined) out.topK = topK;
  if (minP !== undefined) out.minP = minP;
  if (repeatPenalty !== undefined) out.repeatPenalty = repeatPenalty;
  return out;
}

function nestedNextToken(record: Record<string, unknown>): Record<string, unknown> | null {
  // Newer llama.cpp nests per-request progress under next_token[0]; older
  // versions had n_decoded/has_new_line at the top level.
  const nt = record.next_token;
  if (Array.isArray(nt) && nt.length > 0 && nt[0] && typeof nt[0] === 'object') {
    return nt[0] as Record<string, unknown>;
  }
  return null;
}

export function normalizeSlots(raw: unknown): SlotState[] {
  if (!Array.isArray(raw)) return [];
  const slots: SlotState[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const r = entry as Record<string, unknown>;
    const id = asNumber(r.id);
    if (id === undefined) continue;
    const isProcessing =
      asBool(r.is_processing) ??
      asBool(r.processing) ??
      (asString(r.state) === 'processing');
    const slot: SlotState = {
      id,
      isProcessing: isProcessing ?? false,
    };
    const taskId = asNumber(r.id_task ?? r.task_id);
    if (taskId !== undefined && taskId >= 0) slot.taskId = taskId;
    const nPast = asNumber(r.n_past);
    if (nPast !== undefined) slot.nPast = nPast;
    const nCtx = asNumber(r.n_ctx);
    if (nCtx !== undefined) slot.nCtx = nCtx;
    const nPredict = asNumber(r.n_predict);
    if (nPredict !== undefined) slot.nPredict = nPredict;
    const nested = nestedNextToken(r);
    const nDecoded = asNumber(r.n_decoded) ?? (nested ? asNumber(nested.n_decoded) : undefined);
    if (nDecoded !== undefined) slot.nDecoded = nDecoded;
    const prompt = asString(r.prompt);
    if (prompt !== undefined) slot.prompt = prompt.length > 200 ? `${prompt.slice(0, 200)}…` : prompt;
    const stopped = asBool(r.stopped) ?? (nested ? asBool(nested.has_next_token) === false : undefined);
    if (stopped !== undefined) slot.stopped = stopped;
    const stoppingWord = asString(r.stopping_word);
    if (stoppingWord) slot.stoppingWord = stoppingWord;
    const params = pickSamplingParams(r);
    if (params) slot.samplingParams = params;
    slots.push(slot);
  }
  slots.sort((a, b) => a.id - b.id);
  return slots;
}
