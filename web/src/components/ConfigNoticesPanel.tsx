import { X } from 'lucide-react';

import { useNoticesStore } from '../stores/notices';

export function ConfigNoticesPanel(): React.ReactElement | null {
  const items = useNoticesStore((s) => s.items);
  const clear = useNoticesStore((s) => s.clear);

  if (items.length === 0) return null;

  return (
    <section className="rounded border border-amber-400 bg-amber-50 p-4 text-xs dark:border-amber-900/60 dark:bg-amber-950/30">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-amber-800 dark:text-amber-200">
          Notices ({items.length})
        </h3>
        <button
          type="button"
          onClick={clear}
          aria-label="Dismiss all notices"
          title="Dismiss all"
          className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide opacity-60 hover:bg-amber-500/20 hover:opacity-100"
        >
          <X size={11} />
          Dismiss
        </button>
      </div>
      <ul className="mt-2 space-y-1.5">
        {items.map((n) => (
          <li key={`${n.at}|${n.code}|${n.message}`} className="flex items-start gap-2">
            <span
              className={`mt-0.5 shrink-0 rounded px-1.5 py-0.5 text-[10px] uppercase ${
                n.severity === 'error'
                  ? 'bg-red-500/20 text-red-700 dark:text-red-300'
                  : n.severity === 'warn'
                    ? 'bg-amber-500/20 text-amber-800 dark:text-amber-200'
                    : 'bg-sky-500/20 text-sky-700 dark:text-sky-300'
              }`}
            >
              {n.severity}
            </span>
            <span className="shrink-0 font-mono text-[10px] opacity-50">[{n.origin}]</span>
            <span className="shrink-0 font-mono text-[10px] opacity-60">{n.code}</span>
            <span className="min-w-0 flex-1 break-words">{n.message}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
