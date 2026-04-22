import { create } from 'zustand';

import { getSettings, putSettings } from '../api/settings';
import { HttpError } from '../api/http';
import type { ApiError, Settings } from '../types';

interface SettingsState {
  settings: Settings | null;
  loading: boolean;
  saving: boolean;
  loadError: ApiError | null;
  saveError: ApiError | null;
  load: () => Promise<void>;
  save: (next: Settings) => Promise<Settings>;
  clearSaveError: () => void;
}

function toApiError(err: unknown): ApiError {
  if (err instanceof HttpError) return err.apiError;
  return { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
}

export const useSettingsStore = create<SettingsState>((set) => ({
  settings: null,
  loading: false,
  saving: false,
  loadError: null,
  saveError: null,

  async load() {
    set({ loading: true, loadError: null });
    try {
      const settings = await getSettings();
      set({ settings, loading: false });
    } catch (err) {
      set({ loading: false, loadError: toApiError(err) });
    }
  },

  async save(next) {
    set({ saving: true, saveError: null });
    try {
      const saved = await putSettings(next);
      set({ settings: saved, saving: false });
      return saved;
    } catch (err) {
      set({ saving: false, saveError: toApiError(err) });
      throw err;
    }
  },

  clearSaveError() {
    set({ saveError: null });
  },
}));
