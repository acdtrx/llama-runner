import { Link, useMatch, useNavigate } from 'react-router';
import { Play, Settings2, Square } from 'lucide-react';

import { useModalStore } from '../stores/modal';
import { useProfilesStore } from '../stores/profiles';
import { useServerStore } from '../stores/server';
import { StatusIndicator } from './StatusIndicator';

export function TopBar(): React.ReactElement {
  const liveMatch = useMatch('/profiles/:id');
  const historyMatch = useMatch('/profiles/:id/sessions/:sessionId');
  const activeProfileId = liveMatch?.params.id ?? historyMatch?.params.id ?? null;
  const navigate = useNavigate();

  const { status, actionError, busy, start, stop } = useServerStore();
  const profiles = useProfilesStore((s) => s.profiles);

  const runningProfile = status.profileId ? profiles.find((p) => p.id === status.profileId) ?? null : null;
  const activeProfile = activeProfileId ? profiles.find((p) => p.id === activeProfileId) ?? null : null;

  const canStart =
    !busy &&
    activeProfileId !== null &&
    (status.state === 'idle' || status.state === 'stopped' || status.state === 'crashed' || status.state === 'running');
  const canStop = !busy && (status.state === 'running' || status.state === 'starting');

  const label = runningProfile?.name ?? (status.state === 'running' ? status.profileId ?? '' : '');

  return (
    <header className="flex items-center justify-between gap-4 border-b border-neutral-200 px-4 py-2 text-sm dark:border-neutral-800">
      <Link to="/" className="font-semibold">
        llama-runner
      </Link>

      <div className="flex min-w-0 flex-1 items-center justify-end gap-3">
        <StatusIndicator state={status.state} />
        {label && <span className="truncate text-xs opacity-60">{label}</span>}
        {status.listeningUrl && (
          <code className="truncate font-mono text-xs opacity-50">{status.listeningUrl}</code>
        )}

        {actionError && <span className="text-xs text-red-600">{actionError.message}</span>}

        <button
          type="button"
          disabled={!canStart}
          onClick={async () => {
            if (!activeProfileId) return;
            await start(activeProfileId);
            // Starting a session from a historical URL should land the user on
            // the live view so they see the new session's data. No-op if we're
            // already on the live URL.
            navigate(`/profiles/${activeProfileId}`);
          }}
          title={
            !activeProfileId
              ? 'Select a profile to start'
              : status.state === 'running'
                ? `Restart (stops ${runningProfile?.name ?? 'current'} and starts ${activeProfile?.name ?? 'selected'})`
                : `Start ${activeProfile?.name ?? ''}`
          }
          aria-label="Start server"
          className="flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          <Play size={12} />
          {status.state === 'running' && activeProfileId !== status.profileId ? 'Switch' : 'Start'}
        </button>

        <button
          type="button"
          disabled={!canStop}
          onClick={() => void stop()}
          title="Stop server"
          aria-label="Stop server"
          className="flex items-center gap-1 rounded bg-neutral-600 px-2 py-1 text-xs font-medium text-white disabled:opacity-40"
        >
          <Square size={12} />
          Stop
        </button>

        <button
          type="button"
          onClick={() => useModalStore.getState().show('settings')}
          title="Settings"
          aria-label="Settings"
          className="rounded p-1 hover:bg-neutral-200 dark:hover:bg-neutral-800"
        >
          <Settings2 size={14} />
        </button>
      </div>
    </header>
  );
}
