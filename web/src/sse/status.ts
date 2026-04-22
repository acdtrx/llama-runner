import { create } from 'zustand';

import { sseClient } from './client';
import type { ConnectionState } from './client';
import { useToastsStore } from '../stores/toasts';

interface ConnState {
  state: ConnectionState;
  sinceMs: number;
}

export const useConnectionStore = create<ConnState>(() => ({
  state: sseClient.getState(),
  sinceMs: Date.now(),
}));

let everConnected = false;
let lastToastId: number | null = null;

sseClient.onState((state) => {
  useConnectionStore.setState({ state, sinceMs: Date.now() });

  const push = useToastsStore.getState().push;
  const dismiss = useToastsStore.getState().dismiss;

  if (state === 'connected') {
    if (lastToastId !== null) {
      dismiss(lastToastId);
      lastToastId = null;
    }
    if (everConnected) {
      push({ tone: 'success', message: 'Reconnected to server', ttlMs: 2500 });
    }
    everConnected = true;
    return;
  }
  if (state === 'disconnected' && everConnected) {
    if (lastToastId === null) {
      lastToastId = push({
        tone: 'error',
        message: 'Disconnected from server',
        detail: 'Retrying…',
        ttlMs: 0,
      });
    }
  }
});
