import type { FastifyInstance } from 'fastify';
import { defaultSearchSettings } from '../../config/searchSettings.js';
import { normalizeText } from '../../analysis/text.js';
import type { ApiError, CarSearchRequest, SearchJobResponse, SearchEngine } from '../types.js';
import { SearchJobs } from '../searchJobs.js';

export function registerCarSearch(app: FastifyInstance, search: SearchEngine): void {
  const jobs = new SearchJobs(search, error => app.log.error({ err: error }, 'Car search job failed'));
  app.get('/api/cars/search/current', async (_request, reply) => {
    reply.header('Cache-Control', 'no-store');
    return jobs.current();
  });
  app.get<{ Params: { searchId: string } }>('/api/cars/search/:searchId', async (request, reply) => {
    reply.header('Cache-Control', 'no-store');
    const job = jobs.get(request.params.searchId);
    if (!job) return reply.code(404).send({ error: { code: 'SEARCH_NOT_FOUND', message: 'Search job not found or no longer retained.' } });
    return job;
  });
  app.post<{ Body: CarSearchRequest; Reply: SearchJobResponse | (ApiError & { searchId?: string }) }>('/api/cars/search', {
    schema: {
      body: {
        type: 'object', additionalProperties: false,
        required: ['location', 'radiusKm', 'minPriceEur', 'maxPriceEur', 'minYear', 'maxMileageKm', 'excludeDamaged', 'limit'],
        properties: {
          location: { type: 'string', minLength: 1, maxLength: 120, pattern: '\\S' },
          radiusKm: { type: 'number', minimum: 10, maximum: 500 },
          minPriceEur: { type: 'number', minimum: 0 },
          maxPriceEur: { type: 'number', minimum: 0 },
          minYear: { type: 'integer', minimum: 1980 },
          maxMileageKm: { type: 'number', minimum: 0 },
          excludeDamaged: { type: 'boolean' },
          limit: { type: 'integer', minimum: 1, maximum: 30 },
          origin: {
            type: 'object', additionalProperties: false, required: ['latitude', 'longitude'],
            properties: { latitude: { type: 'number', minimum: -90, maximum: 90 },
              longitude: { type: 'number', minimum: -180, maximum: 180 } },
          },
        },
      },
    },
  }, async (request, reply) => {
    const body = { ...request.body, location: request.body.location.trim() };
    if (body.maxPriceEur <= body.minPriceEur || body.minYear > new Date().getFullYear()) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'maxPriceEur must exceed minPriceEur and minYear cannot exceed the current year.' } });
    }
    const origin = body.origin ?? (normalizeText(body.location) === normalizeText(defaultSearchSettings.location)
      ? { ...defaultSearchSettings.origin } : undefined);
    if (!origin) return reply.code(400).send({ error: { code: 'LOCATION_COORDINATES_REQUIRED',
      message: 'Provide origin.latitude and origin.longitude for locations other than the configured default.' } });
    if (!/[a-z0-9]/.test(normalizeText(body.location))) {
      return reply.code(400).send({ error: { code: 'INVALID_REQUEST', message: 'location must identify a locality.' } });
    }
    const started = jobs.start(body, { location: body.location, origin, radiusKm: body.radiusKm,
        minPriceEur: body.minPriceEur, maxPriceEur: body.maxPriceEur, minYear: body.minYear,
        maxMileageKm: body.maxMileageKm, excludeDamaged: body.excludeDamaged,
        registrationPenalty: defaultSearchSettings.registrationPenalty ?? 3 });
    if (!started.created) return reply.code(409).send({ error: { code: 'SEARCH_IN_PROGRESS', message: 'A search is already running.' }, searchId: started.job.searchId });
    return reply.code(202).send(started.job);
  });
}
