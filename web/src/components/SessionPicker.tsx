import { useNavigate } from 'react-router';

import type { SessionSummary } from '../types';

interface Props {
  profileId: string;
  sessions: SessionSummary[];
  runningSessionId: string | null;
  effectiveSessionId: string | null;
}

export function SessionPicker({
  profileId,
  sessions,
  runningSessionId,
  effectiveSessionId,
}: Props): React.ReactElement {
  const navigate = useNavigate();

  function selectValue(value: string): void {
    if (!value) return;
    navigate(`/profiles/${profileId}/sessions/${value}`);
  }

  return (
    <div className="flex items-center gap-2 border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-xs dark:border-neutral-800 dark:bg-neutral-950">
      <span className="opacity-60">Session</span>
      <select
        className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900"
        value={effectiveSessionId ?? ''}
        onChange={(e) => selectValue(e.target.value)}
        disabled={sessions.length === 0}
      >
        {sessions.length === 0 && <option value="">No sessions yet</option>}
        {sessions.map((s) => (
          <option key={s.sessionId} value={s.sessionId}>
            {formatOption(s, runningSessionId)}
          </option>
        ))}
      </select>
    </div>
  );
}

function formatOption(s: SessionSummary, runningSessionId: string | null): string {
  const ts = new Date(s.startedAt).toLocaleString();
  if (s.sessionId === runningSessionId) return `${ts} · running`;
  if (s.crashed) return `${ts} · crashed`;
  return ts;
}
