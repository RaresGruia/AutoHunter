import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDataConsistency } from '../src/analysis/dataConsistency.js';
import { analyzeListingRisk, hasSevereVehicleRisk } from '../src/analysis/listingRisk.js';
import { registrationStatus, sellerClaims } from '../src/analysis/listingFacts.js';
import { calculateDealScore } from '../src/analysis/dealScore.js';
import { calculateFlipPotential } from '../src/analysis/flipPotential.js';
import { estimatePrice } from '../src/analysis/priceEstimator.js';
import { verifyFinalists } from '../src/services/listingVerificationService.js';
import { searchCars, type RankedCar } from '../src/services/searchService.js';
import { parseOlxDetailHtml } from '../src/sources/olx/olxDetailParser.js';
import { parseDisplayedEuroPrice } from '../src/sources/olx/olxParser.js';
import { OlxSourceAdapter } from '../src/sources/olx/OlxSourceAdapter.js';
import { defaultSearchSettings as settings } from '../src/config/searchSettings.js';
import { car, peers, adapterWith } from './helpers.js';

function ranked(listing = car()): RankedCar {
  return { listing, risk: analyzeListingRisk(listing), estimate: estimatePrice(listing, peers()), distanceKm: 10, dealScore: 80 };
}
const fast = { intervalMs: 0 };
test('2013 structurat vs An 2004: conflict grav fără rescrierea anului', () => {
  const listing = car({ year: 2013, description: 'An 2004. Masina are 192.000 km REALI.', mileageKm: 192000 });
  const result = analyzeDataConsistency(listing);
  assert.equal(result.seriousConflict, true);
  assert.ok(result.dataQualityScore <= 25);
  assert.ok(result.dataConflicts.some(reason => reason.includes('2013') && reason.includes('2004')));
  assert.equal(listing.year, 2013);
});
test('diferență mică de kilometraj nu produce conflict grav', () => {
  const result = analyzeDataConsistency(car({ mileageKm: 238500, description: 'Kilometraj 237500 km.' }));
  assert.equal(result.seriousConflict, false);
  assert.deepEqual(result.dataConflicts, []);
});
test('diferență mare de kilometraj produce conflict', () => assert.equal(analyzeDataConsistency(car({ mileageKm: 238500, description: 'Kilometraj 137500 km.' })).seriousConflict, true));
test('reviziile, distanța de import, prețul și modelul numeric nu sunt an/rulaj declarat', () => {
  const result = analyzeDataConsistency(car({ title: 'Dacia Duster 2000 EUR', description: 'Distributie schimbata la 80000 km. Adusa pe roti peste 2000 km.' }));
  assert.equal(result.seriousConflict, false);
  assert.equal(analyzeDataConsistency(car({ make: 'Peugeot', model: '2008', title: 'Peugeot 2008', year: 2020 })).seriousConflict, false);
});
test('diesel structurat și petrol în descriere: conflict', () => {
  const result = analyzeDataConsistency(car({ fuel: 'Diesel', description: 'Motorizare petrol 1.6.' }));
  assert.ok(result.dataConflicts.some(reason => reason.includes('COMBUSTIBIL')));
  assert.equal(result.seriousConflict, true);
});

