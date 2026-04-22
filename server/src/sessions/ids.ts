import { access } from 'node:fs/promises';
import { resolve } from 'node:path';

function baseSessionId(now: Date = new Date()): string {
  const iso = now.toISOString();
  const withoutMs = iso.replace(/\.\d+Z$/, 'Z');
  return withoutMs.replace(/:/g, '-');
}

export async function allocateSessionId(profileDir: string): Promise<string> {
  const base = baseSessionId();
  let candidate = base;
  for (let i = 1; i < 100; i += 1) {
    const dir = resolve(profileDir, 'sessions', candidate);
    try {
      await access(dir);
      candidate = `${base}-${i}`;
    } catch {
      return candidate;
    }
  }
  throw new Error(`exhausted session id suffixes for ${base}`);
}
