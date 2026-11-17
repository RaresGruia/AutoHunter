import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseOlxHtml } from '../src/sources/olx/olxParser.js';
import { OlxSourceAdapter, buildOlxSearchUrl } from '../src/sources/olx/OlxSourceAdapter.js';
import { defaultSearchSettings as settings } from '../src/config/searchSettings.js';
import { searchCars } from '../src/services/searchService.js';
import { car, peers, adapterWith } from './helpers.js';
import { analyzeListingRisk } from '../src/analysis/listingRisk.js';
import { loadPublicOlxPage } from '../src/sources/olx/olxPageLoader.js';

const fixture = (): Promise<string> => readFile(new URL('../fixtures/olx-search.html', import.meta.url), 'utf8');
test('parsează fixture-ul în același format SSR ca pagina publică', async () => {
  const parsed = parseOlxHtml(await fixture(), { fixture: true });
  assert.equal(parsed.listings.length, 34);
  const first = parsed.listings[0]!;
  assert.equal(first.make, 'Dacia');
  assert.equal(first.priceEur, 9500);
  assert.equal(first.mileageKm, 123000);
  assert.equal(first.drivetrain, '4x4');
  assert.equal(first.source, 'olx-fixture');
  assert.equal(first.sellerType, 'private');
  assert.equal(parsed.listings.find(car => car.id === 'demo-unknown-location')?.latitude, null);
  assert.equal(analyzeListingRisk(parsed.listings.find(car => car.id === 'demo-mild-risk')!).riskScore, 35);
});
test('parserul respinge structuri necunoscute și CAPTCHA', () => {
  assert.throws(() => parseOlxHtml('<html>Alt format</html>'), /Structura/);
  assert.throws(() => parseOlxHtml('<title>Just a moment</title>'), /protecție/);
  assert.throws(() => parseOlxHtml('<script>window.__PRERENDERED_STATE__ = "bad";</script>'), /JSON/);
});
test('căutarea goală este validă, diferită de un parser defect', () => {
  const html = `<script>window.__PRERENDERED_STATE__ = ${JSON.stringify(JSON.stringify({ listing: { listing: { ads: [] } } }))};</script>`;
  assert.deepEqual(parseOlxHtml(html).listings, []);
});
test('nu etichetează URL-uri sintetice ca live', async () => assert.equal(parseOlxHtml(await fixture()).listings.length, 0));
test('URL fără plafon de preț pentru comparabilele peste buget', () => {
  const url = buildOlxSearchUrl(settings);
  assert.equal(url.searchParams.get('search[dist]'), '100');
  assert.equal(url.searchParams.get('currency'), 'EUR');
  assert.ok(!url.href.includes('price'));
});
test('adaptorul face exact o cerere și propagă eroarea fără fallback', async () => {
  let calls = 0;
  const adapter = new OlxSourceAdapter({ pageLoader: async () => { calls++; throw new Error('HTTP 429'); } });
  await assert.rejects(adapter.search(settings), /429/);
  assert.equal(calls, 1);
});
test('filtrare, ordonare, lipsa coordonatelor și reducerea riscului', async () => {
  const result = await searchCars(settings, [new OlxSourceAdapter({ mode: 'fixture' })]);
  assert.equal(result.sources[0]?.mode, 'fixture');
  assert.equal(result.excludedHighRisk, 2);
  assert.ok(result.results.length <= 30);
  assert.ok(result.results.some(row => row.listing.id === 'demo-duster-good' && row.estimate.estimatedMarketPrice === 11500));
  assert.ok(!result.results.some(row => row.listing.id === 'demo-far-away'));
  assert.ok(result.results.every(row => row.listing.priceEur <= 10000 && row.risk.riskScore < 70));
  assert.deepEqual(result.results.map(row => row.opportunityScore), result.results.map(row => row.opportunityScore).sort((a,b) => b-a));
  const unknown = result.results.find(row => row.listing.id === 'demo-unknown-location');
  assert.ok(unknown);
  assert.equal(unknown.distanceKm, null);
});
test('păstrează riscul mare când excludeDamaged=false', async () => {
  const adapter = adapterWith([car({ description: 'avariat' })]);
  assert.equal((await searchCars({ ...settings, excludeDamaged: false }, [adapter])).results.length, 1);
  assert.equal((await searchCars(settings, [adapter])).results.length, 0);
});
test('păstrează 25 sub limita 30, elimină duplicatele și invalidele; penalizează distanța necunoscută', async () => {
  const listings = [...Array.from({ length: 25 }, (_, i) => car({ id: `eligible-${i}` })), ...peers(),
    car({ id: 'missing-year', year: null }), car({ id: 'missing-mileage', mileageKm: null }),
    car({ id: 'invalid-price', priceEur: NaN })];
  const adapter = adapterWith([...listings, ...listings]);
  const result = await searchCars(settings, [adapter]);
  assert.equal(result.results.length, 25);
  assert.equal(result.fetchedCount, 36);
  assert.ok(!result.results.some(row => row.listing.id.startsWith('missing')));
  const base = adapterWith([car(), ...peers()]);
  const missing = adapterWith([car({ latitude: null }), ...peers()]);
  const knownResult = (await searchCars(settings, [base])).results[0]!;
  const missingResult = (await searchCars(settings, [missing])).results[0]!;
  assert.ok(missingResult.estimate.confidenceScore < knownResult.estimate.confidenceScore);
});
test('validează setările înainte de a apela sursa', async () => {
  await assert.rejects(searchCars({ ...settings, radiusKm: -1 }, []), /invalide/);
});

