import type { CarListing } from '../models/CarListing.js';
import type { SearchSettings } from '../models/SearchSettings.js';
import type { RankedCar } from './searchService.js';
import { analyzeDataConsistency, type DataConsistency } from '../analysis/dataConsistency.js';
import { analyzeListingRisk, hasSevereVehicleRisk } from '../analysis/listingRisk.js';
import { registrationStatus, sellerClaims } from '../analysis/listingFacts.js';
import { calculateDealScore } from '../analysis/dealScore.js';
import { calculateFlipPotential } from '../analysis/flipPotential.js';
import { explainListing } from '../analysis/explainListing.js';
import { estimatePrice } from '../analysis/priceEstimator.js';
import { listingDistanceKm } from '../analysis/distance.js';
import { normalizeCarIdentity } from '../analysis/carIdentity.js';
import { normalizeText } from '../analysis/text.js';
import { MAX_DETAIL_REQUESTS, DETAIL_REQUEST_INTERVAL_MS } from '../config/verificationSettings.js';
import { calculateCarQuality, classifyCar, calculateOpportunity, type Classification } from '../analysis/carQuality.js';

export type VerificationStatus = 'VERIFIED' | 'FAILED' | 'NOT_REQUESTED';
export interface VerifiedCar extends RankedCar, DataConsistency {
  carQualityScore: number;
  opportunityScore: number;
  classification: Classification;
  qualityReasons: string[];
  verificationStatus: VerificationStatus;
  verificationError: string | null;
  preliminary: RankedCar;
  flipPotentialScore: number;
  sellerClaims: string[];
  positiveReasons: string[];
  warnings: string[];
}
export interface VerificationSummary {
  requested: number;
  budget: number;
  succeeded: number;
  failed: number;
  notRequested: number;
  dataConflicts: number;
  cosmeticWarnings: number;
  mechanicalOrAccidentWarnings: number;
  legalWarnings: number;
  stoppedReason: string | null;
}
export interface VerificationOptions {
  accessBlocked?: boolean;
  maxDetails?: number;
  intervalMs?: number;
  onProgress?: (message: string) => void;
}

export function compareRanked(a: RankedCar, b: RankedCar): number {
  return (b.opportunityScore ?? b.dealScore) - (a.opportunityScore ?? a.dealScore) || b.estimate.confidenceScore - a.estimate.confidenceScore
    || a.listing.priceEur - b.listing.priceEur || a.listing.id.localeCompare(b.listing.id);
}

function outsideFilters(listing: CarListing, distance: number | null, settings: SearchSettings): boolean {
  return listing.priceEur < settings.minPriceEur || listing.priceEur > settings.maxPriceEur
    || listing.year === null || listing.year < settings.minYear
    || listing.mileageKm === null || listing.mileageKm > settings.maxMileageKm
    || (distance !== null && distance > settings.radiusKm);
}

