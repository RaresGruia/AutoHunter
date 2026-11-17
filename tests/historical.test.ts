import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { historicalAnalysis } from '../src/demo/historical.js';
import { buildServer } from '../src/api/server.js';
import { analyzeLiveOffers, manualLiveOffer } from '../src/live/analyze.js';
import { validateManual } from '../src/live/manual.js';
import type { LiveOffer } from '../src/live/types.js';

test('Synthetic saved analysis preserves computed values and excludes marketplace images', async () => {
  const raw = JSON.parse(await readFile('fixtures/synthetic-analysis-snapshot.json', 'utf8'));
  const response = await historicalAnalysis();
  assert.equal(response.meta.mode, 'HISTORICAL');
  assert.equal(
    response.meta.sourceSha256,
    '62701a4ac35e3f3ea788dc30be17d9bbc69b0457aac34085ece3b7aa93eb9569',
  );
  assert.equal(response.meta.snapshotAt, '2026-10-25T00:00:00.000Z');
  for (const group of ['results', 'needsManualVerification', 'excludedAfterVerification'] as const) {
    assert.equal(response[group].length, raw[group].length);
    response[group].forEach(({ record: r }, i) => {
      for (const field of ['price', 'risks', 'warnings', 'positiveReasons', 'verification', 'url'] as const)
        assert.deepEqual(r[field], raw[group][i][field]);
      assert.deepEqual(r.scores, {
        deal: raw[group][i].scores.deal,
        flipPotential: raw[group][i].scores.flipPotential,
        overallRisk: raw[group][i].scores.overallRisk,
      });
      assert.ok(!('imageUrl' in r));
    });
  }
  assert.equal(response.results.length, 10);
  assert.equal(response.results[0]!.record.price.estimatedMarketEur, 11500);
  assert.deepEqual(response.results[0]!.record.scores, { deal: 40, flipPotential: 54, overallRisk: 28 });
  assert.ok(!JSON.stringify(response).includes('olxcdn'));
});
test('historical API serves only licensed local model references, retaining unmatched-photo fallback', async (t) => {
  const app = await buildServer({ mode: 'DEMO' });
  t.after(() => app.close());
  const r = await app.inject('/api/history/cars');
  assert.equal(r.statusCode, 200);
  const response = r.json();
  assert.equal(response.meta.availability, 'NOT_RECONFIRMED');
  const first = response.results[0];
  assert.equal(first.illustration.imagePresentation, 'REPRESENTATIVE_MODEL');
  assert.equal(first.illustration.make, first.record.car.make);
  assert.equal(first.illustration.model, first.record.car.model);
  const image = await app.inject(first.illustration.imageUrls[0]);
  assert.equal(image.statusCode, 200);
  assert.ok(image.rawPayload.length > 1000);
});
const current = () =>
  Array.from({ length: 6 }, (_, i) =>
    manualLiveOffer(
      validateManual(
        {
          category: 'cars',
          country: 'RO',
          originalUrl: `https://authorized.example.org/recovery-test/${i}`,
          title: 'Dacia Duster',
          make: 'Dacia',
          model: 'Duster',
          priceEur: 9500 + i * 100,
          dataUseAllowed: true,
          permissionEvidence: 'TEST ONLY: simulated authorized data',
          availability: 'USER_CONFIRMED',
          attributes: {
            year: 2021,
            mileageKm: 123000,
            fuel: 'Diesel',
            engineCapacityCc: 1461,
            engine: '1.5 dCi',
            transmission: 'Manuala',
            drivetrain: '4x4',
            description: 'TEST ONLY: not a real offer',
            location: 'Deva',
          },
        },
        '2026-10-26T12:00:00Z',
      ),
      Date.parse('2026-10-26T12:00:00Z'),
    ),
  );
test('unknown synthetic model keeps the no-photo fallback', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'autohunter-synthetic-'));
  const file = join(dir, 'snapshot.json');
  try {
    const raw = JSON.parse(await readFile('fixtures/synthetic-analysis-snapshot.json', 'utf8'));
    raw.results[0].car.make = 'Synthetic';
    raw.results[0].car.model = 'Unmatched';
    await writeFile(file, JSON.stringify(raw));
    const response = await historicalAnalysis(undefined, file);
    assert.equal(response.results[0]!.illustration, null);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('normalized LIVE bridge provides original Flip/risk only after existing five-comparable threshold', () => {
  const rows = current(),
    short = analyzeLiveOffers(rows.slice(0, 5));
  assert.ok(
    short.every(
      (row) =>
        row.analysis.dealScore === null &&
        row.analysis.flipPotential === null &&
        row.analysis.overallRisk === null,
    ),
  );
  const complete = analyzeLiveOffers(rows)[0]!.analysis;
  assert.equal(complete.status, 'SCORED');
  assert.equal(complete.comparableCount, 5);
  assert.equal(typeof complete.flipPotential, 'number');
  assert.equal(typeof complete.overallRisk, 'number');
});
test('HISTORICAL tagged records cannot enter LIVE comparable pools even with copied normalized attributes', () => {
  const rows = current();
  const archive = rows.map((row) => ({ ...row, mode: 'HISTORICAL' })) as unknown as LiveOffer[];
  const r = analyzeLiveOffers([rows[0]!, ...archive.slice(1)]);
  assert.ok(r.every((row) => row.analysis.status === 'INSUFFICIENT_DATA'));
  assert.ok(r.every((row) => row.analysis.flipPotential === null));
});
