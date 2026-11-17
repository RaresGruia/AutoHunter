import assert from 'node:assert/strict';
import { request } from 'node:http';
import { buildServer } from '../dist/src/api/server.js';
import { searchCars } from '../dist/src/services/searchService.js';
import { defaultSearchSettings } from '../dist/src/config/searchSettings.js';
import { OlxSourceAdapter } from '../dist/src/sources/olx/OlxSourceAdapter.js';

// Real local HTTP, file-only engine. The gate proves POST does not wait for the engine.
const fixture = await searchCars(defaultSearchSettings, [new OlxSourceAdapter({ mode: 'fixture' })]);
let release;
const gate = new Promise(resolve => { release = resolve; });
const app = await buildServer({ search: async () => { await gate; return fixture; } });
const deadline = Date.now() + 10_000;
const get = async url => {
  const response = await fetch(url, { signal: AbortSignal.timeout(3000), headers: { Connection: 'close' } });
  assert.equal(response.status, 200); return response.json();
};
try {
  const base = await app.listen({ host: '127.0.0.1', port: 0 });
  assert.equal((await get(`${base}/health`)).status, 'ok');
  const { origin: _origin, registrationPenalty: _penalty, ...settings } = defaultSearchSettings;
  const accepted = await new Promise((resolve, reject) => {
    const client = request(`${base}/api/cars/search`, { method: 'POST', agent: false,
      headers: { 'Content-Type': 'application/json', Connection: 'close' } }, response => {
      let data = ''; response.on('data', chunk => { data += chunk; });
      response.on('end', () => {
        client.destroy();
        try { assert.equal(response.statusCode, 202); resolve(JSON.parse(data)); } catch (error) { reject(error); }
      });
    });
    client.setTimeout(3000, () => client.destroy(new Error('POST timeout')));
    client.on('error', reject); client.end(JSON.stringify({ ...settings, limit: 10 }));
  });
  assert.equal(accepted.status, 'RUNNING');
  assert.equal((await get(`${base}/api/cars/search/${accepted.searchId}`)).status, 'RUNNING');
  release();
  let job;
  do {
    if (Date.now() > deadline) throw new Error('Job completion timeout');
    job = await get(`${base}/api/cars/search/${accepted.searchId}`);
    if (job.status === 'RUNNING') await new Promise(resolve => setTimeout(resolve, 50));
  } while (job.status === 'RUNNING');
  assert.equal(job.status, 'COMPLETED'); assert.ok(job.response.results.length > 0);
  assert.equal((await get(`${base}/api/cars/search/current`)).searchId, accepted.searchId);
  console.log('PASS: 202 -> RUNNING -> client disconnected -> COMPLETED with results.');
} finally {
  release();
  await app.close();
  assert.equal(app.server.listening, false);
  console.log('Temporary HTTP server closed. No watcher or persistent server started.');
}
