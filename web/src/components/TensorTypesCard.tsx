import type { TensorTypeHistogram } from '../types';

interface Props {
  types?: TensorTypeHistogram;
}

const PRECISION_COLOR: Record<string, string> = {
  f32: 'bg-red-500',
  bf16: 'bg-orange-500',
  f16: 'bg-orange-500',
  q8_0: 'bg-yellow-500',
  q6_K: 'bg-amber-500',
  q5_K: 'bg-emerald-500',
  q5_0: 'bg-emerald-500',
  q5_1: 'bg-emerald-500',
  q4_K: 'bg-sky-500',
  q4_0: 'bg-sky-500',
  q4_1: 'bg-sky-500',
  iq4_xs: 'bg-indigo-500',
  iq4_nl: 'bg-indigo-500',
  iq3_xs: 'bg-violet-500',
  iq2_xs: 'bg-fuchsia-500',
};

function colorFor(type: string): string {
  return PRECISION_COLOR[type] ?? 'bg-neutral-500';
}

export function TensorTypesCard({ types }: Props): React.ReactElement | null {
  if (!types) return null;
  const entries = Object.entries(types).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) return null;
  const total = entries.reduce((sum, [, n]) => sum + n, 0);

  return (
    <section className="h-full rounded border border-neutral-200 p-4 dark:border-neutral-800">
      <h3 className="text-xs font-semibold uppercase tracking-wide opacity-60">Tensor types</h3>
      <div className="mt-3 flex h-4 w-full overflow-hidden rounded bg-neutral-200 dark:bg-neutral-800">
        {entries.map(([type, n]) => (
          <div
            key={type}
            className={colorFor(type)}
            style={{ width: `${(n / total) * 100}%` }}
            title={`${type}: ${n} tensors (${((n / total) * 100).toFixed(1)}%)`}
          />
        ))}
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-xs md:grid-cols-3">
        {entries.map(([type, n]) => (
          <div key={type} className="flex items-center gap-1.5">
            <span className={`inline-block h-2 w-2 rounded-sm ${colorFor(type)}`} />
            <span className="font-mono opacity-80">{type}</span>
            <span className="ml-auto font-mono opacity-60">{n}</span>
          </div>
        ))}
      </dl>
      <div className="mt-2 text-[10px] opacity-50">{total} tensors total</div>
    </section>
  );
}
