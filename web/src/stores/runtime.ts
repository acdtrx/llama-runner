import { create } from 'zustand';

import { sseClient } from '../sse/client';
import type { RuntimeMetricsSnapshot, RuntimeSlotsSnapshot } from '../types';

interface RuntimeStoreState {
  metrics: RuntimeMetricsSnapshot | null;
  slots: RuntimeSlotsSnapshot | null;
}

export const useRuntimeStore = create<RuntimeStoreState>(() => ({
  metrics: null,
  slots: null,
}));

sseClient.on<RuntimeMetricsSnapshot>('runtime.metrics', (snapshot) => {
  useRuntimeStore.setState({ metrics: snapshot });
});

sseClient.on<RuntimeSlotsSnapshot>('runtime.slots', (snapshot) => {
  useRuntimeStore.setState({ slots: snapshot });
});
