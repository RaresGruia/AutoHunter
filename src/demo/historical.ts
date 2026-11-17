import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import type { HistoricalCar, HistoricalVehicle, HistoricalResponse } from '../models/HistoricalAnalysis.js';
import { readHistoricalResponse } from '../models/HistoricalAnalysis.js';
import { demoVehicles } from './vehicles.js';

/** Read archived numeric output verbatim. Never fetch old URLs or recalculate against today's data. */
export async function historicalAnalysis(
  manifestPath?: string,
  snapshotPath = resolve('fixtures/synthetic-analysis-snapshot.json'),
): Promise<HistoricalResponse> {
  const bytes = await readFile(snapshotPath);
  const snapshot = JSON.parse(bytes.toString('utf8'));
  const demo = await demoVehicles(manifestPath);
  const project = (raw: HistoricalCar): HistoricalVehicle => {
    const {
      id,
      title,
      car,
      price,
      risks,
      positiveReasons,
      warnings,
      sellerClaims,
      verification,
      location,
      url,
    } = raw;
    return {
      // Explicit projection intentionally discards imageUrl and any future remote image fields.
      record: {
        id,
        title,
        car,
        price,
        scores: {
          deal: raw.scores.deal,
          flipPotential: raw.scores.flipPotential,
          overallRisk: raw.scores.overallRisk,
        },
        risks,
        positiveReasons,
        warnings,
        sellerClaims,
        verification,
        location,
        url,
      },
      illustration: demo.results.find((row) => row.make === car.make && row.model === car.model) ?? null,
    };
  };
  return readHistoricalResponse({
    meta: {
      mode: 'HISTORICAL',
      snapshotAt: snapshot.meta.searchedAt,
      sourceFile: 'fixtures/synthetic-analysis-snapshot.json',
      sourceSha256: createHash('sha256').update(bytes).digest('hex'),
      availability: 'NOT_RECONFIRMED',
      localFetched: snapshot.meta.localFetched,
      eligible: snapshot.meta.eligible,
      analyzed: snapshot.meta.analyzed,
      warning:
        'Snapshot DEMO sintetic calculat offline din fixture-uri. Nu reprezintă oferte reale și nu intră în analiza LIVE.',
    },
    results: snapshot.results.map(project),
    needsManualVerification: snapshot.needsManualVerification.map(project),
    excludedAfterVerification: snapshot.excludedAfterVerification.map(project),
  });
}
