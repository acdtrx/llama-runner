import type { MemoryBreakdownExit } from '../types';
import { formatMiB } from './format';

interface Props {
  breakdown?: MemoryBreakdownExit;
}

export function MemoryBreakdownCard({ breakdown }: Props): React.ReactElement | null {
  if (!breakdown || breakdown.devices.length === 0) return null;

  return (
    <section className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="text-xs font-semibold uppercase tracking-wide opacity-60">Memory breakdown (on exit)</h3>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left opacity-60">
              <th className="pb-2 pr-3 font-normal">Device</th>
              <th className="pb-2 pr-3 font-normal">Total</th>
              <th className="pb-2 pr-3 font-normal">Free</th>
              <th className="pb-2 pr-3 font-normal">Model</th>
              <th className="pb-2 pr-3 font-normal">Context</th>
              <th className="pb-2 pr-3 font-normal">Compute</th>
              <th className="pb-2 pr-3 font-normal">Unaccounted</th>
            </tr>
          </thead>
          <tbody>
            {breakdown.devices.map((d) => (
              <tr key={d.label} className="border-t border-neutral-200 dark:border-neutral-800">
                <td className="py-2 pr-3 font-mono">{d.label}</td>
                <td className="py-2 pr-3 font-mono">{d.totalMiB !== undefined ? formatMiB(d.totalMiB) : '—'}</td>
                <td className="py-2 pr-3 font-mono">{d.freeMiB !== undefined ? formatMiB(d.freeMiB) : '—'}</td>
                <td className="py-2 pr-3 font-mono">{d.modelMiB !== undefined ? formatMiB(d.modelMiB) : '—'}</td>
                <td className="py-2 pr-3 font-mono">{d.contextMiB !== undefined ? formatMiB(d.contextMiB) : '—'}</td>
                <td className="py-2 pr-3 font-mono">{d.computeMiB !== undefined ? formatMiB(d.computeMiB) : '—'}</td>
                <td
                  className={`py-2 pr-3 font-mono ${
                    (d.unaccountedMiB ?? 0) > 500 ? 'text-amber-600 dark:text-amber-400' : ''
                  }`}
                >
                  {d.unaccountedMiB !== undefined ? formatMiB(d.unaccountedMiB) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
