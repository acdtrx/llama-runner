import { create } from 'zustand';

import * as api from '../api/server';
import { HttpError } from '../api/http';
import { sseClient } from '../sse/client';
import type { ApiError, ServerStatus } from '../types';

const INITIAL_STATUS: ServerStatus = {
  state: 'idle',
  profileId: null,
  sessionId: null,
  startedAt: null,
  pid: null,
  listeningUrl: null,
};

interface ServerStoreState {
  status: ServerStatus;
  actionError: ApiError | null;
  busy: boolean;
  start: (profileId: string) => Promise<void>;
  stop: () => Promise<void>;
  clearError: () => void;
}

function toApiError(err: unknown): ApiError {
  if (err instanceof HttpError) return err.apiError;
  return { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
}

export const useServerStore = create<ServerStoreState>((set) => ({
  status: INITIAL_STATUS,
  actionError: null,
  busy: false,

  async start(profileId) {
    set({ busy: true, actionError: null });
    try {
      await api.startServer(profileId);
      set({ busy: false });
    } catch (err) {
      set({ busy: false, actionError: toApiError(err) });
    }
  },

  async stop() {
    set({ busy: true, actionError: null });
    try {
      await api.stopServer();
      set({ busy: false });
    } catch (err) {
      set({ busy: false, actionError: toApiError(err) });
    }
  },

  clearError() {
    set({ actionError: null });
  },
}));

sseClient.on<ServerStatus>('server.status', (status) => {
  useServerStore.setState({ status });
});