function htmlWithAds(ads: unknown[]): string {
  return `<script>window.__PRERENDERED_STATE__ = ${JSON.stringify(JSON.stringify({ listing: { listing: { ads } } }))};</script>`;
}
function publicAd(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { id: 1, url: 'https://www.olx.ro/d/oferta/test-ID1.html', title: 'Dacia Duster',
    price: { regularPrice: { currencyCode: 'EUR', value: 9500 } },
    params: [{ key: 'model', value: 'Duster' }, { key: 'state', value: 'Avariat' }],
    description: 'Motor<br>defect', map: {}, ...overrides };
}
test('forma publică păstrează spațiile HTML, starea și datele lipsă', () => {
  const listing = parseOlxHtml(htmlWithAds([publicAd()])).listings[0]!;
  assert.equal(listing.description, 'Motor defect');
  assert.equal(listing.make, 'Dacia');
  assert.equal(listing.model, 'Duster');
  assert.equal(listing.year, null);
  assert.equal(listing.mileageKm, null);
  assert.equal(listing.latitude, null);
  assert.equal(analyzeListingRisk(listing).riskScore, 100);
  const empty = parseOlxHtml(htmlWithAds([publicAd({ description: '' })])).listings[0]!;
  assert.equal(empty.description, '');
  assert.equal(analyzeListingRisk(empty).riskScore, 80);
});
test('exclude RON, prețuri invalide, anunțuri inactive și URL-uri externe', () => {
  const invalid = [publicAd({ price: { regularPrice: { currencyCode: 'RON', value: 10000 } } }),
    publicAd({ price: { regularPrice: { currencyCode: 'EUR', value: -5 } } }),
    publicAd({ url: 'https://www.autovit.ro/example' }), publicAd({ url: 'javascript:alert(1)' }),
    publicAd({ isActive: false })];
  const result = parseOlxHtml(htmlWithAds(invalid));
  assert.equal(result.listings.length, 0);
  assert.ok(result.warnings[0]?.startsWith('5'));
});
test('transportul oprește la 403, 429 și redirect, fără retry', async context => {
  for (const status of [403, 429, 302]) {
    const mocked = context.mock.method(globalThis, 'fetch', async () => new Response('blocked', { status }));
    await assert.rejects(loadPublicOlxPage(buildOlxSearchUrl(settings)), new RegExp(String(status)));
    assert.equal(mocked.mock.callCount(), 1);
    mocked.mock.restore();
  }
});
test('transportul cere HTML și nu urmează redirecturi', async context => {
  const mocked = context.mock.method(globalThis, 'fetch', async (_url: unknown, options: RequestInit) => {
    assert.equal(options.redirect, 'manual');
    return new Response('<html>ok</html>', { headers: { 'content-type': 'text/html; charset=utf-8' } });
  });
  assert.equal(await loadPublicOlxPage(buildOlxSearchUrl(settings)), '<html>ok</html>');
  mocked.mock.restore();
  context.mock.method(globalThis, 'fetch', async () => new Response('{}', { headers: { 'content-type': 'application/json' } }));
  await assert.rejects(loadPublicOlxPage(buildOlxSearchUrl(settings)), /HTML/);
});
