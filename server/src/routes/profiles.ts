import type { FastifyInstance } from 'fastify';

import {
  createProfile,
  deleteProfile,
  getProfile,
  listProfiles,
  updateProfile,
} from '../config/profiles.js';
import type { NewProfile } from '../config/profiles.js';
import { newProfileSchema } from '../schemas/profile.js';

interface Deps {
  dataDir: string;
}

export async function registerProfileRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  app.get('/api/profiles', async () => {
    const profiles = await listProfiles(deps.dataDir);
    return { profiles };
  });

  app.get<{ Params: { id: string } }>('/api/profiles/:id', async (request) => {
    return getProfile(deps.dataDir, request.params.id);
  });

  app.post<{ Body: NewProfile }>(
    '/api/profiles',
    { schema: { body: newProfileSchema } },
    async (request, reply) => {
      const profile = await createProfile(deps.dataDir, request.body);
      reply.code(201);
      return profile;
    },
  );

  app.put<{ Params: { id: string }; Body: NewProfile }>(
    '/api/profiles/:id',
    { schema: { body: newProfileSchema } },
    async (request) => {
      return updateProfile(deps.dataDir, request.params.id, request.body);
    },
  );

  app.delete<{ Params: { id: string } }>('/api/profiles/:id', async (request, reply) => {
    await deleteProfile(deps.dataDir, request.params.id);
    reply.code(204);
    return reply.send();
  });
}
