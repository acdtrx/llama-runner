import { writeFile, rename, open, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

const queues = new Map<string, Promise<unknown>>();

export function withFileLock<T>(path: string, fn: () => Promise<T>): Promise<T> {
  const previous = queues.get(path) ?? Promise.resolve();
  const next = previous.then(fn, fn);
  queues.set(
    path,
    next.finally(() => {
      if (queues.get(path) === next) queues.delete(path);
    }),
  );
  return next;
}

// Writes without acquiring the per-path lock. Caller must already hold it OR
// be in a context where no other writer races.
export async function writeJsonUnsafe(path: string, value: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.tmp`;
  const body = `${JSON.stringify(value, null, 2)}\n`;
  await writeFile(tmp, body, 'utf8');
  const fh = await open(tmp, 'r+');
  try {
    await fh.sync();
  } finally {
    await fh.close();
  }
  await rename(tmp, path);
}

export function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  return withFileLock(path, () => writeJsonUnsafe(path, value));
}