export async function verifyFinalists(preliminary: readonly RankedCar[], pool: readonly CarListing[], settings: SearchSettings,
  getDetails: (listing: CarListing) => Promise<CarListing>, options: VerificationOptions = {}): Promise<{
    results: VerifiedCar[]; needsManualVerification: VerifiedCar[]; excludedAfterVerification: VerifiedCar[]; verification: VerificationSummary;
  }> {
  const budget = options.maxDetails ?? MAX_DETAIL_REQUESTS;
  const interval = options.intervalMs ?? DETAIL_REQUEST_INTERVAL_MS;
  if (!Number.isInteger(budget) || budget < 0 || budget > MAX_DETAIL_REQUESTS || !Number.isFinite(interval) || interval < 0) throw new Error('Limite de verificare invalide.');
  const verification: VerificationSummary = { requested: 0, budget, succeeded: 0, failed: 0, notRequested: 0,
    dataConflicts: 0, cosmeticWarnings: 0, mechanicalOrAccidentWarnings: 0, legalWarnings: 0,
    stoppedReason: options.accessBlocked ? 'OLX_ACCESS_DENIED: no further detail requests.' : null };
  const ordered = [...preliminary].sort(compareRanked);
  const staged: { original: RankedCar; listing: CarListing; status: VerificationStatus; error: string | null }[] = [];
  for (const [index, original] of ordered.entries()) {
    let listing = original.listing;
    let status: VerificationStatus = 'NOT_REQUESTED';
    let error: string | null = null;
    if (index < budget && !verification.stoppedReason) {
      status = 'FAILED';
      if (verification.stoppedReason) error = `Detaliile nu au fost cerute după blocarea sursei: ${verification.stoppedReason}`;
      else {
        if (verification.requested > 0 && interval > 0) await new Promise(resolve => setTimeout(resolve, interval));
        verification.requested++;
        options.onProgress?.(`DETAIL ${verification.requested}/${budget}: ${listing.title}`);
        try {
          const detail = await getDetails(listing);
          if (detail.id !== listing.id || detail.url !== listing.url || detail.source !== listing.source) throw new Error('Identitatea paginii individuale nu corespunde candidatului.');
          listing = normalizeCarIdentity(detail);
          status = 'VERIFIED';
          verification.succeeded++;
        } catch (caught: unknown) {
          error = caught instanceof Error ? caught.message : String(caught);
          if (/\b(?:403|429)\b|captcha|protectie|access denied|just a moment/.test(normalizeText(error))) verification.stoppedReason = error;
        }
      }
      if (status === 'FAILED') verification.failed++;
    } else verification.notRequested++;
    options.onProgress?.(`  ${status}${error ? `: ${error}` : ''}`);
    staged.push({ original, listing, status, error });
  }
  // Refolosim piața deja colectată. Excludem referințele cu contradicții cunoscute, fără a le deschide paginile.
  const replacements = new Map(staged.filter(row => row.status === 'VERIFIED').map(row => [`${row.listing.source}:${row.listing.id}`, row.listing]));
  const finalPool = pool.map(car => replacements.get(`${car.source}:${car.id}`) ?? car)
    .filter(car => { const data = analyzeDataConsistency(car); return !data.seriousConflict && !data.priceAmbiguity; });
  const results: VerifiedCar[] = [];
  const needsManualVerification: VerifiedCar[] = [];
  const excludedAfterVerification: VerifiedCar[] = [];
  for (const { original, listing: rawListing, status, error } of staged) {
    const listing = { ...rawListing, registrationStatus: registrationStatus(rawListing) };
    const data = analyzeDataConsistency(listing, status === 'VERIFIED' ? original.listing : undefined);
    const risk = analyzeListingRisk(listing, data);
    const distanceKm = listingDistanceKm(settings.origin, listing);
    const estimate = status === 'VERIFIED' ? estimatePrice(listing, finalPool) : { ...original.estimate };
    if (status === 'VERIFIED') {
      if (distanceKm === null) estimate.confidenceScore = Math.round(estimate.confidenceScore * 0.75);
      if (!listing.description.trim()) estimate.confidenceScore = Math.round(estimate.confidenceScore * 0.8);
    }
    estimate.confidenceScore = Math.round(estimate.confidenceScore * data.dataQualityScore / 100
      * (status === 'FAILED' ? 0.5 : status === 'NOT_REQUESTED' ? 0.7 : 1));
    if (data.seriousConflict) estimate.confidenceScore = Math.min(10, estimate.confidenceScore);
    if (data.priceAmbiguity) estimate.confidenceScore = Math.min(20, estimate.confidenceScore);
    const claims = sellerClaims(listing);
    const explanation = explainListing(listing, estimate, risk, data, claims);
    if (status !== 'VERIFIED') explanation.warnings.push(status === 'FAILED' ? `Verificare eșuată: ${error}`
      : verification.stoppedReason ?? `Pagina individuală nu a fost verificată: buget de ${budget} pagini.`);
    if (estimate.matchQuality === 'RELAXED') explanation.warnings.push('Comparabile RELAXED: configurațiile pot fi diferite; estimare cu încredere redusă.');
    if (estimate.marketDataFreshness === 'STALE') explanation.warnings.push('Estimarea pieței folosește date salvate anterior.');
    if (distanceKm === null) explanation.warnings.push('Coordonate lipsă: distanța și raza nu pot fi verificate.');
    const invalidFilters = outsideFilters(listing, distanceKm, settings);
    if (invalidFilters) explanation.warnings.push('Datele actuale nu mai confirmă filtrele locale; necesită verificare.');
    const quality = calculateCarQuality(listing, risk, data, status);
    const classification = invalidFilters ? 'NEEDS_VERIFICATION' : classifyCar(quality.carQualityScore, estimate, risk, data);
    const result: VerifiedCar = { listing, risk, estimate, distanceKm, ...quality, classification, opportunityScore: 0,
      dealScore: Math.min(status === 'VERIFIED' ? 100 : 45, calculateDealScore(listing, estimate, risk, distanceKm, settings, undefined, data)),
      ...data, verificationStatus: status, verificationError: error, preliminary: original,
      flipPotentialScore: Math.min(status === 'VERIFIED' ? 100 : 25, calculateFlipPotential(estimate, risk, data)),
      sellerClaims: claims, ...explanation };
    result.opportunityScore = calculateOpportunity(result.dealScore, result.carQualityScore, result.flipPotentialScore, estimate, risk, classification);
    if (status === 'VERIFIED') {
      if (data.dataConflicts.length) verification.dataConflicts++;
      if (risk.cosmeticRisk > 0) verification.cosmeticWarnings++;
      if (risk.mechanicalRisk > 0 || risk.accidentRisk > 0) verification.mechanicalOrAccidentWarnings++;
      if (risk.legalRisk > 0) verification.legalWarnings++;
    }
    if (data.seriousConflict || data.priceAmbiguity || invalidFilters) needsManualVerification.push(result);
    else if (settings.excludeDamaged && hasSevereVehicleRisk(risk)) excludedAfterVerification.push(result);
    else results.push(result);
  }
  results.sort(compareRanked);
  needsManualVerification.sort(compareRanked);
  excludedAfterVerification.sort(compareRanked);
  return { results, needsManualVerification, excludedAfterVerification, verification };
}
