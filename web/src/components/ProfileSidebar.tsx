import { useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router';
import { Plus } from 'lucide-react';

import { useProfilesStore } from '../stores/profiles';
import { usePredefinedStore } from '../stores/predefined';
import { TemplateListItem } from './TemplateListItem';

export function ProfileSidebar(): React.ReactElement {
  const { profiles, loading, error, load } = useProfilesStore();
  const { templates, loaded: templatesLoaded, error: templatesError, load: loadTemplates } =
    usePredefinedStore();
  const reload = useProfilesStore((s) => s.load);
  const navigate = useNavigate();

  useEffect(() => {
    void load();
    void loadTemplates();
  }, [load, loadTemplates]);

  function onCloned(profileId: string): void {
    void reload().then(() => navigate(`/profiles/${profileId}`));
  }

  return (
    <aside className="flex w-64 shrink-0 flex-col border-r border-neutral-200 bg-neutral-50 dark:border-neutral-800 dark:bg-neutral-950">
      <div className="flex items-center justify-between border-b border-neutral-200 px-3 py-2 dark:border-neutral-800">
        <h2 className="text-xs font-semibold uppercase tracking-wide opacity-60">Profiles</h2>
        <Link
          to="/profiles/new"
          title="New profile"
          aria-label="New profile"
          className="rounded p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800"
        >
          <Plus size={16} />
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && <div className="px-3 py-2 text-xs opacity-50">Loading…</div>}
        {error && <div className="px-3 py-2 text-xs text-red-600">{error.message}</div>}
        {!loading && !error && profiles.length === 0 && (
          <div className="px-3 py-4 text-xs opacity-60">
            No profiles yet. Click <span className="font-mono">+</span> or clone a template below.
          </div>
        )}
        <ul>
          {profiles.map((p) => (
            <li key={p.id}>
              <NavLink
                to={`/profiles/${p.id}`}
                className={({ isActive }) =>
                  `block truncate border-l-2 px-3 py-2 text-sm ${
                    isActive
                      ? 'border-indigo-500 bg-white font-medium dark:bg-neutral-900'
                      : 'border-transparent hover:bg-neutral-100 dark:hover:bg-neutral-900'
                  }`
                }
              >
                {p.name}
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="mt-4 border-t border-neutral-200 dark:border-neutral-800">
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wide opacity-60">Templates</div>
          {templatesError && <div className="px-3 py-1 text-xs text-red-600">{templatesError.message}</div>}
          {!templatesLoaded && !templatesError && <div className="px-3 py-1 text-xs opacity-50">Loading…</div>}
          <ul>
            {templates.map((tpl) => (
              <TemplateListItem key={tpl.id} template={tpl} onCloned={onCloned} />
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}
