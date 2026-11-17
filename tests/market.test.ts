import test from 'node:test';
import assert from 'node:assert/strict';
import { CAR_CATALOG, identifyCar, normalizeCarIdentity } from '../src/analysis/carIdentity.js';
import { estimatePrice, matchesComparableLevel, hasUsableFullPrice, removePriceOutliers } from '../src/analysis/priceEstimator.js';
import { calculateDealScore } from '../src/analysis/dealScore.js';
import { ComparableMarketService } from '../src/services/comparableMarketService.js';
import { searchCars } from '../src/services/searchService.js';
import { buildOlxComparableUrl } from '../src/sources/olx/OlxSourceAdapter.js';
import { defaultSearchSettings as settings } from '../src/config/searchSettings.js';
import { car, peers, adapterWith } from './helpers.js';

for (const [title, make, model] of [
  ['tiguan 2009 4x4 2.0 140 cp stare foarte buna', 'Volkswagen', 'Tiguan'],
  ['vw tiguan', 'Volkswagen', 'Tiguan'], ['volkswagen tiguan', 'Volkswagen', 'Tiguan'],
  ['Golf 6 plus ,euro 5, ÎNMATRICULAT', 'Volkswagen', 'Golf Plus'],
  ['dacia duster', 'Dacia', 'Duster'], ['duster', 'Dacia', 'Duster'],
  ['Renault Megane Estate 1.2 Tce', 'Renault', 'Megane'],
  ['Grand Vitara 2.0', 'Suzuki', 'Grand Vitara'], ['Ford Grand C-Max', 'Ford', 'Grand C-Max'],
  ['Skoda Octavia', 'Skoda', 'Octavia'], ['Dacia Logan MCV', 'Dacia', 'Logan MCV'],
] as const) {
  test(`identifică ${title}`, () => {
    const identity = identifyCar({ title });
    assert.equal(identity.make, make);
    assert.equal(identity.model, model);
    assert.ok(identity.identityConfidence >= 80);
  });
}
test('necunoscut, conflict sau model numeric fără marcă nu devin identități sigure', () => {
  for (const title of ['Masina de vanzare 2008', 'Sport 3 2016', 'VW Tiguan sau Dacia Duster', 'Ford Focus Mondeo']) {
    const identity = identifyCar({ title });
    assert.equal(identity.model, null);
    assert.ok(identity.identityConfidence < 50);
  }
  assert.equal(identifyCar({ title: 'Peugeot 308 din 2008' }).model, '308');
  assert.equal(identifyCar({ title: 'Dacia Duster', make: 'Ford', model: 'Focus' }).model, null);
});
test('catalogul acoperă mărcile cerute și normalizarea nu crește încrederea inferată', () => {
  assert.ok(CAR_CATALOG.length >= 21);
  const normalized = normalizeCarIdentity(car({ make: null, model: null, title: 'Tiguan 2009' }));
  assert.equal(normalized.identityConfidence, 85);
  assert.equal(normalizeCarIdentity(normalized).identityConfidence, 85);
});
test('Level 1: margini ±2 ani și ±50000 km', () => {
  assert.equal(matchesComparableLevel(car(), car({ year: 2019, mileageKm: 173000 }), 1), true);
  assert.equal(matchesComparableLevel(car(), car({ year: 2018 }), 1), false);
  assert.equal(matchesComparableLevel(car(), car({ fuel: null }), 1), false);
  assert.equal(estimatePrice(car(), peers()).comparableLevel, 1);
});
test('fallback Level 1 -> Level 2 când primul are doar două', () => {
  const pool = peers().slice(0, 7).map((peer, i) => ({ ...peer, year: i < 2 ? 2021 : 2018 }));
  const estimate = estimatePrice(car(), pool);
  assert.equal(estimate.comparableLevel, 2);
  assert.equal(estimate.comparableCount, 7);
  assert.equal(estimate.diagnostics[0]?.matches, 2);
  assert.equal(estimate.absoluteSavingEur, 1900);
});
test('Level 3 relaxează combustibilul și are încredere redusă', () => {
  const strict = estimatePrice(car(), peers());
  const relaxed = estimatePrice(car(), peers().map(peer => ({ ...peer, fuel: 'Benzina', year: 2017 })));
  assert.equal(relaxed.comparableLevel, 3);
  assert.equal(relaxed.comparableCount, 9);
  assert.ok(relaxed.confidenceScore < strict.confidenceScore);
});
test('mediana după outlieri și excluderea avariatelor/prețurilor fictive', () => {
  const result = estimatePrice(car(), [...peers(), car({ id: 'absurd', priceEur: 150000 }),
    car({ id: 'one-euro', priceEur: 1 }), car({ id: 'broken', priceEur: 3000, description: 'avariat' }),
    car({ id: 'deposit', priceEur: 2000, title: 'Duster - pretul afisat este avans' })]);
  assert.equal(result.estimatedMarketPrice, 11500);
  assert.equal(result.comparableCount, 9);
  assert.equal(result.diagnostics[0]?.outliersRemoved, 1);
  assert.equal(removePriceOutliers([car(), car({ priceEur: 100000 })]).length, 2);
});
test('MAD zero: păstrează prețurile normale și elimină extremele', () => {
  const pool = Array.from({ length: 8 }, (_, i) => car({ id: String(i), priceEur: 10000 }));
  assert.equal(removePriceOutliers([...pool, car({ priceEur: 50000 })]).length, 8);
});
test('ratele disponibile nu transformă automat prețul integral în avans', () => {
  assert.equal(hasUsableFullPrice(car({ title: 'Dacia Duster rate fixe', description: 'Avans 0 EUR, finantare disponibila.' })), true);
  assert.equal(hasUsableFullPrice(car({ description: 'Rata lunara 300 EUR. Pret integral 9500 EUR.' })), true);
  assert.equal(hasUsableFullPrice(car({ priceEur: 300, description: '300 EUR/luna' })), false);
  assert.equal(hasUsableFullPrice(car({ priceEur: 2000, description: 'Avans 2.000 EUR' })), false);
});
test('aceeași marcă/model se caută o singură dată, chiar pentru ani diferiți', async () => {
  let calls = 0;
  const adapter = adapterWith([]);
  adapter.searchComparables = async () => { calls++; return { source: 'test', mode: 'fixture', warnings: [], listings: peers() }; };
  const service = new ComparableMarketService([adapter], { intervalMs: 0 });
  await service.collect(car());
  await service.collect(car({ year: 2016, mileageKm: 240000 }));
  assert.equal(calls, 1);
  assert.equal(service.diagnostics.cacheHits, 1);
  await new ComparableMarketService([adapter], { intervalMs: 0 }).collect(car());
  assert.equal(calls, 2);
});
test('buget global strict și cache disponibil după epuizare', async () => {
  const service = new ComparableMarketService([adapterWith([], peers())], { maxSearches: 1, intervalMs: 0 });
  await service.collect(car());
  assert.equal((await service.collect(car({ make: 'Ford', model: 'Focus' }))).length, 0);
  assert.equal((await service.collect(car())).length, 9);
  assert.equal(service.diagnostics.used, 1);
  assert.equal(service.diagnostics.skippedGroups.length, 1);
});
test('blocarea OLX întrerupe fluxul înainte de următoarea căutare', async () => {
  let calls = 0;
  const adapter = adapterWith([car(), car({ id: 'focus', title: 'Ford Focus', make: 'Ford', model: 'Focus' })]);
  adapter.searchComparables = async () => { calls++; throw new Error('HTTP 429'); };
  const result = await searchCars(settings, [adapter]);
  assert.equal(result.results.length, 2);
  assert.equal(result.verification.requested, 0);
  assert.match(result.verification.stoppedReason!, /OLX_ACCESS_DENIED/);
  assert.equal(calls, 1);
});
test('anunțurile pieței îndepărtate contribuie la mediană, fără a deveni rezultate locale', async () => {
  const market = peers().map(peer => ({ ...peer, latitude: 44.4268, longitude: 26.1025 }));
  const result = await searchCars(settings, [adapterWith([car()], market)]);
  assert.equal(result.results.length, 1);
  assert.equal(result.results[0]?.estimate.comparableCount, 9);
  assert.equal(result.results[0]?.estimate.estimatedMarketPrice, 11500);
  assert.equal(result.market.used, 1);
});
test('URL național fără buget, localitate, an sau kilometri ai unui singur candidat', () => {
  const url = buildOlxComparableUrl(car());
  assert.ok(url.pathname.endsWith('/q-dacia-duster/'));
  assert.equal(url.searchParams.get('search[dist]'), null);
  assert.equal(url.searchParams.get('currency'), 'EUR');
  assert.equal(buildOlxComparableUrl(car({ year: 2016 })).href, url.href);
});
test('scor plafonat cu încredere mică și mare pentru reducere reală bine susținută', () => {
  const listing = car({ priceEur: 6000, year: 2023, mileageKm: 80000 });
  const estimate = estimatePrice(listing, peers().map(peer => ({ ...peer, year: 2023, mileageKm: 90000 })));
  const good = calculateDealScore(listing, estimate, { riskScore: 0, reasons: [] }, 0, settings, 2026);
  const weak = calculateDealScore(listing, { ...estimate, confidenceScore: 24 }, { riskScore: 0, reasons: [] }, 0, settings, 2026);
  assert.ok(good >= 75);
  assert.ok(weak <= 45);
});

