import type { TotalsMetrics } from '../types';
import { formatCount, formatPercent } from './format';

interface Props {
  totals: TotalsMetrics;
}

export function TotalsCard({ totals }: Props): React.ReactElement {
  const hitRate = totals.requests > 0 ? totals.cacheHits / totals.requests : 0;
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
