import { create } from 'zustand';

import { sseClient } from '../sse/client';
import type { SystemStatsEvent } from '../types';

interface SystemStoreState {
  latest: SystemStatsEvent | null;
}

export const useSystemStore = create<SystemStoreState>(() => ({
  latest: null,
}));

sseClient.on<SystemStatsEvent>('system.stats', (payload) => {
  useSystemStore.setState({ latest: payload });
});
