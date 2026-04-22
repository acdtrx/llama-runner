import type { RequestMetrics } from '../types';
import { formatCount, formatMs, formatTokensPerSecond } from './format';

interface Props {
  requests: RequestMetrics[];
}

export function RecentRequestsTable({ requests }: Props): React.ReactElement {
  const ordered = [...requests].reverse();
  return (
    <section className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="text-xs font-semibold uppercase tracking-wide opacity-60">Recent requests</h3>
      {ordered.length === 0 ? (
        <div className="mt-3 text-xs opacity-50">No requests yet.</div>
      ) : (
        <div className="mt-2 max-h-80 overflow-auto">
          <table className="w-full text-left text-xs">
            <thead className="sticky top-0 bg-white text-[10px] uppercase tracking-wide opacity-60 dark:bg-neutral-950">
              <tr>
                <th className="py-1 pr-2">Task</th>
                <th className="py-1 pr-2">Endpoint</th>
                <th className="py-1 pr-2 text-right">Prompt</th>
                <th className="py-1 pr-2 text-right">Gen</th>
                <th className="py-1 pr-2 text-right">Gen tok/s</th>
                <th className="py-1 pr-2 text-right">Total</th>
                <th className="py-1 pr-2 text-right">Sim</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {ordered.map((r) => (
                <tr key={`${r.taskId}-${r.startedAt}`} className="border-t border-neutral-200 dark:border-neutral-800">
                  <td className="py-1 pr-2">{r.taskId}</td>
                  <td className="py-1 pr-2 truncate max-w-[14rem]" title={r.endpoint ?? ''}>
                    {r.endpoint ?? '—'}
                  </td>
                  <td className="py-1 pr-2 text-right">{r.promptTokens !== undefined ? formatCount(r.promptTokens) : '—'}</td>
                  <td className="py-1 pr-2 text-right">{r.generatedTokens !== undefined ? formatCount(r.generatedTokens) : '—'}</td>
                  <td className="py-1 pr-2 text-right">{formatTokensPerSecond(r.generationTokensPerSecond)}</td>
                  <td className="py-1 pr-2 text-right">{formatMs(r.totalMs)}</td>
                  <td className="py-1 pr-2 text-right">
                    {r.cacheSimilarity !== undefined ? r.cacheSimilarity.toFixed(2) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
