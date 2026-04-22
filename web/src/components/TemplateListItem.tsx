import { useState } from 'react';
import { Copy } from 'lucide-react';

import { cloneTemplate } from '../api/predefined';
import { HttpError } from '../api/http';
import type { ApiError, PredefinedTemplate } from '../types';

interface Props {
  template: PredefinedTemplate;
  onCloned: (profileId: string) => void;
}

export function TemplateListItem({ template, onCloned }: Props): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function handleClone(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const profile = await cloneTemplate(template.id);
      onCloned(profile.id);
    } catch (err) {
      if (err instanceof HttpError) setError(err.apiError);
      else setError({ code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="px-3 py-2 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-900">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate font-medium" title={template.name}>
            {template.name}
          </div>
          {template.tags && template.tags.length > 0 && (
            <div className="mt-0.5 truncate text-xs opacity-50">{template.tags.join(' · ')}</div>
          )}
        </div>
        <button
          type="button"
          onClick={handleClone}
          disabled={busy}
          title={`Clone ${template.name} into a new profile`}
          aria-label={`Clone ${template.name}`}
          className="shrink-0 rounded p-1 hover:bg-neutral-200 disabled:opacity-50 dark:hover:bg-neutral-800"
        >
          <Copy size={14} />
        </button>
      </div>
      {error && <div className="mt-1 text-xs text-red-600">{error.message}</div>}
    </li>
  );
}