test('alte mașini oferite de dealer nu produc conflicte pentru Megane', () => {
  const listing = car({ title: 'Renault Megane Estate', make: 'Renault', model: 'Megane', year: 2018, fuel: 'Benzina',
    description: 'Caroserie cu imperfectiuni estetice. CĂUTAȚI ALT MODEL SAU ALTE DOTĂRI? Modele disponibile acum: Ford Galaxy (an 2019, diesel) și Renault Talisman (an 2020, benzină), motor defect.' });
  const data = analyzeDataConsistency(listing);
  assert.equal(data.seriousConflict, false);
  assert.equal(data.dataConflicts.length, 0);
  assert.ok(data.dataWarnings.some(warning => warning.includes('alte vehicule')));
  assert.equal(analyzeListingRisk(listing).mechanicalRisk, 0);
  assert.equal(analyzeListingRisk(listing).cosmeticRisk, 25);
});
test('an urmat de eticheta km nu este interpretat ca kilometraj', () => {
  assert.equal(analyzeDataConsistency(car({ year: 2021, description: 'An 2021 Km 123000' })).seriousConflict, false);
});
test('data de fabricație urmată de Km nu produce un rulaj fals de 2011 km', () => {
  const data = analyzeDataConsistency(car({ title: 'VW Caddy 2012', make: 'Volkswagen', model: 'Caddy', year: 2012,
    mileageKm: 241000, description: 'An fabricatie 30.11.2011 Km 241000' }));
  assert.equal(data.seriousConflict, false);
  assert.equal(data.dataConflicts.length, 0);
  assert.ok(data.dataWarnings.some(warning => warning.includes('1 an')));
});
test('data importului din titlu nu contrazice anul fabricației', () => {
  const data = analyzeDataConsistency(car({ make: 'Volkswagen', model: 'Golf', year: 2010,
    title: 'Volkswagen Golf An 2010 Euro 5 Import Germania 12/2025' }));
  assert.equal(data.seriousConflict, false);
  assert.deepEqual(data.dataConflicts, []);
});
test('același kilometraj extras de două reguli nu dublează penalizarea', () => {
  const data = analyzeDataConsistency(car({ mileageKm: 162000, description: 'Kilometraj 240000 km' }));
  assert.equal(data.dataConflicts.length, 1);
  assert.equal(data.dataQualityScore, 55);
});
test('tracțiune și cilindree contradictorii', () => {
  assert.equal(analyzeDataConsistency(car({ title: 'Dacia Duster', drivetrain: '4x2', description: 'Tractiune 4x4' })).seriousConflict, true);
  assert.equal(analyzeDataConsistency(car({ description: 'Motor 2500 cmc' })).seriousConflict, true);
  assert.equal(analyzeDataConsistency(car({ description: 'Tractiune selectabila 4x2, 4x4 H, 4x4 L' })).seriousConflict, false);
});
test('avans, preț lunar, de la și fără TVA sunt ambiguități de preț', () => {
  for (const description of ['Pretul afisat este avans', '9500 EUR/luna', 'Pret de la 9500 EUR', '9500 EUR + TVA', 'Pret fara TVA']) {
    assert.equal(analyzeDataConsistency(car({ description })).priceAmbiguity, true, description);
  }
  assert.equal(analyzeDataConsistency(car({ description: 'Pret integral 9500 EUR cu TVA. Finantare disponibila.' })).priceAmbiguity, false);
});
test('imperfecțiuni estetice și zgârieturi sunt cosmetice', () => {
  const risk = analyzeListingRisk(car({ description: 'Caroserie cu imperfecțiuni estetice, zgârieturi.' }));
  assert.ok(risk.cosmeticRisk >= 25);
  assert.equal(risk.mechanicalRisk, 0);
  assert.equal(risk.accidentRisk, 0);
  assert.equal(hasSevereVehicleRisk(risk), false);
});
test('motor defect și avariat sunt categorii distincte cu risc mare', () => {
  assert.ok(analyzeListingRisk(car({ description: 'motor defect' })).mechanicalRisk >= 80);
  assert.ok(analyzeListingRisk(car({ description: 'avariat' })).accidentRisk >= 80);
});
test('neînmatriculat și import: warning mic, fără excludere automată', async () => {
  const listing = car({ description: 'Neînmatriculat, import recent.' });
  const risk = analyzeListingRisk(listing);
  assert.equal(risk.legalRisk, 10);
  assert.equal(hasSevereVehicleRisk(risk), false);
  assert.equal(registrationStatus(listing), 'UNREGISTERED');
  assert.equal(registrationStatus(car({ description: 'Înmatriculată în România' })), 'REGISTERED_RO');
  assert.equal(registrationStatus(car({ description: 'Import Germania' })), 'IMPORT');
  const result = await verifyFinalists([ranked(listing)], peers(), settings, async () => listing, fast);
  assert.equal(result.results.length, 1);
  assert.ok(result.results[0]?.warnings.some(warning => warning.includes('înmatriculare')));
});
test('km reali și stare perfectă rămân afirmații, fără scăderea riscului', () => {
  const broken = car({ description: 'Motor defect.' });
  const claimed = car({ description: 'Motor defect. Km reali. Stare tehnică perfectă. Fără probleme.' });
  assert.ok(sellerClaims(claimed).includes('km reali'));
  assert.equal(analyzeListingRisk(broken).mechanicalRisk, analyzeListingRisk(claimed).mechanicalRisk);
});
test('conflictul grav, accidentul și ambiguitatea plafonează scorul', () => {
  const listing = car({ priceEur: 6000, description: 'An 2004' });
  const data = analyzeDataConsistency(listing);
  const estimate = { ...estimatePrice(car(), peers()), confidenceScore: 95, discountPercent: 50 };
  assert.ok(calculateDealScore(listing, estimate, analyzeListingRisk(listing, data), 0, settings, 2026, data) <= 35);
  assert.ok(calculateDealScore(car(), estimate, analyzeListingRisk(car({ description: 'avariat' })), 0, settings) <= 25);
  const price = analyzeDataConsistency(car({ description: 'Pret afisat este avans' }));
  assert.ok(calculateDealScore(car(), estimate, analyzeListingRisk(car(), price), 0, settings, 2026, price) <= 30);
});
test('cosmetic-only poate avea flip bun, defectul mecanic îl reduce drastic', () => {
  const cosmetic = car({ priceEur: 7500, description: 'Imperfecțiuni estetice.' });
  const mechanical = car({ priceEur: 7500, description: 'Motor defect.' });
  const estimate = estimatePrice(cosmetic, peers());
  const score = calculateFlipPotential(estimate, analyzeListingRisk(cosmetic), analyzeDataConsistency(cosmetic));
  assert.ok(score >= 65, String(score));
  assert.ok(calculateFlipPotential(estimate, analyzeListingRisk(mechanical), analyzeDataConsistency(mechanical)) <= 15);
});
test('maximum 5 pagini, fără cereri pentru comparabile sau pentru restul candidaților', async () => {
  const rows = Array.from({ length: 15 }, (_, i) => ranked(car({ id: `local-${i}` })));
  const requested: string[] = [];
  const result = await verifyFinalists(rows, peers(), settings, async listing => { requested.push(listing.id); return listing; }, fast);
  assert.equal(requested.length, 5);
  assert.equal(result.verification.succeeded, 5);
  assert.equal(result.verification.notRequested, 10);
  assert.ok(requested.every(id => id.startsWith('local-')));
});
test('contradicția Suzuki ajunge în manual și nu mai apare în top', async () => {
  const listing = car({ year: 2013, title: 'Suzuki Grand Vitara', make: 'Suzuki', model: 'Grand Vitara' });
  const result = await verifyFinalists([ranked(listing)], peers(), settings, async () => ({ ...listing, description: 'An 2004' }), fast);
  assert.equal(result.results.length, 0);
  assert.equal(result.needsManualVerification.length, 1);
  assert.equal(result.verification.dataConflicts, 1);
  assert.ok(result.needsManualVerification[0]!.estimate.confidenceScore <= 10);
  assert.ok(result.needsManualVerification[0]!.dealScore <= 35);
});
test('eroare 404 păstrează preliminarul, reduce încrederea, continuă al doilea candidat', async () => {
  let calls = 0;
  const input = [ranked(car()), ranked(car({ id: 'second' }))];
  const result = await verifyFinalists(input, peers(), settings, async listing => { if (++calls === 1) throw new Error('HTTP 404'); return listing; }, fast);
  assert.equal(result.verification.failed, 1);
  assert.equal(result.verification.succeeded, 1);
  const failed = result.results.find(row => row.verificationStatus === 'FAILED')!;
  assert.deepEqual(failed.listing.description, failed.preliminary.listing.description);
  assert.ok(failed.estimate.confidenceScore < failed.preliminary.estimate.confidenceScore);
});
test('blocarea 429 oprește cererile următoare, fără retry', async () => {
  let calls = 0;
  const result = await verifyFinalists([ranked(), ranked(car({ id: 'second' }))], peers(), settings,
    async () => { calls++; throw new Error('HTTP 429'); }, fast);
  assert.equal(calls, 1);
  assert.equal(result.verification.failed, 1);
  assert.equal(result.verification.notRequested, 1);
  assert.equal(result.verification.requested, 1);
  assert.ok(result.verification.stoppedReason);
});
test('prețul actualizat recalculează discountul și reordonează rezultatele', async () => {
  const result = await verifyFinalists([ranked(car({ id: 'first' })), ranked(car({ id: 'second' }))], peers(), settings,
    async listing => ({ ...listing, priceEur: listing.id === 'first' ? 10000 : 6500 }), fast);
  assert.equal(result.results[0]?.listing.id, 'second');
  assert.equal(result.results[0]?.estimate.absoluteSavingEur, 5000);
});
test('defect grav descoperit în detalii este exclus, dar păstrat în diagnostic', async () => {
  const result = await verifyFinalists([ranked()], peers(), settings, async listing => ({ ...listing, description: 'Motor defect' }), fast);
  assert.equal(result.results.length, 0);
  assert.equal(result.excludedAfterVerification.length, 1);
});

