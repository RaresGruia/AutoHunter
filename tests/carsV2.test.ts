import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { resolve, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { DiskCache, MARKET_TTL_MS, LOCAL_TTL_MS } from '../src/services/diskCache.js';
import { OlxSourceAdapter } from '../src/sources/olx/OlxSourceAdapter.js';
import { identityKey } from '../src/analysis/carIdentity.js';
import { estimatePrice, comparableSimilarity, matchesComparableLevel } from '../src/analysis/priceEstimator.js';
import { calculateCarQuality, classifyCar, calculateOpportunity } from '../src/analysis/carQuality.js';
import { analyzeDataConsistency } from '../src/analysis/dataConsistency.js';
import { analyzeListingRisk } from '../src/analysis/listingRisk.js';
import { calculateDealScore } from '../src/analysis/dealScore.js';
import { calculateFlipPotential } from '../src/analysis/flipPotential.js';
import { searchCars } from '../src/services/searchService.js';
import { ComparableMarketService } from '../src/services/comparableMarketService.js';
import { serializeSearch } from '../src/api/serializeSearch.js';
import { defaultSearchSettings as settings } from '../src/config/searchSettings.js';
import { car, peers, adapterWith } from './helpers.js';

async function directory(t: TestContext): Promise<string> {
  const parent = resolve(tmpdir());
  const dir = await mkdtemp(resolve(parent, 'autohunter-v2-'));
  t.after(async () => {
    assert.ok(relative(parent, dir).startsWith('autohunter-v2-'));
    await rm(dir, { recursive: true, force: true });
  });
  return dir;
}
const liveCar = (id = 'one') => car({ id, source: 'olx', url: `https://www.olx.ro/d/oferta/test-${id}.html` });
const key = (listing = liveCar()) => `market:v2:olx:${identityKey(listing)}`;
function html(listings = [liveCar()], detail = false): string {
  const ads = listings.map(c => ({ id: c.id, title: c.title, url: c.url, isActive: true,
    price: { regularPrice: { value: c.priceEur, currencyCode: 'EUR' } }, description: c.description,
    location: { cityName: c.locationText }, map: { lat: c.latitude, lon: c.longitude }, photos: [],
    params: [['make', c.make], ['model', c.model], ['year', c.year], ['rulaj_pana', c.mileageKm],
      ['petrol', c.fuel], ['gearbox', c.transmission], ['enginesize', 1461], ['drivetrain', c.drivetrain]]
      .map(([key, value]) => ({ key, value: String(value), normalizedValue: typeof value === 'number' ? value : undefined })) }));
  return `<script>window.__PRERENDERED_STATE__ = ${JSON.stringify(JSON.stringify(detail ? { ad: { ad: ads[0] } } : { listing: { listing: { ads } } }))};</script>`;
}

test('persistent market cache survives adapter recreation, omits raw HTML and prevents a request', async t => {
  const dir = await directory(t); let calls = 0;
  const options = { cacheDirectory: dir, pageLoader: async () => { calls++; return html(); } };
  assert.equal((await new OlxSourceAdapter(options).searchComparables(liveCar())).listings.length, 1);
  const cached = await new OlxSourceAdapter(options).searchComparables(liveCar());
  assert.equal(calls, 1); assert.equal(cached.listings[0]?.marketDataFreshness, 'CACHED');
  const content = await readFile(resolve(dir, (await readdir(dir))[0]!), 'utf8');
  assert.ok(!content.includes('<script>')); assert.ok(!content.includes('rawData'));
});
test('expired market cache refreshes after 12 hours and records the new timestamp', async t => {
  const dir = await directory(t); let now = 1_700_000_000_000; let calls = 0;
  const options = { cacheDirectory: dir, now: () => now, pageLoader: async () => { calls++; return html(); } };
  await new OlxSourceAdapter(options).searchComparables(liveCar()); now += MARKET_TTL_MS;
  const result = await new OlxSourceAdapter(options).searchComparables(liveCar());
  assert.equal(calls, 2); assert.equal(result.listings[0]?.marketDataFreshness, 'FRESH');
  assert.equal(result.listings[0]?.marketFetchedAt, new Date(now).toISOString());
});
test('403 reuses stale market, reduces confidence and prevents any later network/detail request', async t => {
  const dir = await directory(t); let now = 1_700_000_000_000; let calls = 0;
  const disk = new DiskCache(dir, () => now);
  const savedPeers = peers().map(c => ({ ...c, source: 'olx' }));
  await disk.write(key(), savedPeers); now += MARKET_TTL_MS + 1;
  const adapter = new OlxSourceAdapter({ cacheDirectory: dir, now: () => now, pageLoader: async () => { calls++; throw new Error('HTTP 403'); } });
  const result = await adapter.searchComparables(liveCar());
  assert.equal(result.listings[0]?.marketDataFreshness, 'STALE'); assert.equal(adapter.accessBlocked, true);
  assert.ok(estimatePrice(liveCar(), result.listings).confidenceScore < estimatePrice(liveCar(), savedPeers).confidenceScore);
  await assert.rejects(adapter.getListingDetails(liveCar()), /OLX_ACCESS_DENIED/);
  await assert.rejects(adapter.searchComparables(car({ make: 'Ford', model: 'Focus' })), /OLX_ACCESS_DENIED/);
  assert.equal(calls, 1);
});
test('cache miss with 403 stops the run; fresh cached other models still work with no network', async t => {
  const dir = await directory(t); let calls = 0;
  const focus = { ...liveCar('focus'), title: 'Ford Focus', make: 'Ford', model: 'Focus' };
  await new DiskCache(dir).write(key(focus), [focus]);
  const adapter = new OlxSourceAdapter({ cacheDirectory: dir, pageLoader: async () => { calls++; throw new Error('HTTP 403'); } });
  const service = new ComparableMarketService([adapter], { intervalMs: 0 });
  assert.deepEqual(await service.collect(liveCar()), []);
  assert.equal((await service.collect(focus)).length, 1);
  assert.equal(calls, 1); assert.equal(service.diagnostics.cacheHits, 1);
});
test('valid persistent cache is available even when fresh budget is zero', async t => {
  const dir = await directory(t);
  await new DiskCache(dir).write(key(), [liveCar()]);
  const adapter = new OlxSourceAdapter({ cacheDirectory: dir, pageLoader: async () => { throw new Error('must not fetch'); } });
  const service = new ComparableMarketService([adapter], { maxSearches: 0 });
  assert.equal((await service.collect(liveCar())).length, 1); assert.equal(service.diagnostics.used, 0);
});
test('same market query across concurrent adapters triggers only one request', async t => {
  const dir = await directory(t); let calls = 0;
  const options = { cacheDirectory: dir, pageLoader: async () => { calls++; await new Promise(resolve => setTimeout(resolve, 10)); return html(); } };
  await Promise.all([new OlxSourceAdapter(options).searchComparables(liveCar()), new OlxSourceAdapter(options).searchComparables(liveCar())]);
  assert.equal(calls, 1);
});
test('local cache lasts 2 minutes, distinguishes filters and retries fresh after TTL', async t => {
  const dir = await directory(t); let now = 1_700_000_000_000; let calls = 0;
  const options = { cacheDirectory: dir, now: () => now, pageLoader: async () => { calls++; return html(); } };
  await new OlxSourceAdapter(options).searchLocal(settings);
  await new OlxSourceAdapter(options).searchLocal(settings); assert.equal(calls, 1);
  await new OlxSourceAdapter(options).searchLocal({ ...settings, minYear: 2010 }); assert.equal(calls, 2);
  now += LOCAL_TTL_MS;
  await new OlxSourceAdapter(options).searchLocal(settings); assert.equal(calls, 3);
});
test('local 403 without cache fails once with SOURCE error, never substitutes fixture', async t => {
  const dir = await directory(t); let calls = 0;
  const adapter = new OlxSourceAdapter({ cacheDirectory: dir, pageLoader: async () => { calls++; throw new Error('HTTP 403'); } });
  await assert.rejects(searchCars(settings, [adapter]), /OLX_ACCESS_DENIED/); assert.equal(calls, 1);
});
test('expired local cache used after 403 marks local-only market estimates STALE too', async t => {
  const dir = await directory(t); let now = 1_700_000_000_000; let calls = 0;
  const local = Array.from({ length: 7 }, (_, i) => ({ ...liveCar(`local-${i}`), priceEur: 8000 + i * 100 }));
  await new OlxSourceAdapter({ cacheDirectory: dir, now: () => now, pageLoader: async () => html(local) }).searchLocal(settings);
  now += LOCAL_TTL_MS + 1;
  const adapter = new OlxSourceAdapter({ cacheDirectory: dir, now: () => now, pageLoader: async () => { calls++; throw new Error('HTTP 403'); } });
  const result = await searchCars(settings, [adapter], { intervalMs: 0, verification: { intervalMs: 0 } });
  assert.equal(calls, 1); assert.equal(result.verification.requested, 0);
  assert.equal(result.results.length, 7);
  assert.equal(result.requestMetrics?.staleCacheUsed, 1);
  assert.equal(result.requestMetrics?.localCacheHits, 1);
  assert.ok(result.results.every(row => row.estimate.marketDataFreshness === 'STALE'));
  assert.ok(result.results.every(row => row.estimate.confidenceScore < 40));
  assert.match(result.sources[0]!.warnings.join(' '), /cache expirat/);
});
test('full OLX adapter flow obeys 1+6+5 budget; repeated run uses persistent market/local cache', async t => {
  const dir = await directory(t); let calls = 0;
  const models = [['Dacia', 'Duster'], ['Ford', 'Focus'], ['Volkswagen', 'Golf'], ['Opel', 'Astra'], ['Renault', 'Megane'], ['Skoda', 'Octavia'], ['Suzuki', 'Grand Vitara']];
  const local = models.map(([make, model], i) => ({ ...liveCar(`model-${i}`), make: make!, model: model!, title: `${make} ${model}`, priceEur: 8000 }));
  const options = { cacheDirectory: dir, pageLoader: async (url: URL) => {
    calls++;
    if (url.pathname.startsWith('/d/oferta/')) return html([local.find(c => c.url === url.href)!], true);
    if (url.pathname.includes('/q-')) return html(local.flatMap(c => Array.from({ length: 6 }, (_, i) => ({ ...c, id: `${c.id}-peer-${i}`, url: `${c.url}-peer-${i}`, priceEur: 11000 }))));
    return html(local);
  } };
  const fast = { intervalMs: 0, verification: { intervalMs: 0 } };
  const first = await searchCars(settings, [new OlxSourceAdapter(options)], fast);
  assert.equal(first.results.length, 7); assert.equal(first.verification.succeeded, 5);
  assert.equal(calls, 12); assert.equal(first.requestMetrics?.totalOlxRequests, 12);
  calls = 0;
  const second = await searchCars(settings, [new OlxSourceAdapter(options)], fast);
  assert.equal(second.requestMetrics?.localCacheHits, 1); assert.equal(second.requestMetrics?.marketCacheHits, 6);
  // The seventh model was beyond the first run's budget and may now fetch once.
  assert.ok(calls <= 6); assert.equal(second.requestMetrics?.totalOlxRequests, calls);
});
test('market 403 stops all detail requests and returns cached estimates explicitly stale', async t => {
  const dir = await directory(t); let now = 1_700_000_000_000; let calls = 0;
  await new DiskCache(dir, () => now).write(key(), peers().map(c => ({ ...c, source: 'olx' })));
  now += MARKET_TTL_MS + 1;
  const adapter = new OlxSourceAdapter({ cacheDirectory: dir, now: () => now, pageLoader: async url => {
    calls++; if (url.pathname.includes('/q-')) throw new Error('HTTP 403'); return html();
  } });
  const result = await searchCars(settings, [adapter], { intervalMs: 0, verification: { intervalMs: 0 } });
  assert.equal(calls, 2); assert.equal(result.requestMetrics?.detailRequests, 0);
  assert.equal(result.verification.requested, 0); assert.equal(result.requestMetrics?.staleCacheUsed, 1);
  assert.equal(result.results[0]?.estimate.marketDataFreshness, 'STALE');
  assert.ok(result.results[0]?.warnings.some(warning => warning.includes('date salvate anterior')));
});
test('a protection HTML page stops further requests just like 403', async t => {
  const dir = await directory(t); let calls = 0;
  const adapter = new OlxSourceAdapter({ cacheDirectory: dir, pageLoader: async () => { calls++; return '<title>CAPTCHA</title>'; } });
  await assert.rejects(adapter.searchLocal(settings), /protecție/);
  await assert.rejects(adapter.getListingDetails(liveCar()), /OLX_ACCESS_DENIED/); assert.equal(calls, 1);
});
test('30 local results survive light analysis and only top 5 get details; API includes V2 fields', async () => {
  const source = adapterWith(Array.from({ length: 35 }, (_, i) => car({ id: `local-${i}`, priceEur: 8500 })), peers());
  let details = 0; source.getListingDetails = async listing => { details++; return listing; };
  const result = await searchCars(settings, [source]);
  assert.equal(result.results.length, 30); assert.equal(details, 5); assert.equal(result.verification.notRequested, 25);
  const response = serializeSearch(result, { ...settings, limit: 30 }, new Date().toISOString(), 0);
  assert.equal(response.results.length, 30); assert.equal(typeof response.results[0]?.scores.carQuality, 'number');
  assert.ok(response.results.every(row => row.classification && row.marketData.matchQuality));
});
test('exact comparables take priority over relaxed configurations', () => {
  const target = car({ bodyType: 'SUV', horsepower: 110 });
  const exact = peers().slice(0, 5).map(c => ({ ...c, bodyType: 'SUV', horsepower: 110 }));
  const relaxed = peers().map(c => ({ ...c, id: `relaxed-${c.id}`, url: `${c.url}-relaxed`, bodyType: 'Sedan', fuel: 'Benzina', priceEur: 3000 }));
  const estimate = estimatePrice(target, [...relaxed, ...exact]);
  assert.equal(estimate.matchQuality, 'EXACT'); assert.equal(estimate.comparableCount, 5);
  assert.equal(estimate.estimatedMarketPrice, 11300);
});
test('transmission, drivetrain, body, power and known generation affect similarity/matching', () => {
  const target = car({ bodyType: 'SUV', horsepower: 110, generation: 'II', variant: 'standard' });
  for (const change of [{ transmission: 'Automata' }, { drivetrain: '4x2' }, { bodyType: 'Sedan' }, { horsepower: 200 }, { generation: 'I' }, { variant: 'sport' }]) {
    const different = { ...target, ...change };
    assert.ok(comparableSimilarity(target, different) < comparableSimilarity(target, target));
    assert.equal(matchesComparableLevel(target, different, 1), false);
  }
  assert.ok(comparableSimilarity(target, { ...target, transmission: null }) < comparableSimilarity(target, target));
});
function scores(listing = car(), estimate = estimatePrice(listing, peers())) {
  const data = analyzeDataConsistency(listing), risk = analyzeListingRisk(listing, data);
  const quality = calculateCarQuality(listing, risk, data, 'VERIFIED', 2026);
  const deal = calculateDealScore(listing, estimate, risk, 10, settings, 2026, data);
  const flip = calculateFlipPotential(estimate, risk, data);
  const classification = classifyCar(quality.carQualityScore, estimate, risk, data);
  return { ...quality, deal, flip, classification, opportunity: calculateOpportunity(deal, quality.carQualityScore, flip, estimate, risk, classification) };
}
test('Car Quality is independent of price and does not prefer automatic or 4x4', () => {
  const base = scores(car({ priceEur: 8500 })).carQualityScore;
  assert.equal(base, scores(car({ priceEur: 25000 })).carQualityScore);
  assert.equal(base, scores(car({ title: 'Dacia Duster 1.5 dCi 4x2', transmission: 'Automata', drivetrain: '4x2' })).carQualityScore);
});
test('expensive good car has high Quality, low Deal, zero Flip and INTERESTING_CAR', () => {
  const listing = car({ year: 2023, mileageKm: 50000, priceEur: 8490, bodyType: 'SUV', horsepower: 110, sellerType: 'private', imageUrls: ['https://example.invalid/a.jpg'] });
  const estimate = { ...estimatePrice(listing, []), estimatedMarketPrice: 6390, discountPercent: -32.9, absoluteSavingEur: -2100, comparableCount: 9, confidenceScore: 85 };
  const result = scores(listing, estimate);
  assert.ok(result.carQualityScore >= 78); assert.ok(result.deal <= 21); assert.equal(result.flip, 0);
  assert.equal(result.classification, 'INTERESTING_CAR'); assert.ok(result.opportunity <= 30);
});
test('above-market cars cannot earn high Deal even with full confidence', () => {
  for (const priceEur of [12000, 16000, 25000]) assert.ok(scores(car({ priceEur })).deal <= 25);
});
test('cheap damaged car remains high risk with low Deal/Flip and NEEDS_VERIFICATION', () => {
  const result = scores(car({ priceEur: 3000, description: 'Motor defect. Avariat.' }));
  assert.ok(result.deal <= 25); assert.ok(result.flip <= 15); assert.equal(result.classification, 'NEEDS_VERIFICATION');
});
test('GREAT_DEAL and GOOD_DEAL require discount, confidence and reasonable risk', () => {
  assert.equal(scores(car({ priceEur: 7500 })).classification, 'GREAT_DEAL');
  assert.equal(scores(car({ priceEur: 10500 })).classification, 'GOOD_DEAL');
  assert.notEqual(scores(car({ priceEur: 7500 }), { ...estimatePrice(car(), peers()), confidenceScore: 10 }).classification, 'GREAT_DEAL');
});
test('POOR_VALUE for overpriced lower-quality car; good opportunity outranks expensive quality', () => {
  const older = car({ year: 2009, mileageKm: 240000, priceEur: 20000 });
  const estimate = { ...estimatePrice(older, []), estimatedMarketPrice: 10000, discountPercent: -100, confidenceScore: 70 };
  assert.equal(scores(older, estimate).classification, 'POOR_VALUE');
  const pricey = car({ priceEur: 20000, year: 2023, mileageKm: 40000 });
  assert.ok(scores(car({ priceEur: 7500 })).opportunity > scores(pricey, estimate).opportunity);
});
