import { useRuntimeStore } from '../stores/runtime';
import { formatCount, formatTokensPerSecond } from './format';

export function RuntimeMetricsCard(): React.ReactElement {
  const metrics = useRuntimeStore((s) => s.metrics);
  const slots = useRuntimeStore((s) => s.slots?.slots ?? null);

  if (!metrics) {
    return (
      <section className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
        <h3 className="text-xs font-semibold uppercase tracking-wide opacity-60">Runtime (live)</h3>
        <div className="mt-3 text-xs opacity-50">Waiting for /metrics…</div>
      </section>
    );
  }

  // KV fill: prefer the /metrics gauge when exposed; otherwise derive from
  // the per-slot n_past / n_ctx we already pull via /slots.
  let kvFill = metrics.kvCacheUsageRatio;
  let kvTokens = metrics.kvCacheTokens;
  if (kvFill === undefined && slots && slots.length > 0) {
    let maxPast = 0;
    let maxCtx = 0;
    for (const s of slots) {
      if (s.nPast !== undefined && s.nPast > maxPast) maxPast = s.nPast;
      if (s.nCtx !== undefined && s.nCtx > maxCtx) maxCtx = s.nCtx;
    }
    if (maxCtx > 0) {
      kvFill = maxPast / maxCtx;
      kvTokens = maxPast;
    }
  }
  const kvPct = kvFill ?? 0;
  const kvTone = kvPct >= 0.9 ? 'bg-red-500' : kvPct >= 0.8 ? 'bg-amber-500' : 'bg-sky-500';
  const processing = metrics.requestsProcessing ?? 0;
  const deferred = metrics.requestsDeferred ?? 0;

  return (
    <section className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide opacity-60">Runtime (live)</h3>
        <span className="text-[10px] opacity-40">{new Date(metrics.at).toLocaleTimeString()}</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4">
        <Gauge
          label="KV cache fill"
          value={kvFill !== undefined ? `${(kvPct * 100).toFixed(0)}%` : '—'}
          sub={kvTokens !== undefined ? `${kvTokens.toFixed(0)} tok` : kvFill === undefined ? 'n/a' : ''}
          fill={kvPct}
          color={kvTone}
          hideBar={kvFill === undefined}
        />
        <Gauge
          label="Queue"
          value={`${processing}`}
          sub={deferred > 0 ? `${deferred} deferred` : 'none deferred'}
          fill={Math.min(1, (processing + deferred) / Math.max(1, processing + deferred + 1))}
          color={deferred > 0 ? 'bg-amber-500' : 'bg-emerald-500'}
        />
        <RatePair
          label="Prompt rate"
          instant={metrics.promptTokensPerSecondInstant}
          avg={metrics.promptTokensPerSecond}
        />
        <RatePair
          label="Gen rate"
          instant={metrics.generationTokensPerSecondInstant}
          avg={metrics.generationTokensPerSecond}
        />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 text-[10px] opacity-50">
        {metrics.nTokensMax !== undefined && (
          <span>peak n_tokens: {formatCount(metrics.nTokensMax)}</span>
        )}
        {metrics.nDecodeTotal !== undefined && (
          <span>decodes: {formatCount(metrics.nDecodeTotal)}</span>
        )}
        {metrics.nBusySlotsPerDecode !== undefined && (
          <span>avg busy slots/decode: {metrics.nBusySlotsPerDecode.toFixed(2)}</span>
        )}
      </div>
    </section>
  );
}

interface GaugeProps {
  label: string;
  value: string;
  sub: string;
  fill: number;
  color: string;
  hideBar?: boolean;
}

function Gauge({ label, value, sub, fill, color, hideBar }: GaugeProps): React.ReactElement {
  const pct = Math.max(0, Math.min(1, fill)) * 100;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate opacity-60">{label}</span>
        <span className="shrink-0 font-mono opacity-40">{sub}</span>
      </div>
      <div className="mt-0.5 font-mono text-lg tabular-nums">{value}</div>
      {!hideBar && (
        <div className="mt-1 h-1 w-full overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
          <div
            className={`${color} h-full transition-[width] duration-500 ease-out`}
            style={{ width: `${pct}%` }}
          />
        </div>
      )}
    </div>
  );
}

function RatePair({ label, instant, avg }: { label: string; instant?: number; avg?: number }): React.ReactElement {
  // "now" only renders when tokens actually moved between samples, so idle
  // periods show "—" instead of 0 tok/s.
  const active = instant !== undefined && instant > 0;
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="truncate opacity-60">{label}</span>
      </div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className={`font-mono text-lg tabular-nums ${active ? '' : 'opacity-40'}`}>
          {active ? formatTokensPerSecond(instant) : '—'}
        </span>
        <span className="text-[10px] opacity-40">now</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-xs tabular-nums opacity-70">{formatTokensPerSecond(avg)}</span>
        <span className="text-[10px] opacity-40">avg</span>
      </div>
    </div>
  );
}
