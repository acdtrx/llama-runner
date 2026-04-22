import { request } from './http';
import type { NewProfile, Profile } from '../types';

export async function listProfiles(): Promise<Profile[]> {
  const body = await request<{ profiles: Profile[] }>('/api/profiles');
  return body.profiles;
}

export function getProfile(id: string): Promise<Profile> {
  return request<Profile>(`/api/profiles/${encodeURIComponent(id)}`);
}

export function createProfile(body: NewProfile): Promise<Profile> {
  return request<Profile>('/api/profiles', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}

export function updateProfile(id: string, body: NewProfile): Promise<Profile> {
  return request<Profile>(`/api/profiles/${encodeURIComponent(id)}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
}

export async function deleteProfile(id: string): Promise<void> {
  await request<null>(`/api/profiles/${encodeURIComponent(id)}`, { method: 'DELETE' });
}
