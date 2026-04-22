import { request } from './http';
import type { ServerStatus } from '../types';

export function getServerStatus(): Promise<ServerStatus> {
  return request<ServerStatus>('/api/server/status');
}

export function startServer(profileId: string): Promise<ServerStatus> {
  return request<ServerStatus>('/api/server/start', {
    method: 'POST',
    body: JSON.stringify({ profileId }),
  });
}

export function stopServer(): Promise<ServerStatus> {
  return request<ServerStatus>('/api/server/stop', { method: 'POST' });
}
