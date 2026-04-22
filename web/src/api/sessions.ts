import { request } from './http';
import type { SessionMetrics, SessionSummary } from '../types';

export async function listSessions(profileId: string): Promise<SessionSummary[]> {
  const body = await request<{ sessions: SessionSummary[] }>(
    `/api/profiles/${encodeURIComponent(profileId)}/sessions`,
  );
  return body.sessions;
}

export function readSession(
  profileId: string,
  sessionId: string,
): Promise<{ summary: SessionSummary; metrics: SessionMetrics }> {
  return request<{ summary: SessionSummary; metrics: SessionMetrics }>(
    `/api/profiles/${encodeURIComponent(profileId)}/sessions/${encodeURIComponent(sessionId)}`,
  );
}

export async function fetchRawLog(profileId: string, sessionId: string): Promise<string> {
  const res = await fetch(
    `/api/profiles/${encodeURIComponent(profileId)}/sessions/${encodeURIComponent(sessionId)}/log`,
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}
