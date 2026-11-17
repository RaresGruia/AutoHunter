import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ApiClientError, apiErrorMessage, createApiClient, mapApiResponse } from '../src/apiClient';
import { DEFAULT_SETTINGS, loadSettings, resetSettings, saveSettings, settingsError, type SettingsStorage } from '../src/settings';
import { dealDisplay, discountText, money, verificationText } from '../src/display';

// Synthetic API fixture, read from disk only. No test calls OLX or a live API.
const snapshot: unknown = JSON.parse(readFileSync(new URL('../../fixtures/synthetic-analysis-snapshot.json', import.meta.url), 'utf8'));
const response = mapApiResponse(snapshot);
const ticket = { searchId: 'job-a', status: 'RUNNING' as const, startedAt: '2026-09-09T15:00:00.000Z' };
function storage(initial: string | null = null): SettingsStorage {
  let saved = initial;
  return { getItem: async () => saved, setItem: async (_key, value) => { saved = value; } };
}

test('default settings match the requested Deva search', () => {
  assert.deepEqual(DEFAULT_SETTINGS, { location: 'Deva', radiusKm: 100, minPriceEur: 2000,
    maxPriceEur: 10000, minYear: 2008, maxMileageKm: 250000, excludeDamaged: true, limit: 30 });
  assert.equal(settingsError(DEFAULT_SETTINGS), null);
});
test('settings survive save and a fresh load; reset also persists', async () => {
  const store = storage();
  assert.deepEqual((await loadSettings(store)).settings, DEFAULT_SETTINGS);
  const changed = { ...DEFAULT_SETTINGS, radiusKm: 150, excludeDamaged: false, limit: 6 };
  await saveSettings(store, changed);
  assert.deepEqual((await loadSettings(store)).settings, changed);
  await resetSettings(store);
  assert.deepEqual((await loadSettings(store)).settings, DEFAULT_SETTINGS);
});
test('corrupt or incompatible saved settings recover explicitly', async () => {
  for (const saved of ['{broken', 'null', '{}', JSON.stringify({ ...DEFAULT_SETTINGS, radiusKm: '100' }), JSON.stringify({ ...DEFAULT_SETTINGS, limit: 0 })]) {
    const loaded = await loadSettings(storage(saved));
    assert.equal(loaded.recovered, true);
    assert.deepEqual(loaded.settings, DEFAULT_SETTINGS);
  }
});
test('invalid settings cannot overwrite persisted settings', async () => {
  const store = storage(JSON.stringify(DEFAULT_SETTINGS));
  for (const change of [{ radiusKm: 9 }, { radiusKm: 501 }, { maxPriceEur: 1 }, { minPriceEur: -1 },
    { minYear: 1979 }, { minYear: new Date().getFullYear() + 1 }, { maxMileageKm: -1 }, { limit: 31 }, { limit: 1.5 }, { limit: NaN }]) {
    await assert.rejects(saveSettings(store, { ...DEFAULT_SETTINGS, ...change }));
  }
  assert.deepEqual((await loadSettings(store)).settings, DEFAULT_SETTINGS);
});
test('storage read/write failures are propagated instead of pretending to save', async () => {
  const store: SettingsStorage = { getItem: async () => { throw new Error('disk'); }, setItem: async () => { throw new Error('disk'); } };
  await assert.rejects(loadSettings(store));
  await assert.rejects(saveSettings(store, DEFAULT_SETTINGS));
  await assert.rejects(resetSettings(store));
});
test('synthetic API mapping keeps manual results separate', () => {
  const input = structuredClone(snapshot) as typeof response;
  input.needsManualVerification = [{ ...input.results[0]!, id: 'demo-manual-test', verification: { ...input.results[0]!.verification, seriousConflict: true } }];
  const mapped = mapApiResponse(input);
  assert.ok(mapped.results.length > 0);
  assert.equal(mapped.needsManualVerification.length, 1);
  assert.equal(mapped.needsManualVerification[0]!.verification.seriousConflict, true);
  assert.ok(mapped.results.every(row => !mapped.needsManualVerification.some(manual => manual.id === row.id)));
});
test('API mapping preserves unknown values, empty states and ignores raw payload fields', () => {
  const input = structuredClone(response);
  const first = input.results[0]!;
  first.imageUrl = null; first.car.year = null; first.location.distanceKm = null; first.price.estimatedMarketEur = null;
  const mapped = mapApiResponse({ ...input, rawData: '<html>secret</html>' });
  assert.equal(mapped.results[0]!.car.year, null);
  assert.equal(mapped.results[0]!.imageUrl, null);
  assert.equal(mapped.results[0]!.price.estimatedMarketEur, null);
  assert.equal(mapped.results[0]!.location.distanceKm, null);
  assert.doesNotMatch(JSON.stringify(mapped), /rawData|secret/);
  assert.deepEqual(mapApiResponse({ ...input, results: [] }).results, []);
});
test('malformed API structures and unknown verification status are rejected', () => {
  const bad = structuredClone(response);
  for (const input of [null, {}, { ...response, results: {} }, { ...response, meta: { source: 'fake' } },
    { ...response, results: [{ ...bad.results[0], verification: { status: 'APPROVED' } }] }]) assert.throws(() => mapApiResponse(input), ApiClientError);
});
test('Deal Score display has text as well as color; negative discounts are not bargains', () => {
  assert.equal(dealDisplay(60).label, 'Ofertă bună');
  assert.equal(dealDisplay(35).label, 'De luat în calcul');
  assert.equal(dealDisplay(34).label, 'Ofertă modestă');
  assert.match(discountText(-5), /peste/);
  assert.match(discountText(15), /sub/);
  assert.match(discountText(null), /insuficient/);
  assert.equal(money(null), 'Necunoscută');
  assert.match(verificationText('NOT_REQUESTED'), /nu a fost/);
});
test('API errors map to clear Romanian messages without backend stack traces', () => {
  assert.match(apiErrorMessage(new ApiClientError('SEARCH_IN_PROGRESS')).title, /deja o căutare/);
  assert.match(apiErrorMessage(new ApiClientError('SOURCE_UNAVAILABLE')).title, /OLX/);
  assert.match(apiErrorMessage(new ApiClientError('TIMEOUT')).title, /Conexiunea/);
  assert.equal(apiErrorMessage(new Error('SECRET STACK')).title, 'Nu mă pot conecta la AutoHunter.');
  assert.doesNotMatch(JSON.stringify(apiErrorMessage(new Error('SECRET STACK'))), /SECRET|STACK/);
});
test('API configuration rejects missing placeholders and phone-local addresses', async () => {
  for (const url of [undefined, 'http://YOUR_PC_IP:3000', 'http://localhost:3000', 'http://127.0.0.1:3000', 'http://0.0.0.0:3000', 'ftp://pc.local']) {
    await assert.rejects(createApiClient(url).search(DEFAULT_SETTINGS), { code: 'CONFIG' });
  }
});
test('API client posts saved settings and prevents concurrent searches', async () => {
  let release!: (value: Response) => void;
  let calls = 0;
  const pending = new Promise<Response>(resolve => { release = resolve; });
  const fetcher: typeof fetch = async (url, init) => {
    calls++;
    assert.equal(url, 'http://pc.example:3000/api/cars/search');
    assert.equal(init?.method, 'POST');
    assert.deepEqual(JSON.parse(String(init?.body)), DEFAULT_SETTINGS);
    return pending;
  };
  const client = createApiClient('http://pc.example:3000/', { fetcher });
  const first = client.search(DEFAULT_SETTINGS);
  await assert.rejects(client.search(DEFAULT_SETTINGS), { code: 'SEARCH_IN_PROGRESS' });
  release(new Response(JSON.stringify(ticket), { status: 202 }));
  assert.deepEqual(await first, ticket);
  assert.equal(calls, 1);
});
test('timeout aborts the request and releases the client lock for retry', async () => {
  let calls = 0;
  const fetcher: typeof fetch = async (_url, init) => {
    if (++calls > 1) return new Response(JSON.stringify(ticket), { status: 202 });
    return new Promise<Response>((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  };
  const client = createApiClient('http://pc.example', { fetcher, timeoutMs: 10 });
  await assert.rejects(client.search(DEFAULT_SETTINGS), { code: 'TIMEOUT' });
  assert.deepEqual(await client.search(DEFAULT_SETTINGS), ticket);
});
test('server and network failures are sanitized and retry remains possible', async () => {
  let calls = 0;
  const client = createApiClient('http://pc.example', { fetcher: async () => {
    if (++calls === 1) return new Response(JSON.stringify({ error: { code: 'SOURCE_UNAVAILABLE', message: 'PRIVATE TRACE' } }), { status: 503 });
    if (calls === 2) throw new Error('PRIVATE NETWORK');
    return new Response(JSON.stringify(ticket), { status: 202 });
  } });
  await assert.rejects(client.search(DEFAULT_SETTINGS), { code: 'SOURCE_UNAVAILABLE' });
  await assert.rejects(client.search(DEFAULT_SETTINGS), { code: 'NETWORK' });
  assert.deepEqual(await client.search(DEFAULT_SETTINGS), ticket);
});
