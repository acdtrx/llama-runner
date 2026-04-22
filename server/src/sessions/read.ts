import { readFile, readdir, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

import { AppError } from '../errors.js';
import type { SessionSummary } from './writer.js';
import { emptySessionMetrics } from '../metrics/types.js';
import type { SessionMetrics } from '../metrics/types.js';

function profileDir(dataDir: string, profileId: string): string {
  return resolve(dataDir, 'profiles', profileId);
}

function sessionDir(dataDir: string, profileId: string, sessionId: string): string {
  return resolve(profileDir(dataDir, profileId), 'sessions', sessionId);
}

async function readJsonOr<T>(path: string, fallback: T): Promise<T> {
  try {
    const body = await readFile(path, 'utf8');
    return JSON.parse(body) as T;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw err;
  }
}

export async function listSessions(dataDir: string, profileId: string): Promise<SessionSummary[]> {
  const sessionsRoot = resolve(profileDir(dataDir, profileId), 'sessions');
  let entries: string[];
  try {
    const direntries = await readdir(sessionsRoot, { withFileTypes: true });
    entries = direntries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw err;
  }
  const summaries: SessionSummary[] = [];
  for (const name of entries) {
    const summaryPath = resolve(sessionsRoot, name, 'summary.json');
    const summary = await readJsonOr<SessionSummary | null>(summaryPath, null);
    if (summary) summaries.push(summary);
  }
  summaries.sort((a, b) => b.sessionId.localeCompare(a.sessionId));
  return summaries;
}

export async function readSession(
  dataDir: string,
  profileId: string,
  sessionId: string,
): Promise<{ summary: SessionSummary; metrics: SessionMetrics }> {
  const dir = sessionDir(dataDir, profileId, sessionId);
  const summary = await readJsonOr<SessionSummary | null>(resolve(dir, 'summary.json'), null);
  if (!summary) {
    throw new AppError('NOT_FOUND', `session ${sessionId} not found`, { profileId, sessionId });
  }
  const metrics = await readJsonOr<SessionMetrics>(
    resolve(dir, 'metrics.json'),
    emptySessionMetrics(),
  );
  return { summary, metrics };
}

export async function rawLogInfo(
  dataDir: string,
  profileId: string,
  sessionId: string,
): Promise<{ path: string; size: number }> {
  const path = resolve(sessionDir(dataDir, profileId, sessionId), 'raw.log');
  try {
    const info = await stat(path);
    return { path, size: info.size };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new AppError('NOT_FOUND', `raw.log not found for session ${sessionId}`, {
        profileId,
        sessionId,
      });
    }
    throw err;
  }
}
