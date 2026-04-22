import { request } from './http';
import type { PredefinedProfiles, Profile } from '../types';

export function getPredefinedProfiles(): Promise<PredefinedProfiles> {
  return request<PredefinedProfiles>('/api/profiles/predefined');
}

export function cloneTemplate(templateId: string, name?: string): Promise<Profile> {
  return request<Profile>(`/api/profiles/clone/${encodeURIComponent(templateId)}`, {
    method: 'POST',
    body: JSON.stringify(name ? { name } : {}),
  });
}
