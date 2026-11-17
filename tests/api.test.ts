import { before, test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer, parsePort } from '../src/api/server.js';
import { searchCars, type SearchResult } from '../src/services/searchService.js';
import { defaultSearchSettings } from '../src/config/searchSettings.js';
import { OlxSourceAdapter } from '../src/sources/olx/OlxSourceAdapter.js';
import type { CarSearchRequest, CarSearchResponse } from '../src/api/types.js';
import type { SearchSettings } from '../src/models/SearchSettings.js';
import type { FastifyInstance } from 'fastify';
import type { SearchJobResponse } from '../src/api/types.js';
import { request as httpRequest } from 'node:http';

async function waitForJob(app: FastifyInstance, id: string): Promise<SearchJobResponse> {
  for (let attempt = 0; attempt < 200; attempt++) {
    const response = await app.inject(`/api/cars/search/${id}`);
    assert.equal(response.statusCode, 200);
    const job = response.json<SearchJobResponse>();
    if (job.status !== 'RUNNING') return job;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error('Test job did not finish');
}
async function completedResponse(app: FastifyInstance, payload: CarSearchRequest) {
  const accepted = await app.inject({ method: 'POST', url: '/api/cars/search', payload });
  assert.equal(accepted.statusCode, 202);
  const job = await waitForJob(app, accepted.json().searchId);
  assert.equal(job.status, 'COMPLETED');
  if (job.status !== 'COMPLETED') throw new Error('Expected completed job');
  return { statusCode: 200, body: JSON.stringify(job.response), json: <T = CarSearchResponse>() => job.response as T };
}

const body: CarSearchRequest = { location: 'Deva', radiusKm: 100, minPriceEur: 2000, maxPriceEur: 10000,
  minYear: 2008, maxMileageKm: 250000, excludeDamaged: true, limit: 10 };
let fixture: SearchResult;
before(async () => {
  // File-only adapter: all HTTP route tests inject a fake engine, never the LIVE default.
  fixture = await searchCars(defaultSearchSettings, [new OlxSourceAdapter({ mode: 'fixture' })]);
});

test('API health returns the service identity without running a search', async t => {
  const app = await buildServer({ search: async () => { throw new Error('must not search'); } });
  t.after(() => app.close());
  const response = await app.inject({ method: 'GET', url: '/health' });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { status: 'ok', service: 'AutoHunter', version: '0.1.0', mode: 'LIVE',
    categories: { cars: { demo:true, live:true }, tractors: { demo:true, live:false }, tools: { demo:true, live:false }, equipment: { demo:false, live:false } } });
});

test('API valid request forwards settings and returns a limited explicit JSON projection', async t => {
  let received: SearchSettings | undefined;
  const first = fixture.results[0]!;
  const contaminated = { ...first, listing: { ...first.listing, rawData: { secret: '<html>PRIVATE_RAW</html>' },
    description: '<html>PRIVATE_DESCRIPTION</html>', imageUrl: 'https://example.invalid/image.jpg', imageUrls: ['https://example.invalid/image.jpg'], thumbnailUrl: null } };
  const result = { ...fixture, results: [contaminated, ...fixture.results.slice(1)],
    needsManualVerification: [{ ...contaminated, seriousConflict: true, dataConflicts: ['AN INCONSISTENT'] }],
    excludedAfterVerification: [{ ...contaminated, warnings: ['Motor defect'] }] };
  const app = await buildServer({ search: async settings => { received = settings; return result; } });
  t.after(() => app.close());
  const response = await completedResponse(app, { ...body, limit: 1 });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(received, defaultSearchSettings);
  const json = response.json<CarSearchResponse>();
  assert.equal(json.results.length, 1);
  assert.equal(json.meta.totalResults, result.results.length);
  assert.equal(json.meta.localFetched, fixture.fetchedCount);
  assert.equal(json.meta.verified, fixture.verification.succeeded);
  assert.equal(json.meta.returnedResults, 1);
  assert.ok(Number.isFinite(Date.parse(json.meta.searchedAt)));
  assert.ok(json.meta.durationMs >= 0);
  assert.deepEqual(json.results[0]!.price, { askingEur: first.listing.priceEur,
    estimatedMarketEur: first.estimate.estimatedMarketPrice, discountPercent: first.estimate.discountPercent,
    potentialSavingEur: first.estimate.absoluteSavingEur, comparableCount: first.estimate.comparableCount,
    confidence: first.estimate.confidenceScore });
  assert.equal(json.results[0]!.scores.deal, first.dealScore);
  assert.equal(json.results[0]!.scores.flipPotential, first.flipPotentialScore);
  assert.equal(json.results[0]!.risks.cosmetic, first.risk.cosmeticRisk);
  assert.deepEqual(json.results[0]!.warnings, first.warnings);
  assert.equal(json.results[0]!.imageUrl, 'https://example.invalid/image.jpg');
  assert.deepEqual(json.results[0]!.imageUrls, ['https://example.invalid/image.jpg']);
  assert.equal(json.results[0]!.thumbnailUrl, null);
  assert.equal(json.needsManualVerification[0]!.verification.seriousConflict, true);
  assert.deepEqual(json.needsManualVerification[0]!.verification.dataConflicts, ['AN INCONSISTENT']);
  assert.equal(json.excludedAfterVerification.length, 1);
  assert.doesNotMatch(response.body, /PRIVATE_|rawData|description|preliminary|<html>/);
});

