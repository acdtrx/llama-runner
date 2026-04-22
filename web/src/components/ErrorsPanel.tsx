import type { ErrorEntry } from '../types';

interface Props {
  errors: ErrorEntry[];
}

export function ErrorsPanel({ errors }: Props): React.ReactElement | null {
  if (errors.length === 0) return null;
  return (
    <section className="rounded border border-red-400 bg-red-50 p-4 text-xs dark:bg-red-950/40">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-red-700 dark:text-red-300">
        Errors ({errors.length})
      </h3>
      <ul className="mt-2 max-h-40 space-y-1 overflow-auto font-mono">
        {errors.slice(-50).reverse().map((e, i) => (
          <li key={`${e.at}-${i}`} className="flex gap-2">
            <span
              className={`shrink-0 text-[10px] uppercase ${e.severity === 'error' ? 'text-red-600' : 'text-amber-600'}`}
            >
              {e.severity}
            </span>
            <span className="break-words">{e.line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
