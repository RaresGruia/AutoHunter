import type { ApiCar } from '../api/types.js';
import type { DemoVehicle } from '../demo/vehicles.js';

/** Archived output, deliberately incompatible with a current LIVE offer. */
export type HistoricalCar = Pick<
  ApiCar,
  | 'id'
  | 'title'
  | 'car'
  | 'price'
  | 'risks'
  | 'positiveReasons'
  | 'warnings'
  | 'sellerClaims'
  | 'verification'
  | 'location'
  | 'url'
> & { scores: Pick<ApiCar['scores'], 'deal' | 'flipPotential' | 'overallRisk'> };
export interface HistoricalVehicle {
  record: HistoricalCar;
  /** Licensed model reference only, never the archived marketplace photograph. */
  illustration: DemoVehicle | null;
}
export interface HistoricalResponse {
  meta: {
    mode: 'HISTORICAL';
    snapshotAt: string;
    sourceFile: 'fixtures/synthetic-analysis-snapshot.json';
    sourceSha256: string;
    availability: 'NOT_RECONFIRMED';
    localFetched: number;
    eligible: number;
    analyzed: number;
    warning: string;
  };
  results: HistoricalVehicle[];
  needsManualVerification: HistoricalVehicle[];
  excludedAfterVerification: HistoricalVehicle[];
}
export function readHistoricalResponse(value: unknown): HistoricalResponse {
  const v = value as HistoricalResponse;
  const finite = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  if (
    v?.meta?.mode !== 'HISTORICAL' ||
    v.meta.availability !== 'NOT_RECONFIRMED' ||
    !Number.isFinite(Date.parse(v.meta.snapshotAt)) ||
    v.meta.sourceFile !== 'fixtures/synthetic-analysis-snapshot.json' ||
    !/^[a-f0-9]{64}$/.test(v.meta.sourceSha256) ||
    ![v.results, v.needsManualVerification, v.excludedAfterVerification].every(Array.isArray)
  )
    throw Error('INVALID_HISTORICAL_RESPONSE');
  for (const row of [...v.results, ...v.needsManualVerification, ...v.excludedAfterVerification]) {
    const r = row?.record;
    if (
      !r ||
      typeof r.id !== 'string' ||
      typeof r.title !== 'string' ||
      !r.car ||
      !r.risks ||
      !finite(r.price?.askingEur) ||
      r.price.askingEur <= 0 ||
      ![
        r.scores?.deal,
        r.scores?.flipPotential,
        r.scores?.overallRisk,
        r.price.confidence,
        r.price.comparableCount,
      ].every(finite) ||
      ![r.price.estimatedMarketEur, r.price.discountPercent, r.price.potentialSavingEur].every(
        (n) => n === null || finite(n),
      ) ||
      ![r.positiveReasons, r.warnings, r.sellerClaims].every(Array.isArray)
    )
      throw Error('INVALID_HISTORICAL_RESPONSE');
  }
  return v;
}
