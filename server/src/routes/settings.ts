import type { FastifyInstance } from 'fastify';

import { readSettings, verifyBinaryPath, verifyModelsDir, writeSettings } from '../config/settings.js';
import type { Settings } from '../config/settings.js';
import { settingsSchema } from '../schemas/settings.js';

interface Deps {
  dataDir: string;
}

export async function registerSettingsRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  app.get('/api/settings', async () => {
    return readSettings(deps.dataDir);
  });

  app.put<{ Body: Settings }>(
    '/api/settings',
    {
      schema: {
        body: settingsSchema,
      },
    },
    async (request) => {
      const next = request.body;
      await Promise.all([
        verifyBinaryPath(next.llamaServerBinaryPath),
        verifyModelsDir(next.modelsDir),
      ]);
      return writeSettings(deps.dataDir, next);
    },
  );
}
