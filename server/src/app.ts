import Fastify from 'fastify';
import type { FastifyError } from 'fastify';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { loadEnv } from './env.js';
import { AppError, errorBody } from './errors.js';
import { registerEventsRoute } from './routes/events.js';
import { registerModelsRoute } from './routes/models.js';
import { registerPredefinedRoutes } from './routes/predefined.js';
import { registerProfileRoutes } from './routes/profiles.js';
import { registerServerRoutes } from './routes/server.js';
import { registerSessionRoutes } from './routes/sessions.js';
import { registerSettingsRoutes } from './routes/settings.js';
import { startLogsPipeline } from './logs/pipeline.js';

async function main(): Promise<void> {
  const env = await loadEnv();

  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? 'info',
      transport: process.env.NODE_ENV === 'production' ? undefined : {
        target: 'pino-pretty',
        options: {
          translateTime: 'HH:MM:ss.l',
          singleLine: true,
          ignore: 'pid,hostname,reqId,req.host,req.remoteAddress,req.remotePort',
        },
      },
    },
  });

  app.setErrorHandler((err: FastifyError, _request, reply) => {
    if (err instanceof AppError) {
      return reply.status(err.statusCode).send(errorBody(err.code, err.message, err.details));
    }
    if (err.validation) {
      const first = err.validation[0];
      const field = first?.instancePath?.replace(/^\//, '') ?? undefined;
      return reply.status(400).send(
        errorBody('VALIDATION_ERROR', err.message, field ? { field } : undefined),
      );
    }
    const statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
    if (statusCode >= 500) app.log.error(err);
    return reply.status(statusCode).send(
      errorBody(statusCode >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR', err.message),
    );
  });

  if (env.webOrigin) {
    await app.register(cors, { origin: env.webOrigin, credentials: true });
  }

  app.get('/api/health', async () => ({ ok: true, dataDir: env.dataDir }));

  if (env.webDist) {
    await app.register(staticPlugin, {
      root: env.webDist,
      prefix: '/',
      wildcard: false,
    });
    const indexHtmlPath = resolve(env.webDist, 'index.html');
    app.setNotFoundHandler(async (request, reply) => {
      if (request.method !== 'GET' || request.url.startsWith('/api')) {
        return reply.code(404).send(errorBody('NOT_FOUND', `no route for ${request.method} ${request.url}`));
      }
      try {
        const html = await readFile(indexHtmlPath, 'utf8');
        reply.header('Content-Type', 'text/html; charset=utf-8');
        return reply.send(html);
      } catch {
        return reply.code(404).send(errorBody('NOT_FOUND', 'index.html missing'));
      }
    });
  }

  await registerSettingsRoutes(app, { dataDir: env.dataDir });
  // Predefined routes must register before the parametric /api/profiles/:id
  // handler so that find-my-way matches the static 'predefined' segment first.
  await registerPredefinedRoutes(app, { dataDir: env.dataDir });
  await registerProfileRoutes(app, { dataDir: env.dataDir });
  await registerModelsRoute(app, { dataDir: env.dataDir });
  await registerServerRoutes(app, { dataDir: env.dataDir });
  await registerSessionRoutes(app, { dataDir: env.dataDir });
  await registerEventsRoute(app);

  startLogsPipeline(env.dataDir);

  try {
    await app.listen({ port: env.port, host: env.host });
    app.log.info({ dataDir: env.dataDir }, 'llama-runner API ready');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

void main();
