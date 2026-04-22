import { readFile, readdir, mkdir, rm } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { resolve, isAbsolute } from 'node:path';

import { writeJsonAtomic, withFileLock } from './atomic.js';
import { AppError } from '../errors.js';
import { flagName, tokenizeArgs } from '../util/argsTokenizer.js';

export type ModelSource = 'file' | 'hf';

export interface Profile {
  id: string;
  name: string;
  description?: string;
  modelSource: ModelSource;
  modelFile?: string;
  modelRepo?: string;
  argsLine: string;
  clonedFromTemplateId?: string;
  createdAt: string;
  updatedAt: string;
}

export type NewProfile = Omit<Profile, 'id' | 'createdAt' | 'updatedAt'>;

export const RESERVED_FLAGS = ['--model', '-m', '--host', '--port', '-hf', '--metrics'] as const;

// Loose pattern for HF model references. Accepts owner/repo with optional
// :quant suffix. Characters allowed match what HF normally uses.
const HF_REPO_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\/[A-Za-z0-9][A-Za-z0-9._-]*(?::[A-Za-z0-9._-]+)?$/;

function profilesDir(dataDir: string): string {
  return resolve(dataDir, 'profiles');
}

function profileDir(dataDir: string, id: string): string {
  return resolve(profilesDir(dataDir), id);
}

function profilePath(dataDir: string, id: string): string {
  return resolve(profileDir(dataDir, id), 'profile.json');
}

function assertValidModelFile(modelFile: string): void {
  if (!modelFile || modelFile.includes('/') || modelFile.includes('\\') || modelFile.includes('..')) {
    throw new AppError('VALIDATION_ERROR', 'modelFile must be a plain filename (no path separators)', {
      field: 'modelFile',
      value: modelFile,
    });
  }
  if (isAbsolute(modelFile)) {
    throw new AppError('VALIDATION_ERROR', 'modelFile must not be an absolute path', {
      field: 'modelFile',
      value: modelFile,
    });
  }
}

function assertValidModelRepo(modelRepo: string): void {
  if (!HF_REPO_RE.test(modelRepo)) {
    throw new AppError('VALIDATION_ERROR', 'modelRepo must look like owner/repo[:quant]', {
      field: 'modelRepo',
      value: modelRepo,
    });
  }
}

function assertNoReservedFlags(argsLine: string): void {
  let tokens: string[];
  try {
    tokens = tokenizeArgs(argsLine);
  } catch (err) {
    throw new AppError('VALIDATION_ERROR', (err as Error).message, { field: 'argsLine' });
  }
  const offenders = tokens
    .filter((t) => t.startsWith('-'))
    .map((t) => flagName(t))
    .filter((n) => (RESERVED_FLAGS as readonly string[]).includes(n));
  if (offenders.length > 0) {
    throw new AppError('RESERVED_FLAG', `args must not include reserved flags: ${Array.from(new Set(offenders)).join(', ')}`, {
      field: 'argsLine',
      flags: Array.from(new Set(offenders)),
    });
  }
}

function sanitize(input: NewProfile): NewProfile {
  const clean: NewProfile = {
    name: input.name.trim(),
    modelSource: input.modelSource,
    argsLine: input.argsLine.trim(),
  };

  if (input.modelSource === 'file') {
    if (!input.modelFile) {
      throw new AppError('VALIDATION_ERROR', 'modelFile is required when modelSource is "file"', {
        field: 'modelFile',
      });
    }
    assertValidModelFile(input.modelFile);
    clean.modelFile = input.modelFile.trim();
  } else if (input.modelSource === 'hf') {
    if (!input.modelRepo) {
      throw new AppError('VALIDATION_ERROR', 'modelRepo is required when modelSource is "hf"', {
        field: 'modelRepo',
      });
    }
    const repo = input.modelRepo.trim();
    assertValidModelRepo(repo);
    clean.modelRepo = repo;
  } else {
    throw new AppError('VALIDATION_ERROR', 'modelSource must be "file" or "hf"', { field: 'modelSource' });
  }

  assertNoReservedFlags(clean.argsLine);

  if (input.description !== undefined) clean.description = input.description;
  if (input.clonedFromTemplateId !== undefined) clean.clonedFromTemplateId = input.clonedFromTemplateId;
  return clean;
}

export async function listProfiles(dataDir: string): Promise<Profile[]> {
  const dir = profilesDir(dataDir);
  await mkdir(dir, { recursive: true });
  const entries = await readdir(dir, { withFileTypes: true });
  const results: Profile[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const p = profilePath(dataDir, entry.name);
    try {
      const body = await readFile(p, 'utf8');
      results.push(JSON.parse(body) as Profile);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    }
  }
  results.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return results;
}

export async function getProfile(dataDir: string, id: string): Promise<Profile> {
  try {
    const body = await readFile(profilePath(dataDir, id), 'utf8');
    return JSON.parse(body) as Profile;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new AppError('NOT_FOUND', `profile ${id} not found`, { id });
    }
    throw err;
  }
}

export async function createProfile(dataDir: string, input: NewProfile): Promise<Profile> {
  const clean = sanitize(input);
  const id = randomUUID();
  const now = new Date().toISOString();
  const profile: Profile = {
    id,
    ...clean,
    createdAt: now,
    updatedAt: now,
  };
  await mkdir(profileDir(dataDir, id), { recursive: true });
  await writeJsonAtomic(profilePath(dataDir, id), profile);
  return profile;
}

export async function updateProfile(dataDir: string, id: string, input: NewProfile): Promise<Profile> {
  const clean = sanitize(input);
  const existing = await getProfile(dataDir, id);
  const next: Profile = {
    ...existing,
    ...clean,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };
  await writeJsonAtomic(profilePath(dataDir, id), next);
  return next;
}

export async function deleteProfile(dataDir: string, id: string): Promise<void> {
  const dir = profileDir(dataDir, id);
  await withFileLock(profilePath(dataDir, id), async () => {
    try {
      await rm(dir, { recursive: true, force: false });
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new AppError('NOT_FOUND', `profile ${id} not found`, { id });
      }
      throw err;
    }
  });
}
