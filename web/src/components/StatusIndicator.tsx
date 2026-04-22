import type { ServerState } from '../types';

const COLORS: Record<ServerState, string> = {
  idle: 'bg-neutral-400',
  starting: 'bg-amber-500',
  running: 'bg-emerald-500',
  stopping: 'bg-amber-500',
  stopped: 'bg-neutral-400',
  crashed: 'bg-red-500',
};

const LABELS: Record<ServerState, string> = {
  idle: 'idle',
  starting: 'starting…',
  running: 'running',
  stopping: 'stopping…',
  stopped: 'stopped',
  crashed: 'crashed',
};

export function StatusIndicator({ state }: { state: ServerState }): React.ReactElement {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-block h-2 w-2 rounded-full ${COLORS[state]} ${
          state === 'starting' || state === 'stopping' ? 'animate-pulse' : ''
        }`}
      />
      <span className="text-xs opacity-80">{LABELS[state]}</span>
    </span>
  );
}