test('bugetul este comun tuturor surselor și nu depășește 6 cereri', async () => {
  let calls = 0;
  const sources = Array.from({ length: 15 }, (_, i) => {
    const adapter = { ...adapterWith([]), name: `source-${i}` };
    adapter.searchComparables = async () => { calls++; return { source: adapter.name, mode: 'fixture', warnings: [], listings: [] }; };
    return adapter;
  });
  const service = new ComparableMarketService(sources, { intervalMs: 0 });
  await service.collect(car());
  assert.equal(calls, 6);
  assert.equal(service.diagnostics.used, 6);
  assert.equal(service.diagnostics.skippedGroups.length, 9);
});
test('cererile concurente pentru același model partajează răspunsul în curs', async () => {
  let calls = 0;
  const adapter = adapterWith([]);
  adapter.searchComparables = async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5));
    return { source: 'test', mode: 'fixture', warnings: [], listings: peers() }; };
  const service = new ComparableMarketService([adapter], { intervalMs: 0 });
  await Promise.all([service.collect(car()), service.collect(car())]);
  assert.equal(calls, 1);
});
test('o protecție oprește și grupurile deja puse în așteptare', async () => {
  let calls = 0;
  const adapter = adapterWith([]);
  adapter.searchComparables = async () => { calls++; throw new Error('HTTP 403'); };
  const service = new ComparableMarketService([adapter], { intervalMs: 0 });
  const results = await Promise.allSettled([service.collect(car()), service.collect(car({ make: 'Ford', model: 'Focus' }))]);
  assert.ok(results.every(result => result.status === 'fulfilled' && result.value.length === 0));
  assert.deepEqual(await service.collect(car({ make: 'Opel', model: 'Astra' })), []);
  assert.equal(calls, 1);
});
test('25 candidați sub limita de 30 sunt estimați; fixture fără cache persistent', async () => {
  let calls = 0;
  const adapter = adapterWith(Array.from({ length: 25 }, (_, i) => car({ id: `local-${i}` })));
  adapter.searchComparables = async () => { calls++; return { source: 'test', mode: 'fixture', warnings: [], listings: peers() }; };
  const first = await searchCars(settings, [adapter]);
  assert.equal(first.eligibleCount, 25);
  assert.equal(first.analyzedCount, 25);
  assert.equal(first.market.cacheHits, 24);
  await searchCars(settings, [adapter]);
  assert.equal(calls, 2);
});
test('identitățile ambigue nu consumă buget', async () => {
  const result = await searchCars(settings, [adapterWith([car({ title: 'Masina necunoscuta', make: null, model: null })])]);
  assert.equal(result.market.used, 0);
  assert.equal(result.results[0]?.estimate.estimatedMarketPrice, null);
});
