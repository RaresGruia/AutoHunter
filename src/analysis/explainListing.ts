import type { CarListing } from '../models/CarListing.js';
import type { PriceEstimate } from './priceEstimator.js';
import type { ListingRisk } from './listingRisk.js';
import type { DataConsistency } from './dataConsistency.js';

export function explainListing(listing: CarListing, estimate: PriceEstimate, risk: ListingRisk,
  data: DataConsistency, claims: readonly string[]): { positiveReasons: string[]; warnings: string[] } {
  const positiveReasons: string[] = [];
  if (!data.seriousConflict && !data.priceAmbiguity) {
    if ((estimate.discountPercent ?? 0) > 0) positiveReasons.push(`${estimate.discountPercent}% sub mediana eșantionului`);
    if ((estimate.absoluteSavingEur ?? 0) > 0) positiveReasons.push(`~${estimate.absoluteSavingEur} EUR diferență față de mediană, înainte de costuri`);
  }
  if (estimate.comparableCount >= 5) positiveReasons.push(`${estimate.comparableCount} comparabile`);
  if (listing.drivetrain && /4x4|awd|4wd/i.test(listing.drivetrain)) positiveReasons.push('4x4 declarat în anunț');
  if (risk.mechanicalRisk === 0) positiveReasons.push('Nu au fost detectate probleme mecanice în text; starea nu este confirmată');
  const warnings = [...risk.riskReasons, ...data.dataWarnings];
  if (listing.sellerType === 'business') warnings.push('Vânzător firmă');
  if (claims.length) warnings.push('Afirmațiile vânzătorului nu sunt verificate');
  if (estimate.confidenceScore < 40) warnings.push('Încredere mică în estimarea pieței');
  if (estimate.comparableLevel === 3) warnings.push('Comparație relaxată: motorizările/configurațiile pot diferi');
  return { positiveReasons, warnings: [...new Set(warnings)] };
}
