import type { PriceEstimate } from './priceEstimator.js';
import type { ListingRisk } from './listingRisk.js';
import type { DataConsistency } from './dataConsistency.js';
import { clamp } from './text.js';

export function calculateFlipPotential(estimate: PriceEstimate, risk: ListingRisk, data: DataConsistency): number {
  const discount = clamp((estimate.discountPercent ?? 0) / 30, 0, 1);
  if (discount === 0) return 0;
  const quality = data.dataQualityScore / 100;
  const confidence = estimate.confidenceScore / 100;
  const sample = clamp(estimate.comparableCount / 8, 0, 1);
  const minor = risk.cosmeticRisk > 0 && risk.cosmeticRisk <= 40 && risk.mechanicalRisk <= 10 && risk.accidentRisk < 30;
  const saving = clamp((estimate.absoluteSavingEur ?? 0) / 3000, 0, 1);
  const score = (45 * discount + 20 * saving + 15 * sample + (minor ? 20 : 10)) * confidence * quality
    - risk.mechanicalRisk * 0.9 - risk.accidentRisk * 0.8 - risk.legalRisk * 0.6 - risk.priceRisk;
  let cap = confidence < 0.25 ? 25 : 100;
  if (data.seriousConflict || data.priceAmbiguity || Math.max(risk.mechanicalRisk, risk.accidentRisk, risk.legalRisk) >= 70) cap = 15;
  return Math.round(clamp(score, 0, cap));
}
