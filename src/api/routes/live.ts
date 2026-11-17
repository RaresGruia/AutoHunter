import type { FastifyInstance } from 'fastify';
import { LiveService } from '../../live/service.js';
import type { LiveCategory } from '../../live/types.js';

export function registerLive(app: FastifyInstance, service = new LiveService()): void {
  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/live/') || !request.headers.origin) return;
    try {
      const origin = new URL(request.headers.origin),
        destination = new URL('http://' + request.headers.host);
      if (
        !['http:', 'https:'].includes(origin.protocol) ||
        !['localhost', '127.0.0.1', destination.hostname].includes(origin.hostname) ||
        !['8081', '8082'].includes(origin.port)
      )
        return reply.code(403).send({ error: { code: 'LIVE_ORIGIN_FORBIDDEN' } });
    } catch {
      return reply.code(403).send({ error: { code: 'LIVE_ORIGIN_FORBIDDEN' } });
    }
  });
  app.get('/api/live/status', async (_request, reply) =>
    reply.header('Cache-Control', 'no-store').send(await service.status()),
  );
  app.post<{ Body: { category: LiveCategory; query: string; includeUnavailable?: boolean } }>(
    '/api/live/search',
    {
      schema: {
        body: {
          type: 'object',
          additionalProperties: false,
          required: ['category', 'query'],
          properties: {
            category: { enum: ['cars', 'tractors', 'tools'] },
            query: { type: 'string', minLength: 2, maxLength: 160, pattern: '\\S' },
            includeUnavailable: { type: 'boolean' },
          },
        },
      },
    },
    async (request, reply) =>
      reply
        .header('Cache-Control', 'no-store')
        .send(
          await service.search(
            request.body.category,
            request.body.query.trim(),
            request.body.includeUnavailable ?? false,
          ),
        ),
  );
  app.post('/api/live/availability-report', async (request, reply) => {
    try {
      return reply.code(201).send(await service.reportAvailability(request.body));
    } catch (error) {
      if (error instanceof Error && error.message === 'INVALID_AVAILABILITY_REPORT')
        return reply.code(400).send({ error: { code: error.message } });
      throw error;
    }
  });
  app.post('/api/live/import', async (request, reply) => {
    try {
      return reply.code(201).send(await service.import(request.body));
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      if (
        /^(?:INVALID_|DATA_PERMISSION_|IMAGE_PERMISSION_|ACTUAL_ITEM_|TOO_MANY_|MANUAL_IMPORT_LIMIT)/.test(
          message,
        )
      )
        return reply.code(400).send({
          error: {
            code: message,
            message: 'Verifică datele și drepturile declarate. URL-ul nu a fost accesat automat.',
          },
        });
      throw error;
    }
  });
}
