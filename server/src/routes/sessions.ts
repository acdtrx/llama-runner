import { createReadStream } from 'node:fs';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

import { listSessions, rawLogInfo, readSession } from '../sessions/read.js';
import { AppError } from '../errors.js';

interface Deps {
  dataDir: string;
}

interface ParsedRange {
  start: number;
  end: number;
}

function parseRange(header: string | undefined, size: number): ParsedRange | null {
  if (!header) return null;
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!m) return null;
  const startRaw = m[1] ?? '';
  const endRaw = m[2] ?? '';
  let start: number;
  let end: number;
  if (startRaw === '' && endRaw === '') return null;
  if (startRaw === '') {
    const suffix = Number.parseInt(endRaw, 10);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number.parseInt(startRaw, 10);
    end = endRaw === '' ? size - 1 : Number.parseInt(endRaw, 10);
  }
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start > end || start >= size) return null;
  if (end >= size) end = size - 1;
  return { start, end };
}

export async function registerSessionRoutes(app: FastifyInstance, deps: Deps): Promise<void> {
  app.get<{ Params: { profileId: string } }>(
    '/api/profiles/:profileId/sessions',
    async (request) => {
      const sessions = await listSessions(deps.dataDir, request.params.profileId);
      return { sessions };
    },
  );

  app.get<{ Params: { profileId: string; sessionId: string } }>(
    '/api/profiles/:profileId/sessions/:sessionId',
    async (request) => {
      return readSession(deps.dataDir, request.params.profileId, request.params.sessionId);
    },
  );

  app.get<{ Params: { profileId: string; sessionId: string } }>(
    '/api/profiles/:profileId/sessions/:sessionId/log',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const params = request.params as { profileId: string; sessionId: string };
      const info = await rawLogInfo(deps.dataDir, params.profileId, params.sessionId);
      const rangeHeader = request.headers.range;
      const range = parseRange(typeof rangeHeader === 'string' ? rangeHeader : undefined, info.size);

      reply.header('Accept-Ranges', 'bytes');
      reply.header('Content-Type', 'text/plain; charset=utf-8');

      if (rangeHeader && !range) {
        reply.header('Content-Range', `bytes */${info.size}`);
        throw new AppError('VALIDATION_ERROR', 'invalid or unsatisfiable Range');
      }

      if (range) {
        reply.code(206);
        reply.header('Content-Range', `bytes ${range.start}-${range.end}/${info.size}`);
        reply.header('Content-Length', String(range.end - range.start + 1));
        return reply.send(createReadStream(info.path, { start: range.start, end: range.end }));
      }

      reply.header('Content-Length', String(info.size));
      return reply.send(createReadStream(info.path));
    },
  );
}
