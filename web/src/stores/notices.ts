import { create } from 'zustand';

import { sseClient } from '../sse/client';
import type {
  ConfigNotice,
  MetricsNoticeEvent,
  RuntimeNotice,
  ServerStatus,
} from '../types';

export interface NoticeItem {
  at: string;
  severity: 'info' | 'warn' | 'error';
  code: string;
  message: string;
  origin: 'startup' | 'runtime';
}

interface NoticesStoreState {
  items: NoticeItem[];
  clear: () => void;
  seedFromSession: (notices: ConfigNotice[]) => void;
}

function dedupeKey(n: { at: string; code: string; message: string }): string {
  return `${n.code}|${n.message}`;
}

export const useNoticesStore = create<NoticesStoreState>((set, get) => ({
  items: [],
  clear: () => set({ items: [] }),
  seedFromSession: (notices) => {
    const existing = new Set(get().items.map(dedupeKey));
    const next: NoticeItem[] = [...get().items];
    for (const n of notices) {
      const key = dedupeKey(n);
      if (existing.has(key)) continue;
      existing.add(key);
      next.push({ ...n, origin: 'startup' });
    }
    set({ items: next });
  },
}));

sseClient.on<MetricsNoticeEvent>('metrics.notice', (evt) => {
  const state = useNoticesStore.getState();
  const key = dedupeKey(evt.notice);
  if (state.items.some((i) => dedupeKey(i) === key)) return;
  useNoticesStore.setState({ items: [...state.items, { ...evt.notice, origin: 'startup' }] });
});

sseClient.on<RuntimeNotice>('runtime.notice', (notice) => {
  const state = useNoticesStore.getState();
  const key = dedupeKey(notice);
  if (state.items.some((i) => dedupeKey(i) === key)) return;
  useNoticesStore.setState({ items: [...state.items, { ...notice, origin: 'runtime' }] });
});

// Clear notices on new session (server transitions into 'starting').
sseClient.on<ServerStatus>('server.status', (status) => {
  if (status.state === 'starting') {
    useNoticesStore.setState({ items: [] });
  }
});
