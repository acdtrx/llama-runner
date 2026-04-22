import type { StartupMetrics } from '../types';
import { formatMiB } from './format';

interface Props {
  startup: StartupMetrics;
}

interface Segment {
  label: string;
  mib: number;
  color: string;
}

export function MemoryBudgetCard({ startup }: Props): React.ReactElement {
  const modelMiB = (startup.model.fileSizeGiB ?? 0) * 1024;
  const primary = startup.kvCache.primaryMiB ?? 0;
  const swa = startup.kvCache.swaMiB ?? 0;
  const compute = startup.kvCache.computeBufferMiB ?? 0;
  const deviceFree = startup.deviceFreeMiB ?? 0;

  const segments: Segment[] = [
    { label: 'Model', mib: modelMiB, color: 'bg-indigo-500' },
    { label: 'KV (primary)', mib: primary, color: 'bg-sky-500' },
    { label: 'KV (SWA)', mib: swa, color: 'bg-cyan-500' },
    { label: 'Compute', mib: compute, color: 'bg-emerald-500' },
  ].filter((s) => s.mib > 0);

  const usedMiB = segments.reduce((a, s) => a + s.mib, 0);
  const totalMiB = Math.max(usedMiB + deviceFree, usedMiB);
  const hasData = totalMiB > 0;

  return (
    <section className="rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="text-xs font-semibold uppercase tracking-wide opacity-60">Memory budget</h3>
      {!hasData ? (
        <div className="mt-3 text-xs opacity-50">Waiting for startup info…</div>
      ) : (
        <>
          <div className="mt-3 flex h-5 w-full overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
            {segments.map((s) => (
              <div
                key={s.label}
                className={s.color}
                style={{ width: `${(s.mib / totalMiB) * 100}%` }}
                title={`${s.label}: ${formatMiB(s.mib)}`}
              />
            ))}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
            {segments.map((s) => (
              <div key={s.label} className="flex items-center gap-1.5">
                <span className={`inline-block h-2 w-2 rounded-sm ${s.color}`} />
                <span className="opacity-60">{s.label}</span>
                <span className="ml-auto font-mono">{formatMiB(s.mib)}</span>
              </div>
            ))}
            <div className="col-span-2 mt-1 flex justify-between border-t border-neutral-200 pt-1 font-mono dark:border-neutral-800">
              <span className="opacity-60">Used</span>
              <span>{formatMiB(usedMiB)}</span>
            </div>
            <div className="col-span-2 flex justify-between font-mono">
              <span className="opacity-60">Device free at start</span>
              <span>{formatMiB(deviceFree)}</span>
            </div>
          </dl>
        </>
      )}
    </section>
  );
}
