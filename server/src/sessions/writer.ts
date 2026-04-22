import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

import { writeJsonAtomic } from '../config/atomic.js';
import type { Profile } from '../config/profiles.js';
import type { Settings } from '../config/settings.js';
import { allocateSessionId } from './ids.js';

export interface SessionPaths {
  sessionId: string;
  dir: string;
  summaryPath: string;
  rawLogPath: string;
  metricsPath: string;
}

export interface SessionSummary {
  sessionId: string;
  profileId: string;
  profileSnapshot: Profile;
  settingsSnapshot: Pick<Settings, 'llamaServerBinaryPath' | 'modelsDir' | 'llamaServerHost' | 'llamaServerPort'>;
  startedAt: string;
  endedAt?: string;
  exitCode?: number;
  exitSignal?: string;
  crashed?: boolean;
}

function profileSessionDir(dataDir: string, profileId: string): string {
  return resolve(dataDir, 'profiles', profileId);
}

export async function beginSession(
  dataDir: string,
  profile: Profile,
  settings: Settings,
): Promise<SessionPaths> {
  const profileDir = profileSessionDir(dataDir, profile.id);
  const sessionId = await allocateSessionId(profileDir);
  const dir = resolve(profileDir, 'sessions', sessionId);
  await mkdir(dir, { recursive: true });

  const summary: SessionSummary = {
    sessionId,
    profileId: profile.id,
    profileSnapshot: profile,
    settingsSnapshot: {
      llamaServerBinaryPath: settings.llamaServerBinaryPath,
      modelsDir: settings.modelsDir,
      llamaServerHost: settings.llamaServerHost,
      llamaServerPort: settings.llamaServerPort,
    },
    startedAt: new Date().toISOString(),
  };

  const summaryPath = resolve(dir, 'summary.json');
  await writeJsonAtomic(summaryPath, summary);

  return {
    sessionId,
    dir,
    summaryPath,
    rawLogPath: resolve(dir, 'raw.log'),
    metricsPath: resolve(dir, 'metrics.json'),
  };
}

export async function finalizeSession(
  paths: SessionPaths,
  result: { exitCode: number | null; exitSignal: NodeJS.Signals | null; crashed: boolean },
): Promise<void> {
  const { readFile } = await import('node:fs/promises');
  let summary: SessionSummary;
  try {
    const body = await readFile(paths.summaryPath, 'utf8');
    summary = JSON.parse(body) as SessionSummary;
  } catch {
    // Summary missing (partial start). Nothing to finalize.
    return;
  }
  summary.endedAt = new Date().toISOString();
  if (result.exitCode !== null) summary.exitCode = result.exitCode;
  if (result.exitSignal !== null) summary.exitSignal = result.exitSignal;
  summary.crashed = result.crashed;
  await writeJsonAtomic(paths.summaryPath, summary);
}
