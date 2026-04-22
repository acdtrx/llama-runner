import { create } from 'zustand';

import { getPredefinedProfiles } from '../api/predefined';
import { HttpError } from '../api/http';
import type { ApiError, PredefinedTemplate } from '../types';

interface PredefinedState {
  templates: PredefinedTemplate[];
  loaded: boolean;
  error: ApiError | null;
  load: () => Promise<void>;
}

function toApiError(err: unknown): ApiError {
  if (err instanceof HttpError) return err.apiError;
  return { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
}

export const usePredefinedStore = create<PredefinedState>((set, get) => ({
  templates: [],
  loaded: false,
  error: null,

  async load() {
    if (get().loaded) return;
    try {
      const data = await getPredefinedProfiles();
      set({ templates: data.templates, loaded: true });
    } catch (err) {
      set({ error: toApiError(err) });
    }
  },
}));
