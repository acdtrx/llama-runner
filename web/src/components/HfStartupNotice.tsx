import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';

import { sseClient } from '../sse/client';
import { useServerStore } from '../stores/server';
import type { LogLineEvent, Profile } from '../types';

interface Props {
  profile: Profile;
}

// `srv    load_model: loading model '<path>'` is emitted by llama-server once
// the model file is on disk and being loaded into memory. Seeing it means the
// HF download (if any) has finished, so the spinner should disappear even
// though the server is still in the `starting` state.
const LOADING_MARKER = "load_model: loading model '";

// Cached starts hit the load_model line within a few hundred ms of entering
// `starting`. Holding the notice off until this delay elapses skips rendering
// it at all when the model is already cached.
const ARM_DELAY_MS = 2000;

export function HfStartupNotice({ profile }: Props): React.ReactElement | null {
  const status = useServerStore((s) => s.status);
  const [loadedSession, setLoadedSession] = useState<string | null>(null);
  const [armedSession, setArmedSession] = useState<string | null>(null);

  useEffect(() => {
    const off = sseClient.on<LogLineEvent>('log.line', (evt) => {
      if (!evt.text.includes(LOADING_MARKER)) return;
      setLoadedSession(evt.sessionId);
    });
    return off;
  }, []);

  useEffect(() => {
    if (status.state !== 'starting' || !status.sessionId) {
      setArmedSession(null);
      return;
    }
    const sessionId = status.sessionId;
    const handle = setTimeout(() => setArmedSession(sessionId), ARM_DELAY_MS);
    return () => clearTimeout(handle);
  }, [status.state, status.sessionId]);

  if (profile.modelSource !== 'hf') return null;
  if (status.profileId !== profile.id) return null;
  if (status.state !== 'starting') return null;
  if (!status.sessionId || armedSession !== status.sessionId) return null;
  if (loadedSession === status.sessionId) return null;

  return (
    <div className="mx-4 mt-3 flex items-start gap-3 rounded border border-indigo-300 bg-indigo-50 px-3 py-2 text-sm dark:border-indigo-900 dark:bg-indigo-950/40">
      <Loader2 size={16} className="mt-0.5 shrink-0 animate-spin text-indigo-600 dark:text-indigo-300" />
      <div className="min-w-0 flex-1">
        <div className="font-medium">
          Fetching from Hugging Face: <span className="font-mono break-all">{profile.modelRepo}</span>
        </div>
        <div className="mt-0.5 text-xs opacity-70">
          First-run downloads can take a while; subsequent starts use the cache.
        </div>
      </div>
    </div>
  );
}
