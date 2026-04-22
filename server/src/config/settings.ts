import { readFile, access, stat } from 'node:fs/promises';
import { constants as FS } from 'node:fs';
import { resolve } from 'node:path';

import { writeJsonAtomic, writeJsonUnsafe, withFileLock } from './atomic.js';
import { AppError } from '../errors.js';

export interface Settings {
  llamaServerBinaryPath: string;
  modelsDir: string;
  llamaServerHost: string;
  llamaServerPort: number;
  sessionsPerProfileLimit: number;
  uiNoiseFilterEnabledByDefault: boolean;
  telemetryIntervalMs: number;
}

export const DEFAULT_SETTINGS: Settings = {
  llamaServerBinaryPath: '',
  modelsDir: '',
  llamaServerHost: '127.0.0.1',
  llamaServerPort: 11434,
  sessionsPerProfileLimit: 20,
  uiNoiseFilterEnabledByDefault: true,
  telemetryIntervalMs: 1000,
};

function settingsPath(dataDir: string): string {
  return resolve(dataDir, 'settings.json');
}

export async function readSettings(dataDir: string): Promise<Settings> {
  const path = settingsPath(dataDir);
  return withFileLock(path, async () => {
    try {
      const body = await readFile(path, 'utf8');
      const parsed = JSON.parse(body) as Partial<Settings>;
      return { ...DEFAULT_SETTINGS, ...parsed };
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        await writeJsonUnsafe(path, DEFAULT_SETTINGS);
        return { ...DEFAULT_SETTINGS };
      }
      throw err;
    }
  });
}

export async function writeSettings(dataDir: string, next: Settings): Promise<Settings> {
  await writeJsonAtomic(settingsPath(dataDir), next);
  return next;
}

export async function verifyBinaryPath(path: string): Promise<void> {
  if (!path) {
    throw new AppError('VALIDATION_ERROR', 'llamaServerBinaryPath must not be empty', { field: 'llamaServerBinaryPath' });
  }
  try {
    const info = await stat(path);
    if (!info.isFile()) {
      throw new AppError('VALIDATION_ERROR', 'llamaServerBinaryPath is not a regular file', { field: 'llamaServerBinaryPath', path });
    }
    await access(path, FS.X_OK);
  } catch (err) {
    if (err instanceof AppError) throw err;
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new AppError('VALIDATION_ERROR', 'llamaServerBinaryPath does not exist', { field: 'llamaServerBinaryPath', path });
    }
    if (code === 'EACCES') {
      throw new AppError('VALIDATION_ERROR', 'llamaServerBinaryPath is not executable', { field: 'llamaServerBinaryPath', path });
    }
    throw err;
  }
}

export async function verifyModelsDir(path: string): Promise<void> {
  if (!path) {
    throw new AppError('VALIDATION_ERROR', 'modelsDir must not be empty', { field: 'modelsDir' });
  }
  try {
    const info = await stat(path);
    if (!info.isDirectory()) {
      throw new AppError('VALIDATION_ERROR', 'modelsDir is not a directory', { field: 'modelsDir', path });
    }
    await access(path, FS.R_OK);
  } catch (err) {
    if (err instanceof AppError) throw err;
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') {
      throw new AppError('VALIDATION_ERROR', 'modelsDir does not exist', { field: 'modelsDir', path });
    }
    if (code === 'EACCES') {
      throw new AppError('VALIDATION_ERROR', 'modelsDir is not readable', { field: 'modelsDir', path });
    }
    throw err;
  }
}
