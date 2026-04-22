import { Pencil, Trash2 } from 'lucide-react';

import type { Profile } from '../types';

interface Props {
  profile: Profile;
  onEdit: () => void;
  onDelete: () => void;
}

export function ProfileConfigCard({ profile, onEdit, onDelete }: Props): React.ReactElement {
  const modelLabel = profile.modelSource === 'hf' ? 'HF repo' : 'Model file';
  const modelValue = profile.modelSource === 'hf' ? profile.modelRepo : profile.modelFile;

  return (
    <section className="relative border-b border-neutral-200 px-5 py-3 dark:border-neutral-800">
      <div className="absolute right-3 top-2 flex gap-1">
        <button
          type="button"
          onClick={onEdit}
          title="Edit profile"
          aria-label="Edit profile"
          className="rounded p-1.5 hover:bg-neutral-200 dark:hover:bg-neutral-800"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          onClick={onDelete}
          title="Delete profile"
          aria-label="Delete profile"
          className="rounded p-1.5 text-neutral-500 hover:bg-neutral-200 hover:text-red-600 dark:hover:bg-neutral-800"
        >
          <Trash2 size={14} />
        </button>
      </div>

      <div className="grid grid-cols-1 gap-x-6 gap-y-2 pr-16 md:grid-cols-3">
        <Cell label="Profile">
          <div className="truncate text-base font-semibold" title={profile.name}>
            {profile.name}
          </div>
          <div className="mt-0.5 truncate text-xs opacity-70" title={profile.description ?? ''}>
            {profile.description ? profile.description : <span className="opacity-40">no description</span>}
          </div>
        </Cell>

        <Cell label={modelLabel}>
          <div className="truncate font-mono text-xs" title={modelValue ?? ''}>
            {modelValue ?? <span className="opacity-40">(missing)</span>}
          </div>
          <div
            className="mt-0.5 truncate font-mono text-xs opacity-70"
            title={profile.argsLine.length > 0 ? profile.argsLine : ''}
          >
            {profile.argsLine.length > 0 ? profile.argsLine : <span className="opacity-40">no extra args</span>}
          </div>
        </Cell>

        <Cell label="Template">
          <div className="truncate font-mono text-xs" title={profile.clonedFromTemplateId ?? ''}>
            {profile.clonedFromTemplateId ?? <span className="opacity-40">custom</span>}
          </div>
          <div className="mt-0.5 text-xs opacity-70">
            updated {new Date(profile.updatedAt).toLocaleString()}
          </div>
        </Cell>
      </div>
    </section>
  );
}

interface CellProps {
  label: string;
  children: React.ReactNode;
}

function Cell({ label, children }: CellProps): React.ReactElement {
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-50">{label}</div>
      <div className="mt-0.5 min-w-0">{children}</div>
    </div>
  );
}
