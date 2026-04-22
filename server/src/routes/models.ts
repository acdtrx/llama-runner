import type { FastifyInstance } from 'fastify';
import { readdir, stat } from 'node:fs/promises';

import { readSettings } from '../config/settings.js';
import { AppError } from '../errors.js';

interface Deps {
  dataDir: string;
}

export async function registerModelsRoute(app: FastifyInstance, deps: Deps): Promise<void> {
  app.get('/api/models', async () => {
    const settings = await readSettings(deps.dataDir);
    const modelsDir = settings.modelsDir;
    if (!modelsDir) {
      throw new AppError('NOT_CONFIGURED', 'modelsDir is not set', { field: 'modelsDir' });
    }
    try {
      const info = await stat(modelsDir);
      if (!info.isDirectory()) {
        throw new AppError('NOT_CONFIGURED', 'modelsDir is not a directory', { path: modelsDir });
      }
    } catch (err) {
      if (err instanceof AppError) throw err;
      throw new AppError('NOT_CONFIGURED', 'modelsDir not accessible', { path: modelsDir });
    }
    const entries = await readdir(modelsDir, { withFileTypes: true });
    const files = entries
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.gguf'))
      .map((e) => e.name)
      .sort();
    return { files };
  });
}
