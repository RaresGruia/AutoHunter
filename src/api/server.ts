import { createDiscoveryService } from '../discovery/config.js';
import { registerDiscovery } from './routes/discovery.js';
import { registerDemoImages } from './routes/demoImages.js';
import { registerLive } from './routes/live.js';
import type { LiveService } from '../live/service.js';
import { demoVehicles } from '../demo/vehicles.js';
import { historicalAnalysis } from '../demo/historical.js';
import Fastify, { type FastifyError } from 'fastify';
import cors from '@fastify/cors';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { searchCars } from '../services/searchService.js';
import { OlxSourceAdapter } from '../sources/olx/OlxSourceAdapter.js';
import { registerHealth } from './routes/health.js';
import { registerCarSearch } from './routes/carSearch.js';
import type { SearchEngine } from './types.js';
import { runtimeMode, type RuntimeMode } from '../config/runtimeMode.js';
import { registerTractorSearch, type TractorEngine } from './routes/tractorSearch.js';
import { searchTractors } from '../tractors/search.js';
import { DemoTractorSourceAdapter } from '../tractors/demoSource.js';
import { registerToolSearch, type ToolEngine } from './routes/toolSearch.js';
import { searchTools } from '../tools/search.js';
import { DemoToolSourceAdapter } from '../tools/demoSource.js';

export async function buildServer(
  options: {
    search?: SearchEngine;
    tractorSearch?: TractorEngine;
    toolSearch?: ToolEngine;
    mode?: RuntimeMode;
    logger?: boolean;
    demoImageDirectory?: string;
    demoImageManifestPath?: string;
    sourcesConfigFile?: string;
    liveService?: LiveService;
  } = {},
) {
  const configuredMode = runtimeMode();
  const mode = configuredMode === 'DEMO' ? 'DEMO' : (options.mode ?? configuredMode);
  const app = Fastify({
    logger: options.logger ?? false,
    bodyLimit: 16 * 1024,
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false, useDefaults: false } },
  });
  // Development API, no credentials; startup supports the phone over the local network.
  await app.register(cors, { origin: '*', methods: ['GET', 'POST', 'OPTIONS'] });
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    const status = error.statusCode ?? 500;
    if (status >= 400 && status < 500) {
      return reply
        .code(status)
        .send({ error: { code: 'INVALID_REQUEST', message: 'Invalid request body or content type.' } });
    }
    request.log.error({ err: error }, 'API request failed');
    return reply
      .code(500)
      .send({ error: { code: 'INTERNAL_ERROR', message: 'Request could not be completed.' } });
  });
  app.setNotFoundHandler((_request, reply) =>
    reply.code(404).send({ error: { code: 'NOT_FOUND', message: 'Route not found.' } }),
  );
  registerHealth(app, mode);
  registerLive(app, options.liveService);
  registerDiscovery(app, await createDiscoveryService(options.sourcesConfigFile));
  if (mode === 'DEMO') {
    registerDemoImages(app, options.demoImageDirectory, options.demoImageManifestPath);
    app.get('/api/demo/cars', async (_request, reply) =>
      reply.header('Cache-Control', 'no-store').send(await demoVehicles(options.demoImageManifestPath)),
    );
    app.get('/api/history/cars', async (_request, reply) =>
      reply.header('Cache-Control', 'no-store').send(await historicalAnalysis(options.demoImageManifestPath)),
    );
  }
  registerCarSearch(
    app,
    options.search ??
      ((settings) => {
        if (mode !== 'DEMO')
          throw new Error(
            'SOURCE_AUTHORIZATION_REQUIRED: use /api/live/search; legacy OLX collection is disabled.',
          );
        return searchCars(settings, [
          new OlxSourceAdapter({
            mode: 'fixture',
            ...(options.demoImageManifestPath
              ? { demoImageManifestPath: options.demoImageManifestPath }
              : {}),
          }),
        ]);
      }),
  );
  registerTractorSearch(
    app,
    mode,
    options.tractorSearch ??
      ((settings) => searchTractors(settings, new DemoTractorSourceAdapter(options.demoImageManifestPath))),
  );
  registerToolSearch(
    app,
    mode,
    options.toolSearch ??
      ((settings) => searchTools(settings, new DemoToolSourceAdapter(options.demoImageManifestPath))),
  );
  return app;
}

export function parsePort(value: string | undefined): number {
  const port = value === undefined ? 3000 : Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT must be an integer between 1 and 65535.');
  return port;
}

async function main(): Promise<void> {
  // Runtime options load once; the LIVE service reads its secrets dynamically from .env.
  try {
    const local = parseEnv(await readFile('.env', 'utf8'));
    for (const key of ['AUTOHUNTER_MODE', 'PORT', 'HOST', 'AUTOHUNTER_SOURCES_CONFIG'])
      if (process.env[key] === undefined && local[key] !== undefined) process.env[key] = local[key];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      throw Error('Invalid local environment configuration');
  }
  const port = parsePort(process.env.PORT);
  const app = await buildServer({
    logger: true,
    ...(process.env.AUTOHUNTER_SOURCES_CONFIG
      ? { sourcesConfigFile: process.env.AUTOHUNTER_SOURCES_CONFIG }
      : {}),
  });
  await app.listen({ port, host: process.env.HOST ?? '0.0.0.0' });
  const shutdown = (): void => {
    void app.close().catch((error) => {
      app.log.error(error);
      process.exitCode = 1;
    });
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : 'API startup failed.');
    process.exitCode = 1;
  });
}
