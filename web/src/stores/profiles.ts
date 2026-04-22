import { create } from 'zustand';

import * as api from '../api/profiles';
import { HttpError } from '../api/http';
import type { ApiError, NewProfile, Profile } from '../types';

interface ProfilesState {
  profiles: Profile[];
  loading: boolean;
  error: ApiError | null;
  load: () => Promise<void>;
  create: (body: NewProfile) => Promise<Profile>;
  update: (id: string, body: NewProfile) => Promise<Profile>;
  remove: (id: string) => Promise<void>;
}

function toApiError(err: unknown): ApiError {
  if (err instanceof HttpError) return err.apiError;
  return { code: 'INTERNAL_ERROR', message: err instanceof Error ? err.message : String(err) };
}

export const useProfilesStore = create<ProfilesState>((set, get) => ({
  profiles: [],
  loading: false,
  error: null,

  async load() {
    set({ loading: true, error: null });
    try {
      const profiles = await api.listProfiles();
      set({ profiles, loading: false });
    } catch (err) {
      set({ loading: false, error: toApiError(err) });
    }
  },

  async create(body) {
    const created = await api.createProfile(body);
    set({ profiles: [created, ...get().profiles] });
    return created;
  },

  async update(id, body) {
    const updated = await api.updateProfile(id, body);
    set({
      profiles: get()
        .profiles.map((p) => (p.id === id ? updated : p))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    });
    return updated;
  },

  async remove(id) {
    await api.deleteProfile(id);
    set({ profiles: get().profiles.filter((p) => p.id !== id) });
  },
}));
