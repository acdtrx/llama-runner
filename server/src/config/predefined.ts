import { constants as fsConstants } from 'node:fs';
import { copyFile, mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { AppError } from '../errors.js';

export type ModelSource = 'file' | 'hf';

export interface PredefinedTemplate {
  id: string;
  name: string;
  description?: string;
  modelSource: ModelSource;
  modelFile?: string;
  modelRepo?: string;
  argsLine: string;
  tags?: string[];
}

export interface PredefinedProfiles {
  version: number;
  templates: PredefinedTemplate[];
}

let cache: PredefinedProfiles | null = null;

function defaultDataFilePath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', 'data', 'predefined-profiles.json');
}

function defaultSeedFilePath(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', 'seed', 'predefined-profiles.json');
}

async function ensureSeeded(dataPath: string, seedPath: string): Promise<void> {
  await mkdir(dirname(dataPath), { recursive: true });
  try {
    await copyFile(seedPath, dataPath, fsConstants.COPYFILE_EXCL);
  } catch (err) {
    // EEXIST: user already has their own copy — preserve it
    if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
  }
}

const ID_RE = /^[a-z0-9][a-z0-9-]{0,63}$/;

function validate(value: unknown): asserts value is PredefinedProfiles {
  if (!value || typeof value !== 'object') throw new Error('must be an object');
  const root = value as Record<string, unknown>;
  if (typeof root.version !== 'number' || !Number.isInteger(root.version) || root.version < 1) {
    throw new Error('version must be a positive integer');
  }
  if (!Array.isArray(root.templates)) throw new Error('templates must be an array');
  const ids = new Set<string>();
  root.templates.forEach((t, i) => {
    if (!t || typeof t !== 'object') throw new Error(`templates[${i}] must be an object`);
    const tpl = t as Record<string, unknown>;
    if (typeof tpl.id !== 'string' || !ID_RE.test(tpl.id)) {
      throw new Error(`templates[${i}].id must match ${ID_RE}`);
    }
    if (ids.has(tpl.id)) throw new Error(`duplicate template id: ${tpl.id}`);
    ids.add(tpl.id);
    if (typeof tpl.name !== 'string' || tpl.name.length === 0) {
      throw new Error(`templates[${i}].name must be a non-empty string`);
    }
    if (tpl.modelSource !== 'file' && tpl.modelSource !== 'hf') {
      throw new Error(`templates[${i}].modelSource must be "file" or "hf"`);
    }
    if (tpl.modelSource === 'file') {
      if (typeof tpl.modelFile !== 'string' || tpl.modelFile.length === 0) {
        throw new Error(`templates[${i}].modelFile must be a non-empty string`);
      }
    } else {
      if (typeof tpl.modelRepo !== 'string' || tpl.modelRepo.length === 0) {
        throw new Error(`templates[${i}].modelRepo must be a non-empty string`);
      }
    }
    if (typeof tpl.argsLine !== 'string') {
      throw new Error(`templates[${i}].argsLine must be a string`);
    }
    if (tpl.description !== undefined && typeof tpl.description !== 'string') {
      throw new Error(`templates[${i}].description must be a string`);
    }
    if (tpl.tags !== undefined && (!Array.isArray(tpl.tags) || !tpl.tags.every((t2) => typeof t2 === 'string'))) {
      throw new Error(`templates[${i}].tags must be string[]`);
    }
  });
}

export async function loadPredefined(
  path: string = defaultDataFilePath(),
  seedPath: string = defaultSeedFilePath(),
): Promise<PredefinedProfiles> {
  if (cache) return cache;

  await ensureSeeded(path, seedPath);

  const body = await readFile(path, 'utf8');
  const parsed: unknown = JSON.parse(body);

  try {
    validate(parsed);
  } catch (err) {
    throw new AppError(
      'INTERNAL_ERROR',
      `invalid predefined-profiles.json: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  cache = parsed;
  return parsed;
}

export function getTemplateById(data: PredefinedProfiles, id: string): PredefinedTemplate {
  const tpl = data.templates.find((t) => t.id === id);
  if (!tpl) throw new AppError('NOT_FOUND', `template ${id} not found`, { id });
  return tpl;
}

export function resetPredefinedCache(): void {
  cache = null;
}
