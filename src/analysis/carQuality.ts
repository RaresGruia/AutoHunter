import type { CarListing } from '../models/CarListing.js';
import type { DataConsistency } from './dataConsistency.js';
import type { ListingRisk } from './listingRisk.js';
import type { PriceEstimate } from './priceEstimator.js';
import { clamp } from './text.js';

export type Classification = 'GREAT_DEAL' | 'GOOD_DEAL' | 'INTERESTING_CAR' | 'FAIR' | 'POOR_VALUE' | 'NEEDS_VERIFICATION';
export function calculateCarQuality(car: CarListing, risk: ListingRisk, data: DataConsistency,
  status: 'VERIFIED' | 'FAILED' | 'NOT_REQUESTED', currentYear = new Date().getFullYear()): { carQualityScore: number; qualityReasons: string[] } {
  const age = car.year === null ? null : Math.max(1, currentYear - car.year);
  const annual = age && car.mileageKm !== null ? car.mileageKm / age : null;
  const configuration = [car.fuel, car.engine, car.transmission, car.drivetrain, car.bodyType, car.horsepower].filter(Boolean).length / 6;
  // Model reference photos provide no evidence about this item's condition or listing completeness.
  const itemPhotos = car.imagePresentation === 'REPRESENTATIVE_MODEL' ? 0 : car.imageUrls.length;
  const completeness = [car.description.trim(), car.locationText, itemPhotos, car.sellerType].filter(Boolean).length / 4;
  const score = (age === null ? 0 : 25 * clamp(1 - (age - 1) / 24, 0, 1))
    + (car.mileageKm === null ? 0 : 20 * clamp(1 - car.mileageKm / 350000, 0, 1))
    + (annual === null ? 0 : 10 * clamp(1 - Math.max(0, annual - 15000) / 35000, 0, 1))
    + 20 * data.dataQualityScore / 100 + (status === 'VERIFIED' ? 10 : status === 'NOT_REQUESTED' ? 4 : 0)
    + 8 * completeness + 7 * configuration
    - risk.mechanicalRisk * 0.6 - risk.accidentRisk * 0.65 - risk.legalRisk * 0.35 - risk.cosmeticRisk * 0.1;
  const qualityReasons = [age !== null && age <= 8 ? 'An relativ recent.' : 'Vârsta reduce scorul de calitate.',
    annual !== null && annual <= 25000 ? 'Kilometraj rezonabil pentru vârstă, conform anunțului.' : 'Kilometraj mare pentru vârstă sau necunoscut.',
    data.seriousConflict ? 'Date contradictorii: necesită verificare.' : 'Nu sunt detectate contradicții serioase în date.',
    risk.mechanicalRisk ? 'Indicii de probleme mecanice.' : 'Fără indicii mecanice în text; nu este inspecție tehnică.',
    status === 'VERIFIED' ? 'Pagina individuală a fost citită și verificată.' : 'Pagina individuală nu este confirmată.',
    `Configurație documentată: ${Math.round(configuration * 6)}/6 câmpuri; fără preferință pentru automată sau 4x4.`];
  if (risk.legalRisk || ['IMPORT', 'UNREGISTERED'].includes(car.registrationStatus ?? '')) qualityReasons.push('Acte / import / înmatriculare de verificat.');
  return { carQualityScore: Math.round(clamp(score, 0, data.seriousConflict ? 35 : 100)), qualityReasons };
}

export function classifyCar(quality: number, estimate: PriceEstimate, risk: ListingRisk, data: DataConsistency): Classification {
  if (data.seriousConflict || data.priceAmbiguity || data.dataQualityScore < 40
    || Math.max(risk.mechanicalRisk, risk.accidentRisk, risk.legalRisk) >= 70) return 'NEEDS_VERIFICATION';
  const discount = estimate.discountPercent;
  const safe = Math.max(risk.mechanicalRisk, risk.accidentRisk, risk.legalRisk) < 35 && risk.priceRisk < 35;
  if (discount !== null && estimate.confidenceScore >= 40 && safe) {
    if (discount >= 15) return 'GREAT_DEAL';
    if (discount >= 7) return 'GOOD_DEAL';
  }
  if (quality >= 70) return 'INTERESTING_CAR';
  if (discount !== null && discount <= -15 && estimate.confidenceScore >= 25) return 'POOR_VALUE';
  return 'FAIR';
}
export function calculateOpportunity(deal: number, quality: number, flip: number, estimate: PriceEstimate, risk: ListingRisk, classification: Classification): number {
  const score = 0.5 * deal + 0.25 * quality + 0.15 * flip + 0.1 * estimate.confidenceScore
    - Math.max(risk.mechanicalRisk, risk.accidentRisk, risk.legalRisk) * 0.2;
  const cap = classification === 'NEEDS_VERIFICATION' ? 20 : (estimate.discountPercent ?? 0) <= -15 ? 30 : 100;
  return Math.round(clamp(score, 0, cap));
}