test('API preserves missing values as null and failed verification as a partial result', async t => {
  const first = fixture.results[0]!;
  const app = await buildServer({ search: async () => ({ ...fixture, results: [{ ...first,
    verificationStatus: 'FAILED', distanceKm: null, listing: { ...first.listing, imageUrl: null, imageUrls: [], thumbnailUrl: null, year: null,
      fuel: null, drivetrain: null, horsepower: null, registrationStatus: 'UNKNOWN', locationText: '' },
    estimate: { ...first.estimate, estimatedMarketPrice: null, discountPercent: null, absoluteSavingEur: null } }] }) });
  t.after(() => app.close());
  const response = await completedResponse(app, body);
  assert.equal(response.statusCode, 200);
  const row = response.json<CarSearchResponse>().results[0]!;
  assert.equal(row.verification.status, 'FAILED');
  for (const value of [row.car.year, row.car.fuel, row.car.drivetrain, row.car.horsepower,
    row.price.estimatedMarketEur, row.price.discountPercent, row.price.potentialSavingEur,
    row.location.text, row.location.distanceKm, row.imageUrl, row.registrationStatus]) assert.equal(value, null);
});

const invalidBodies: [string, unknown][] = [
  ['radius below minimum', { ...body, radiusKm: 9 }], ['radius above maximum', { ...body, radiusKm: 501 }],
  ['equal prices', { ...body, maxPriceEur: body.minPriceEur }], ['reversed prices', { ...body, maxPriceEur: 1 }],
  ['negative price', { ...body, minPriceEur: -1 }],
  ['zero limit', { ...body, limit: 0 }], ['large limit', { ...body, limit: 31 }], ['fractional limit', { ...body, limit: 1.5 }],
  ['missing location', { ...body, location: undefined }], ['blank location', { ...body, location: '   ' }],
  ['old year', { ...body, minYear: 1979 }], ['future year', { ...body, minYear: new Date().getFullYear() + 1 }],
  ['negative mileage', { ...body, maxMileageKm: -1 }], ['string number', { ...body, radiusKm: '100' }],
  ['string boolean', { ...body, excludeDamaged: 'false' }], ['unknown field', { ...body, rawData: true }],
  ['unknown location without coordinates', { ...body, location: 'Cluj-Napoca' }],
  ['invalid coordinates', { ...body, origin: { latitude: 91, longitude: 23 } }],
  ['missing coordinate', { ...body, origin: { latitude: 46 } }], ['array body', []], ['null body', null],
];
for (const [name, payload] of invalidBodies) test(`API rejects ${name} with 400 before the engine runs`, async t => {
  let calls = 0;
  const app = await buildServer({ search: async () => { calls++; return fixture; } });
  t.after(() => app.close());
  const response = await app.inject({ method: 'POST', url: '/api/cars/search',
    headers: { 'content-type': 'application/json' }, payload: JSON.stringify(payload) });
  assert.equal(response.statusCode, 400);
  assert.equal(calls, 0);
  assert.equal(typeof response.json().error.code, 'string');
  assert.doesNotMatch(response.body, /stack|node_modules/);
});

