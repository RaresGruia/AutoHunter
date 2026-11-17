import type { CarListing } from '../models/CarListing.js';
import type { SearchSettings } from '../models/SearchSettings.js';
import type { RiskInput } from './listingRisk.js';
import type { DataConsistency } from './dataConsistency.js';
import { REGISTRATION_PENALTY } from '../config/verificationSettings.js';
import type { PriceEstimate } from './priceEstimator.js';
import { clamp } from './text.js';

export function calculateDealScore(listing: CarListing, estimate: PriceEstimate,
  risk: RiskInput, _distanceKm: number | null, settings: SearchSettings,
  _currentYear = new Date().getFullYear(), consistency?: DataConsistency): number {
  const confidence = estimate.confidenceScore / 100;
  const discount = clamp((estimate.discountPercent ?? 0) / 30, 0, 1);
  const savings = clamp(((estimate.estimatedMarketPrice ?? listing.priceEur) - listing.priceEur) / 3000, 0, 1);
  const vehiclePenalty = risk.mechanicalRisk === undefined ? risk.riskScore
    : Math.max(risk.mechanicalRisk, risk.accidentRisk ?? 0, (risk.legalRisk ?? 0) >= 35 ? risk.legalRisk! : (risk.legalRisk ?? 0) * 0.3)
      + (risk.cosmeticRisk ?? 0) * 0.3 + (risk.dataRisk ?? 0) * 0.15 + (risk.priceRisk ?? 0) * 0.3;
  const registrationPenalty = ['IMPORT', 'UNREGISTERED'].includes(listing.registrationStatus ?? '')
    ? settings.registrationPenalty ?? REGISTRATION_PENALTY : 0;
  const score = 60 * discount * confidence + 20 * savings * confidence + 20 * confidence
    - vehiclePenalty - registrationPenalty - (1 - confidence) * 8;
  let cap = estimate.confidenceScore < 25 ? 45 : 100;
  if ((estimate.discountPercent ?? 0) < 0) cap = Math.min(cap, Math.max(0, 25 + (estimate.discountPercent ?? 0)));
  if (consistency?.seriousConflict) cap = Math.min(cap, 35);
  if ((risk.accidentRisk ?? 0) >= 70) cap = Math.min(cap, 25);
  if ((risk.mechanicalRisk ?? 0) >= 70) cap = Math.min(cap, 35);
  if (consistency?.priceAmbiguity || (risk.priceRisk ?? 0) >= 70) cap = Math.min(cap, 30);
  return Math.round(clamp(score, 0, cap));
}
