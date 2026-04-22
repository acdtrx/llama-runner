import type { CacheState } from '../types';
import { formatMiB, formatCount } from './format';

interface Props {
  cache: CacheState | null;
  limitMiB: number | undefined;
  limitTokens: number | undefined;
}

export function PromptCacheCard({ cache, limitMiB, limitTokens }: Props): React.ReactElement {
  const used = cache?.usedMiB ?? 0;
  const limit = cache?.limitMiB ?? limitMiB ?? 0;
  const pct = limit > 0 ? Math.min(used / limit, 1) : 0;
  return (
    <section className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="text-xs font-semibold uppercase tracking-wide opacity-60">Prompt cache</h3>
      {!cache ? (
        <div className="mt-3 text-xs opacity-50">
          {limit > 0 ? `Limit ${formatMiB(limit)} · ${formatCount(limitTokens ?? 0)} tokens` : 'Waiting…'}
        </div>
      ) : (
        <>
          <div className="mt-3 flex items-baseline justify-between">
            <div className="font-mono text-lg">{formatMiB(used)}</div>
            <div className="text-xs opacity-60">
              of {formatMiB(limit)} · {(pct * 100).toFixed(0)}%
            </div>
          </div>
          <div className="mt-1 h-2 w-full overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
            <div className="h-full bg-violet-500" style={{ width: `${pct * 100}%` }} />
          </div>
          <div className="mt-3 text-xs opacity-60">
            {cache.promptsStored} cached {cache.promptsStored === 1 ? 'prompt' : 'prompts'} · limit{' '}
            {formatCount(cache.limitTokens)} tokens
          </div>
          {cache.prompts.length > 0 && (
            <ul className="mt-2 space-y-1 text-[11px]">
              {cache.prompts.slice(0, 6).map((p) => (
                <li key={p.addr} className="flex justify-between font-mono">
                  <span className="opacity-60">{p.addr}</span>
                  <span>{formatCount(p.tokens)} tok · {p.checkpoints} cp · {formatMiB(p.sizeMiB)}</span>
                </li>
              ))}
              {cache.prompts.length > 6 && (
                <li className="text-center opacity-40">+{cache.prompts.length - 6} more</li>
              )}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
