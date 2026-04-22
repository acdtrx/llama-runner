import type { GpuCapabilities } from '../types';
import { formatMiB } from './format';

interface Props {
  caps?: GpuCapabilities;
}

export function GpuCapabilitiesCard({ caps }: Props): React.ReactElement | null {
  if (!caps) return null;

  const features = [
    ['Unified memory', caps.unifiedMemory],
    ['bfloat', caps.bfloat],
    ['Tensor API', caps.tensor],
    ['Residency sets', caps.residencySets],
    ['Shared buffers', caps.sharedBuffers],
    ['Simdgroup reduction', caps.simdgroupReduction],
    ['Simdgroup matmul', caps.simdgroupMatmul],
  ].filter(([, v]) => v !== undefined) as [string, boolean][];

  return (
    <section className="h-full rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="text-xs font-semibold uppercase tracking-wide opacity-60">GPU capabilities</h3>
      {caps.families.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {caps.families.map((f) => (
            <span
              key={f}
              className="rounded border border-neutral-300 bg-neutral-100 px-1.5 py-0.5 font-mono text-[10px] dark:border-neutral-700 dark:bg-neutral-900"
            >
              {f}
            </span>
          ))}
        </div>
      )}
      {caps.recommendedMaxWorkingSetMiB !== undefined && (
        <div className="mt-3 text-xs">
          <span className="opacity-60">Recommended max working set: </span>
          <span className="font-mono">{formatMiB(caps.recommendedMaxWorkingSetMiB)}</span>
        </div>
      )}
      {features.length > 0 && (
        <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
          {features.map(([label, value]) => (
            <div key={label} className="flex items-center gap-1.5">
              <span
                className={`inline-block h-2 w-2 rounded-full ${value ? 'bg-emerald-500' : 'bg-neutral-400'}`}
                aria-hidden
              />
              <span className="opacity-70">{label}</span>
              <span className="ml-auto font-mono opacity-60">{value ? 'yes' : 'no'}</span>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