test('API accepts boundary values and explicit location coordinates without assuming Deva', async t => {
  let received: SearchSettings | undefined;
  const app = await buildServer({ search: async settings => { received = settings; return fixture; } });
  t.after(() => app.close());
  const origin = { latitude: 46.77, longitude: 23.59 };
  const response = await completedResponse(app, { ...body,
    location: ' Cluj-Napoca ', origin, minPriceEur: 0, maxPriceEur: 1, minYear: 1980,
    maxMileageKm: 0, radiusKm: 500, limit: 30, excludeDamaged: false });
  assert.equal(response.statusCode, 200);
  assert.equal(received!.location, 'Cluj-Napoca');
  assert.deepEqual(received!.origin, origin);
  assert.equal(received!.excludeDamaged, false);
  assert.ok(response.json<CarSearchResponse>().results.length <= 30);
  assert.deepEqual(defaultSearchSettings.origin, { latitude: 45.878, longitude: 22.914 });
});

test('API source error is sanitized and releases the search lock; server stays healthy', async t => {
  let calls = 0;
  const app = await buildServer({ search: async () => {
    if (++calls === 1) throw new Error('PRIVATE_STACK <html> upstream failure at C:/private');
    return fixture;
  } });
  t.after(() => app.close());
  const failed = await app.inject({ method: 'POST', url: '/api/cars/search', payload: body });
  assert.equal(failed.statusCode, 202);
  const failedJob = await waitForJob(app, failed.json().searchId);
  assert.equal(failedJob.status, 'FAILED');
  assert.ok('error' in failedJob);
  assert.deepEqual(failedJob.error, { code: 'SOURCE_UNAVAILABLE', message: 'Source could not be accessed.' });
  assert.doesNotMatch(JSON.stringify(failedJob), /PRIVATE_STACK|<html>|C:\/private/);
  assert.equal((await app.inject('/health')).statusCode, 200);
  assert.equal((await completedResponse(app, body)).statusCode, 200);
});

