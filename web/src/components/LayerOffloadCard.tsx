import type { LayerOffload } from '../types';
import { formatMiB } from './format';

interface Props {
  offload?: LayerOffload;
}

export function LayerOffloadCard({ offload }: Props): React.ReactElement | null {
  if (!offload) return null;
  const cpu = offload.cpuBufferMiB ?? 0;
  const gpu = offload.gpuBufferMiB ?? 0;
  const total = cpu + gpu;
  const cpuPct = total > 0 ? (cpu / total) * 100 : 0;
  const gpuPct = total > 0 ? (gpu / total) * 100 : 0;

  return (
    <section className="h-full rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="text-xs font-semibold uppercase tracking-wide opacity-60">Layer offload</h3>
      <div className="mt-3 flex items-baseline justify-between text-xs">
        <span className="font-mono">
          {offload.layersOffloaded ?? '?'} / {offload.layersTotal ?? '?'} layers on GPU
          {offload.outputLayerOffloaded ? ' (+ output)' : ''}
        </span>
        <span className="text-[10px] opacity-40">
          {offload.gpuDeviceLabel ?? 'GPU'}
        </span>
      </div>
      {total > 0 && (
        <>
          <div className="mt-3 flex h-4 w-full overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
            <div className="bg-indigo-500" style={{ width: `${gpuPct}%` }} title={`GPU ${formatMiB(gpu)}`} />
            <div className="bg-neutral-400" style={{ width: `${cpuPct}%` }} title={`CPU ${formatMiB(cpu)}`} />
          </div>
          <dl className="mt-2 grid grid-cols-2 gap-x-4 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm bg-indigo-500" />
              <span className="opacity-60">GPU</span>
              <span className="ml-auto font-mono">{formatMiB(gpu)}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm bg-neutral-400" />
              <span className="opacity-60">CPU</span>
              <span className="ml-auto font-mono">{formatMiB(cpu)}</span>
            </div>
          </dl>
        </>
      )}
    </section>
  );
}
