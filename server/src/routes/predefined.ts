import type { FastifyInstance } from 'fastify';

import { getTemplateById, loadPredefined } from '../config/predefined.js';
import { createProfile } from '../config/profiles.js';
import { cloneBodySchema } from '../schemas/predefined.js';

interface Deps {
  dataDir: string;
}

export async function registerPredefinedRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  app.get('/api/profiles/predefined', async () => {
    return loadPredefined();
  });

  app.post<{ Params: { templateId: string }; Body: { name?: string } }>(
    '/api/profiles/clone/:templateId',
    { schema: { body: cloneBodySchema } },
    async (request, reply) => {
      const data = await loadPredefined();
      const tpl = getTemplateById(data, request.params.templateId);
      const profile = await createProfile(deps.dataDir, {
        name: (request.body?.name ?? tpl.name).trim() || tpl.name,
        ...(tpl.description ? { description: tpl.description } : {}),
        modelSource: tpl.modelSource,
        ...(tpl.modelFile ? { modelFile: tpl.modelFile } : {}),
        ...(tpl.modelRepo ? { modelRepo: tpl.modelRepo } : {}),
        argsLine: tpl.argsLine,
        clonedFromTemplateId: tpl.id,
      });
      reply.code(201);
      return profile;
    },
  );
}