test('API allows only one active search and keeps health available', async t => {
  let release!: (result: SearchResult) => void;
  let entered!: () => void;
  let calls = 0;
  const pending = new Promise<SearchResult>(resolve => { release = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const app = await buildServer({ search: async () => { calls++; entered(); return pending; } });
  t.after(() => app.close());
  const first = await app.inject({ method: 'POST', url: '/api/cars/search', payload: body });
  assert.equal(first.statusCode, 202);
  assert.equal(first.json().status, 'RUNNING');
  await started;
  try {
    const second = await app.inject({ method: 'POST', url: '/api/cars/search', payload: body });
    assert.equal(second.statusCode, 409);
    assert.deepEqual(second.json(), { error: { code: 'SEARCH_IN_PROGRESS', message: 'A search is already running.' }, searchId: first.json().searchId });
    assert.equal((await app.inject(`/api/cars/search/${first.json().searchId}`)).json().status, 'RUNNING');
    assert.equal((await app.inject('/api/cars/search/current')).json().searchId, first.json().searchId);
    assert.equal(calls, 1);
    assert.equal((await app.inject('/health')).statusCode, 200);
  } finally { release(fixture); }
  await waitForJob(app, first.json().searchId);
  assert.equal((await completedResponse(app, body)).statusCode, 200);
  assert.equal(calls, 2);
});

test('API CORS handles development JSON POST preflight', async t => {
  const app = await buildServer({ search: async () => fixture });
  t.after(() => app.close());
  const response = await app.inject({ method: 'OPTIONS', url: '/api/cars/search', headers: {
    origin: 'http://localhost:8081', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type' } });
  assert.equal(response.statusCode, 204);
  assert.equal(response.headers['access-control-allow-origin'], '*');
  assert.match(String(response.headers['access-control-allow-methods']), /POST/);
  assert.match(String(response.headers['access-control-allow-headers']), /content-type/);
});

test('API malformed JSON returns a safe 400 and unknown route returns JSON 404', async t => {
  const app = await buildServer({ search: async () => fixture });
  t.after(() => app.close());
  const response = await app.inject({ method: 'POST', url: '/api/cars/search',
    headers: { 'content-type': 'application/json' }, payload: '{ invalid secret' });
  assert.equal(response.statusCode, 400);
  assert.doesNotMatch(response.body, /secret|stack/);
  assert.equal((await app.inject('/missing')).json().error.code, 'NOT_FOUND');
});

test('API PORT defaults to 3000 and validates configurable ports', () => {
  assert.equal(parsePort(undefined), 3000);
  assert.equal(parsePort('3010'), 3010);
  for (const port of ['', '0', '-1', '65536', '3000.5', 'abc']) assert.throws(() => parsePort(port));
});

test('jobs current is null initially, unknown IDs are 404 and latest completed result is retained', async t => {
  const app = await buildServer({ search: async () => fixture });
  t.after(() => app.close());
  assert.equal((await app.inject('/api/cars/search/current')).json(), null);
  assert.equal((await app.inject('/api/cars/search/unknown')).statusCode, 404);
  const accepted = await app.inject({ method: 'POST', url: '/api/cars/search', payload: body });
  const id: string = accepted.json().searchId;
  assert.ok(id.length > 0);
  const completed = await waitForJob(app, id);
  assert.equal(completed.status, 'COMPLETED');
  assert.deepEqual((await app.inject('/api/cars/search/current')).json(), completed);
  assert.deepEqual((await app.inject(`/api/cars/search/${id}`)).json(), completed);
  assert.equal((await app.inject(`/api/cars/search/${id}`)).headers['cache-control'], 'no-store');
});

test('jobs retain latest terminal while next runs, evict older completion and isolate server restarts', async t => {
  let release!: (value: SearchResult) => void;
  let calls = 0;
  const app = await buildServer({ search: async () => ++calls === 1 ? fixture : new Promise(resolve => { release = resolve; }) });
  const fresh = await buildServer({ search: async () => fixture });
  t.after(() => app.close()); t.after(() => fresh.close());
  const first = await app.inject({ method: 'POST', url: '/api/cars/search', payload: body });
  await waitForJob(app, first.json().searchId);
  const second = await app.inject({ method: 'POST', url: '/api/cars/search', payload: body });
  while (!release) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await app.inject(`/api/cars/search/${first.json().searchId}`)).json().status, 'COMPLETED');
  assert.equal((await app.inject('/api/cars/search/current')).json().searchId, second.json().searchId);
  release(fixture);
  await waitForJob(app, second.json().searchId);
  assert.equal((await app.inject(`/api/cars/search/${first.json().searchId}`)).statusCode, 404);
  assert.equal((await fresh.inject('/api/cars/search/current')).json(), null);
});

test('a synchronously throwing engine becomes a retained FAILED job', async t => {
  const app = await buildServer({ search: () => { throw new Error('private synchronous error'); } });
  t.after(() => app.close());
  const accepted = await app.inject({ method: 'POST', url: '/api/cars/search', payload: body });
  assert.equal(accepted.statusCode, 202);
  const failed = await waitForJob(app, accepted.json().searchId);
  assert.equal(failed.status, 'FAILED');
  assert.deepEqual((await app.inject('/api/cars/search/current')).json(), failed);
});

test('real HTTP client disconnect does not cancel work or consume its retained result', async t => {
  let release!: (value: SearchResult) => void;
  const app = await buildServer({ search: async () => new Promise(resolve => { release = resolve; }) });
  t.after(() => app.close());
  const base = await app.listen({ host: '127.0.0.1', port: 0 });
  const accepted = await new Promise<{ status: number; searchId: string }>((resolve, reject) => {
    const client = httpRequest(`${base}/api/cars/search`, { method: 'POST', agent: false,
      headers: { 'Content-Type': 'application/json', Connection: 'close' } }, response => {
      let data = ''; response.setEncoding('utf8'); response.on('data', chunk => { data += chunk; });
      response.on('end', () => { client.destroy(); resolve({ status: response.statusCode!, searchId: JSON.parse(data).searchId }); });
    });
    client.on('error', reject); client.end(JSON.stringify(body));
  });
  assert.equal(accepted.status, 202);
  while (!release) await new Promise(resolve => setImmediate(resolve));
  assert.equal((await app.inject(`/api/cars/search/${accepted.searchId}`)).json().status, 'RUNNING');
  release(fixture);
  const completed = await waitForJob(app, accepted.searchId);
  assert.equal(completed.status, 'COMPLETED');
  const recovered = await fetch(`${base}/api/cars/search/${accepted.searchId}`);
  assert.equal(recovered.status, 200);
  assert.deepEqual(await recovered.json(), completed);
});