function detailHtml(overrides: Record<string, unknown> = {}): string {
  const ad = { id: 'target', url: 'https://example.invalid/target', title: 'Dacia Duster', description: 'An 2021<br>Imperfectiuni estetice',
    price: { regularPrice: { value: 47500, currencyCode: 'RON' }, displayValue: '9 500 €' },
    params: [{ key: 'year', normalizedValue: '2021' }, { key: 'engine_power', normalizedValue: '110' },
      { key: 'enginesize', normalizedValue: '1461' }, { key: 'registration_state', value: 'Neinmatriculat' },
      { key: 'car_body', value: 'SUV' }], isBusiness: true, photos: ['https://example.invalid/photo.jpg'],
    createdTime: '2026-09-01', lastRefreshTime: '2026-09-08', ...overrides };
  return `<script>window.__PRERENDERED_STATE__ = ${JSON.stringify(JSON.stringify({ ad: { ad } }))};</script>`;
}
test('detail parser: câmpuri complete și EUR afișat explicit, fără conversie RON inventată', () => {
  const result = parseOlxDetailHtml(detailHtml(), car(), { fixture: true });
  assert.equal(result.priceEur, 9500);
  assert.equal(result.horsepower, 110);
  assert.equal(result.engineCapacityCc, 1461);
  assert.equal(result.bodyType, 'SUV');
  assert.equal(result.mileageKm, null);
  assert.equal(result.sellerType, 'business');
  assert.equal(result.updatedAt, '2026-09-08');
  assert.equal(result.imageUrls.length, 1);
  assert.equal(result.registrationText, 'Neinmatriculat');
  assert.ok(result.description.includes('2021 Imperfectiuni'));
});
test('detail parser refuză anunț greșit, format necunoscut, preț lipsă și CAPTCHA', () => {
  assert.throws(() => parseOlxDetailHtml(detailHtml({ id: 'different' }), car(), { fixture: true }), /corespunde/);
  assert.throws(() => parseOlxDetailHtml('<html></html>', car()), /anunț activ/);
  assert.throws(() => parseOlxDetailHtml(detailHtml({ price: {} }), car(), { fixture: true }), /preț EUR/);
  assert.throws(() => parseOlxDetailHtml('<title>Just a moment</title>', car()), /protecție/);
});
test('prețuri EUR în formate locale și cu zecimale', () => {
  for (const text of ['4 090,50 €', '4.090,50 EUR', '4090.50 EUR', '4,090.50 EUR']) assert.equal(parseDisplayedEuroPrice(text), 4090.5);
  assert.equal(parseDisplayedEuroPrice('4.090 €'), 4090);
  assert.equal(parseDisplayedEuroPrice('4090 RON'), null);
});
test('adaptorul nu deschide URL-uri externe sau cu credențiale', async () => {
  let calls = 0;
  const adapter = new OlxSourceAdapter({ pageLoader: async () => { calls++; return ''; } });
  await assert.rejects(adapter.getListingDetails(car({ url: 'https://example.com/d/oferta/a' })), /invalid/);
  assert.equal(calls, 0);
});
test('flux complet în două treceri: date cosmetice și legale noi apar în rezultat', async () => {
  const adapter = adapterWith([car()], peers());
  adapter.getListingDetails = async listing => ({ ...listing, description: 'Imperfectiuni estetice. Neinmatriculat. Km reali.', sellerType: 'business' });
  const result = await searchCars(settings, [adapter]);
  assert.equal(result.verification.succeeded, 1);
  assert.equal(result.verification.cosmeticWarnings, 1);
  assert.equal(result.verification.legalWarnings, 1);
  assert.ok(result.results[0]?.sellerClaims.includes('km reali'));
  assert.equal(result.results[0]?.verificationStatus, 'VERIFIED');
});
