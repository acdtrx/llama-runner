import { request } from './http';
import type { Settings } from '../types';

export function getSettings(): Promise<Settings> {
  return request<Settings>('/api/settings');
}

export function putSettings(next: Settings): Promise<Settings> {
  return request<Settings>('/api/settings', {
    method: 'PUT',
    body: JSON.stringify(next),
  });
}
