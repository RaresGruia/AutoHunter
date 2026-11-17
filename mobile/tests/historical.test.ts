import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readHistoricalResponse, type HistoricalResponse } from '../../src/models/HistoricalAnalysis.js';
import { readLiveResponse } from '../src/live/api.js';
import { readDemoResponse } from '../src/live/offers.js';
import { historicalMetrics } from '../src/live/historicalPresentation.js';
const snapshot = JSON.parse(
  readFileSync(new URL('../../fixtures/synthetic-analysis-snapshot.json', import.meta.url), 'utf8'),
);
const response: HistoricalResponse = {
  meta: {
    mode: 'HISTORICAL',
    snapshotAt: snapshot.meta.searchedAt,
    sourceFile: 'fixtures/synthetic-analysis-snapshot.json',
    sourceSha256: '62701a4ac35e3f3ea788dc30be17d9bbc69b0457aac34085ece3b7aa93eb9569',
    availability: 'NOT_RECONFIRMED',
    localFetched: snapshot.meta.localFetched,
    eligible: snapshot.meta.eligible,
    analyzed: snapshot.meta.analyzed,
    warning: 'TEST ONLY: historical data',
  },
  results: snapshot.results.map((record: unknown) => ({ record, illustration: null })),
  needsManualVerification: [],
  excludedAfterVerification: [],
};
test('historical decoder and LIVE/DEMO decoders reject crossed datasets', () => {
  assert.equal(readHistoricalResponse(response).results.length, 10);
  assert.throws(() => readLiveResponse(response), /INVALID_LIVE/);
  assert.throws(() => readDemoResponse(response), /INVALID_DEMO/);
  assert.throws(
    () => readHistoricalResponse({ ...response, meta: { ...response.meta, mode: 'LIVE' } }),
    /INVALID_HISTORICAL/,
  );
});
test('synthetic snapshot metrics reach shared analysis panel without recalculation', () => {
  assert.deepEqual(historicalMetrics(response.results[0]!), {
    dealScore: snapshot.results[0].scores.deal,
    flipPotential: snapshot.results[0].scores.flipPotential,
    overallRisk: snapshot.results[0].scores.overallRisk,
    estimatedMarketEur: snapshot.results[0].price.estimatedMarketEur,
    savingEur: snapshot.results[0].price.potentialSavingEur,
    discountPercent: snapshot.results[0].price.discountPercent,
    confidence: snapshot.results[0].price.confidence,
    comparableCount: snapshot.results[0].price.comparableCount,
    reasons: snapshot.results[0].positiveReasons,
    risks: snapshot.results[0].warnings,
  });
});
test('malformed historical scores are not replaced with invented values', () => {
  const value = structuredClone(response);
  value.results[0]!.record.scores.deal = NaN;
  assert.throws(() => readHistoricalResponse(value), /INVALID_HISTORICAL/);
});
