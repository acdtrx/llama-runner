import type { FastifyInstance } from 'fastify';

import { readSettings } from '../config/settings.js';
import { getProfile } from '../config/profiles.js';
import { llamaServer } from '../process/llamaServer.js';

interface Deps {
  dataDir: string;
}

const startBodySchema = {
  $id: 'StartServerBody',
  type: 'object',
  required: ['profileId'],
  additionalProperties: false,
  properties: {
    profileId: { type: 'string', minLength: 1 },
  },
} as const;

export async function registerServerRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  app.get('/api/server/status', async () => {
    return llamaServer.getStatus();
  });

  app.post<{ Body: { profileId: string } }>(
    '/api/server/start',
    { schema: { body: startBodySchema } },
    async (request) => {
      const [settings, profile] = await Promise.all([
        readSettings(deps.dataDir),
        getProfile(deps.dataDir, request.body.profileId),
      ]);
      return llamaServer.start(profile, settings, deps.dataDir);
    },
  );

  app.post('/api/server/stop', async () => {
    return llamaServer.stop();
  });
}
