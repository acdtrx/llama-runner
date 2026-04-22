import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { mkdir, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

export interface Env {
  dataDir: string;
  port: number;
  host: string;
  webOrigin: string | null;
  webDist: string | null;
}

async function resolveWebDist(): Promise<string | null> {
  const explicit = process.env.WEB_DIST;
  if (explicit) {
    try {
      const info = await stat(explicit);
      if (info.isDirectory()) return resolve(explicit);
    } catch {
      // fallthrough
    }
    return null;
  }
  if (process.env.NODE_ENV !== 'production') return null;
  const here = dirname(fileURLToPath(import.meta.url));
  const candidate = resolve(here, '..', '..', 'web', 'dist');
  try {
    const info = await stat(candidate);
    if (info.isDirectory()) return candidate;
  } catch {
    // fallthrough
  }
  return null;
}

export async function loadEnv(): Promise<Env> {
  const dataDir = resolve(process.env.LLAMA_RUNNER_DATA_DIR ?? `${homedir()}/.llama-runner`);
  await mkdir(dataDir, { recursive: true });
  await mkdir(`${dataDir}/profiles`, { recursive: true });

  const port = Number.parseInt(process.env.PORT ?? '3030', 10);
  const host = process.env.HOST ?? '127.0.0.1';
  const webOrigin = process.env.WEB_ORIGIN ?? (process.env.NODE_ENV === 'production' ? null : 'http://localhost:5173');
  const webDist = await resolveWebDist();

  return { dataDir, port, host, webOrigin, webDist };
}
