import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mapApiResponse } from '../src/apiClient';
import { scoreLabels, visibleResults, classificationLabels } from '../src/display';
import { DEFAULT_SETTINGS, loadSettings } from '../src/settings';

const original = JSON.parse(readFileSync(new URL('../../fixtures/synthetic-analysis-snapshot.json', import.meta.url), 'utf8'));
test('V2 maps all scores, classification, quality reasons and stale market freshness', () => {
  const input = structuredClone(original), car = input.results[0];
  car.scores.carQuality = 78; car.scores.opportunity = 25; car.classification = 'INTERESTING_CAR';
  car.qualityReasons = ['Date consistente'];
  car.marketData = { freshness: 'STALE', fetchedAt: '2026-09-01T00:00:00Z', matchQuality: 'RELAXED', comparableSimilarityAverage: 56 };
  const mapped = mapApiResponse(input).results[0]!;
  assert.equal(mapped.scores.carQuality, 78); assert.equal(mapped.scores.opportunity, 25);
  assert.deepEqual(mapped.marketData, car.marketData); assert.deepEqual(mapped.qualityReasons, car.qualityReasons);
  assert.equal(classificationLabels[mapped.classification!], '👀 Mașină interesantă');
});
test('card score labels contain Deal, Car Quality and Flip separately', () => {
  assert.deepEqual(scoreLabels({ deal: 21, carQuality: 78, flipPotential: 0 }), ['🔥 Deal: 21/100', '🚗 Car Quality: 78/100', '💰 Flip: 0/100']);
  assert.match(scoreLabels({ deal: 21, flipPotential: 0 })[1]!, /—/);
});
test('Top shows 10, All shows all 30 including expensive cars without reordering', () => {
  const cars = Array.from({ length: 30 }, (_, id) => ({ id, classification: id > 20 ? 'POOR_VALUE' : 'GOOD_DEAL' }));
  assert.deepEqual(visibleResults(cars, false), cars.slice(0, 10)); assert.deepEqual(visibleResults(cars, true), cars);
});
test('default is 30 but persisted user limit remains intact', async () => {
  assert.equal(DEFAULT_SETTINGS.limit, 30);
  for (const limit of [10, 20, 30]) {
    const result = await loadSettings({ getItem: async () => JSON.stringify({ ...DEFAULT_SETTINGS, limit }), setItem: async () => {} });
    assert.equal(result.settings.limit, limit);
  }
});
test('legacy response remains supported without fabricated quality, malformed freshness rejected', () => {
  const { requestMetrics, synthetic, ...publicMeta } = original.meta;
  assert.equal(synthetic, true);
  assert.deepEqual(mapApiResponse(original), { ...original, meta: publicMeta });
  const changed = structuredClone(original);
  changed.results[0].marketData = { freshness: 'MAGIC', matchQuality: 'EXACT' };
  assert.throws(() => mapApiResponse(changed), /INVALID_RESPONSE/);
});
