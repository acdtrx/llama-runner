import { readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

export interface PruneResult {
  retained: number;
  pruned: string[];
}

export async function pruneSessions(
  dataDir: string,
  profileId: string,
  limit: number,
): Promise<PruneResult> {
  const sessionsDir = resolve(dataDir, 'profiles', profileId, 'sessions');
  let entries: string[];
  try {
    const direntries = await readdir(sessionsDir, { withFileTypes: true });
    entries = direntries.filter((e) => e.isDirectory()).map((e) => e.name);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return { retained: 0, pruned: [] };
    throw err;
  }

  // Session ids are UTC ISO-8601 with colons replaced by hyphens, so
  // lexicographic sort is chronological.
  entries.sort();

  if (entries.length <= limit) return { retained: entries.length, pruned: [] };

  const toDelete = entries.slice(0, entries.length - limit);
  const pruned: string[] = [];
  for (const name of toDelete) {
    const dir = resolve(sessionsDir, name);
    try {
      await rm(dir, { recursive: true, force: false });
      pruned.push(name);
    } catch (err) {
      // Best-effort: don't block server lifecycle on a single deletion failure.
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
        // Caller can log; keep function pure-ish.
      }
    }
  }
  return { retained: entries.length - pruned.length, pruned };
}
