import { X } from 'lucide-react';

import { useToastsStore } from '../stores/toasts';
import type { ToastTone } from '../stores/toasts';

const TONE_STYLES: Record<ToastTone, string> = {
  info: 'border-sky-400 bg-sky-50 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
  error: 'border-red-400 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-200',
  success: 'border-emerald-400 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
};

export function Toasts(): React.ReactElement {
  const toasts = useToastsStore((s) => s.toasts);
  const dismiss = useToastsStore((s) => s.dismiss);
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed bottom-3 right-3 z-50 flex flex-col gap-2"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`pointer-events-auto flex max-w-sm items-start gap-2 rounded border px-3 py-2 text-sm shadow ${TONE_STYLES[t.tone]}`}
        >
          <div className="flex-1">
            <div className="font-medium">{t.message}</div>
            {t.detail && <div className="mt-0.5 text-xs opacity-80">{t.detail}</div>}
          </div>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            title="Dismiss"
            aria-label="Dismiss"
            className="rounded p-0.5 opacity-60 hover:opacity-100"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
