import type { StopReason, TotalsMetrics } from '../types';
import { formatCount, formatPercent } from './format';

interface Props {
  totals: TotalsMetrics;
}

const STOP_LABELS: Record<StopReason, string> = {
  eog: 'EOG',
  limit: 'limit',
  word: 'stop word',
  aborted: 'aborted',
  unknown: '—',
};

export function TotalsCard({ totals }: Props): React.ReactElement {
  const hitRate = totals.requests > 0 ? totals.cacheHits / totals.requests : 0;
  const stopEntries = (Object.entries(totals.stopReasons ?? {}) as [StopReason, number][])
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1]);
  // Some llama.cpp builds never emit a parseable stop reason, so only
  // "unknown" would ever be counted. Don't render a section full of em-dashes.
  const showStopReasons = stopEntries.some(([reason]) => reason !== 'unknown');

  return (
    <section className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="text-xs font-semibold uppercase tracking-wide opacity-60">Totals</h3>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <Tile label="Requests" value={formatCount(totals.requests)} />
        <Tile label="Cache hit rate" value={formatPercent(hitRate)} />
        <Tile label="Prompt tokens" value={formatCount(totals.promptTokens)} />
        <Tile label="Generated tokens" value={formatCount(totals.generatedTokens)} />
        {totals.errors > 0 && (
          <Tile label="Errors" value={String(totals.errors)} tone="error" />
        )}
      </div>
      {showStopReasons && (
        <div className="mt-3 border-t border-neutral-200 pt-2 dark:border-neutral-800">
          <div className="text-[10px] uppercase tracking-wide opacity-50">Stop reasons</div>
          <dl className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {stopEntries.map(([reason, n]) => (
              <div key={reason} className="flex justify-between font-mono">
                <span className="opacity-60">{STOP_LABELS[reason] ?? reason}</span>
                <span>{n}</span>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'error' }): React.ReactElement {
  return (
    <div>
      <div className="text-xs opacity-60">{label}</div>
      <div
        className={`mt-0.5 font-mono text-xl ${tone === 'error' ? 'text-red-600' : ''}`}
      >
        {value}
      </div>
    </div>
  );
}
