import { useEffect } from 'react';
import { Link, Navigate } from 'react-router';

import { useModalStore } from '../stores/modal';
import { useProfilesStore } from '../stores/profiles';
import { useSettingsStore } from '../stores/settings';

export function HomeScreen(): React.ReactElement {
  const { settings, loading: settingsLoading, loadError, load: loadSettings } = useSettingsStore();
  const { profiles, loading: profilesLoading, load: loadProfiles } = useProfilesStore();

  useEffect(() => {
    void loadSettings();
    void loadProfiles();
  }, [loadSettings, loadProfiles]);

  const configured = Boolean(settings?.llamaServerBinaryPath && settings?.modelsDir);
  const ready = !settingsLoading && !profilesLoading;

  if (ready && configured && profiles.length > 0) {
    return <Navigate to={`/profiles/${profiles[0]!.id}`} replace />;
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-semibold">Welcome</h1>
      <p className="mt-1 text-sm opacity-70">Manage llama-server profiles and runs.</p>

      {loadError && (
        <div className="mt-4 rounded border border-red-400 bg-red-50 p-3 text-sm text-red-900 dark:bg-red-950 dark:text-red-200">
          API unreachable: {loadError.message}
        </div>
      )}

      {ready && !configured && (
        <div className="mt-6 rounded border border-amber-400 bg-amber-50 p-4 text-sm dark:bg-amber-950">
          <strong>Setup required:</strong> configure the llama-server binary path and models directory to get started.
          <div className="mt-2">
            <button
              type="button"
              onClick={() => useModalStore.getState().show('settings')}
              className="underline"
            >
              Open settings →
            </button>
          </div>
        </div>
      )}

      {ready && configured && profiles.length === 0 && (
        <div className="mt-6 rounded border border-neutral-200 p-4 text-sm dark:border-neutral-800">
          No profiles yet.
          <div className="mt-2">
            <Link to="/profiles/new" className="underline">
              Create one →
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
