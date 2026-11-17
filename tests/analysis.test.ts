import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeListingRisk } from '../src/analysis/listingRisk.js';
import { median, estimatePrice, areComparable } from '../src/analysis/priceEstimator.js';
import { haversineKm, listingDistanceKm } from '../src/analysis/distance.js';
import { calculateDealScore } from '../src/analysis/dealScore.js';
import { defaultSearchSettings as settings } from '../src/config/searchSettings.js';
import { car, peers } from './helpers.js';

test('detectează avariat în titlu', () => {
  const risk = analyzeListingRisk(car({ title: 'Duster AVARIAT' }));
  assert.ok(risk.riskScore >= 70);
  assert.ok(risk.reasons.includes('Avarii menționate'));
});

for (const phrase of ['nu pornește', 'nu porneste', 'NU PORNEŞTE', 'Nu mai pornește']) {
  test(`detectează ${phrase}`, () => assert.ok(analyzeListingRisk(car({ description: phrase })).riskScore >= 70));
}

for (const phrase of ['accidentat', 'daună', 'motor defect', 'cutie defectă', 'pentru piese',
  'dezmembrări', 'fără acte', 'probleme motor', 'probleme cutie', 'bate motorul', 'consumă ulei',
  'airbag declanșat', 'necesită investiții']) {
  test(`detectează expresia ${phrase}`, () => assert.ok(analyzeListingRisk(car({ description: phrase })).riskScore > 0));
}

test('anunț normal fără termeni negativi', () => assert.deepEqual(analyzeListingRisk(car()), {
  riskScore: 0, reasons: [], overallRisk: 0, riskReasons: [], mechanicalRisk: 0, accidentRisk: 0,
  cosmeticRisk: 0, legalRisk: 0, priceRisk: 0, dataRisk: 0,
}));
test('negațiile uzuale nu sunt avarii', () => {
  assert.equal(analyzeListingRisk(car({ description: 'Nu este avariat. Fără daune sau probleme motor. Nu consumă ulei.' })).riskScore, 0);
});
test('negarea accidentelor nu ascunde defectul din propoziția următoare', () => {
  assert.ok(analyzeListingRisk(car({ description: 'Fără daune. Motor defect.' })).riskScore >= 90);
});
test('un indiciu ușor nu exclude automat', () => assert.equal(analyzeListingRisk(car({ description: 'Necesită investiții.' })).riskScore, 35));

test('mediana pentru număr par/impar, valori extreme și eșantion gol', () => {
  assert.equal(median([11000, 12000, 11500, 999999, 10000]), 11500);
  assert.equal(median([4, 1, 3, 2]), 2.5);
  assert.equal(median([]), null);
});
test('estimarea exclude propriul anunț și calculează reducerea', () => {
  const estimate = estimatePrice(car(), [car(), ...peers()]);
  assert.equal(estimate.estimatedMarketPrice, 11500);
  assert.equal(estimate.discountPercent, 17.4);
  assert.equal(estimate.comparableCount, 9);
  assert.ok(estimate.confidenceScore > 70);
});
test('nu amestecă modele, combustibil, ani, kilometraj sau transmisii', () => {
  for (const overrides of [{ model: 'Logan' }, { make: 'Ford' }, { year: 2010 },
    { mileageKm: 300000 }, { fuel: 'Benzina' }, { transmission: 'Automata' }, { drivetrain: '4x2' },
    { engine: '1998 cm3' }, { make: null }]) assert.equal(areComparable(car(), car(overrides)), false);
});
test('normalizează VW și motorină', () => assert.equal(areComparable(car({ make: 'VW' }), car({ make: 'Volkswagen', fuel: 'Motorină' })), true));
test('fără comparabile, nu inventează prețul pieței', () => {
  assert.deepEqual(estimatePrice(car(), [car()]), { estimatedMarketPrice: null, discountPercent: null,
    absoluteSavingEur: null, comparableCount: 0, confidenceScore: 0, comparableLevel: null,
    comparableSimilarityAverage: null, matchQuality: 'UNAVAILABLE', marketDataFreshness: 'UNAVAILABLE', marketFetchedAt: null,
    diagnostics: [1, 2, 3].map(level => ({ level, matches: 0, retained: 0, outliersRemoved: 0 })) });
});
test('eșantion mic și informații lipsă reduc încrederea', () => {
  assert.ok(estimatePrice(car(), peers().slice(0,2)).confidenceScore <= 25);
  assert.ok(estimatePrice(car({ fuel: null, engine: null }), peers()).confidenceScore < estimatePrice(car(), peers()).confidenceScore);
});
test('exclude duplicatele și comparabilele defecte', () => {
  const peer = peers()[0]!;
  const result = estimatePrice(car(), [peer, peer, car({ id: 'copy', url: peer.url }), car({ id: 'broken', description: 'Motor defect', priceEur: 2000 })]);
  assert.equal(result.comparableCount, 1);
  assert.equal(result.estimatedMarketPrice, 11000);
});
test('preț peste piață dă discount negativ', () => assert.ok(estimatePrice(car({ priceEur: 20000 }), peers()).discountPercent! < 0));

test('Haversine: identitate, simetrie și Deva–Hunedoara', () => {
  const deva = settings.origin;
  const hunedoara = { latitude: 45.75, longitude: 22.9 };
  assert.equal(haversineKm(deva, deva), 0);
  assert.ok(Math.abs(haversineKm(deva, hunedoara) - 14.27) < 0.2);
  assert.equal(haversineKm(deva, hunedoara), haversineKm(hunedoara, deva));
  assert.ok(Math.abs(haversineKm({ latitude: 0, longitude: 0 }, { latitude: 0, longitude: 1 }) - 111.195) < 0.01);
});
test('coordonate lipsă/invalide nu sunt inventate', () => {
  assert.equal(listingDistanceKm(settings.origin, car({ latitude: null })), null);
  assert.equal(listingDistanceKm(settings.origin, car({ latitude: 120 })), null);
  assert.throws(() => haversineKm(settings.origin, { latitude: NaN, longitude: 0 }));
});
test('o ofertă bună bate o mașină defectă artificial ieftină', () => {
  const good = car();
  const bad = car({ id: 'bad', priceEur: 2500, description: 'Motor defect, nu pornește.' });
  const score = (listing: ReturnType<typeof car>): number => calculateDealScore(listing, estimatePrice(listing, peers()), analyzeListingRisk(listing), 18, settings, 2026);
  assert.ok(score(good) > 50);
  assert.ok(score(good) > score(bad) + 40);
  assert.equal(score(bad), 0);
});
test('prețul mic fără comparabile nu produce scor mare', () => {
  const listing = car({ priceEur: 2000 });
  const score = calculateDealScore(listing, estimatePrice(listing, []), analyzeListingRisk(listing), null, settings, 2026);
  assert.ok(score < 30);
});
