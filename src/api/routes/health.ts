import type { FastifyInstance } from 'fastify';
import type { RuntimeMode } from '../../config/runtimeMode.js';
import { categoryCapabilities } from '../../categories/category.js';

export function registerHealth(app: FastifyInstance, mode: RuntimeMode = 'LIVE'): void {
  app.get('/health', async () => ({ status: 'ok', service: 'AutoHunter', version: '0.1.0', mode, categories: categoryCapabilities }));
}
