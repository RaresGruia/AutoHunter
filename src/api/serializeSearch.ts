import { normalizeListingImages } from '../models/ListingImages.js';
import type { VerifiedCar } from '../services/listingVerificationService.js';
import type { SearchResult } from '../services/searchService.js';
import type { ApiCar, CarSearchRequest, CarSearchResponse } from './types.js';

// Explicit projection: never serialize rawData, HTML, preliminary objects or parser internals.
export function serializeCar(row: VerifiedCar): ApiCar {
  const { listing: car, estimate, risk } = row;
  return {
    id: car.id, title: car.title,
    car: { make: car.make, model: car.model, year: car.year, mileageKm: car.mileageKm,
      fuel: car.fuel, transmission: car.transmission, engine: car.engine, drivetrain: car.drivetrain ?? null,
      engineCapacityCc: car.engineCapacityCc ?? null, horsepower: car.horsepower ?? null, bodyType: car.bodyType ?? null },
    price: { askingEur: car.priceEur, estimatedMarketEur: estimate.estimatedMarketPrice,
      discountPercent: estimate.discountPercent, potentialSavingEur: estimate.absoluteSavingEur,
      comparableCount: estimate.comparableCount, confidence: estimate.confidenceScore },
    scores: { deal: row.dealScore, flipPotential: row.flipPotentialScore, overallRisk: risk.overallRisk, carQuality: row.carQualityScore, opportunity: row.opportunityScore },
    classification: row.classification, qualityReasons: row.qualityReasons,
    marketData: { freshness: estimate.marketDataFreshness ?? 'UNAVAILABLE', fetchedAt: estimate.marketFetchedAt ?? null,
      matchQuality: estimate.matchQuality ?? 'UNAVAILABLE', comparableSimilarityAverage: estimate.comparableSimilarityAverage ?? null },
    risks: { mechanical: risk.mechanicalRisk, accident: risk.accidentRisk, cosmetic: risk.cosmeticRisk,
      legal: risk.legalRisk, price: risk.priceRisk, data: risk.dataRisk },
    positiveReasons: row.positiveReasons, warnings: row.warnings, sellerClaims: row.sellerClaims,
    sellerType: car.sellerType ?? null,
    registrationStatus: car.registrationStatus === 'UNKNOWN' ? null : car.registrationStatus ?? null,
    location: { text: car.locationText || null, distanceKm: row.distanceKm },
    verification: { status: row.verificationStatus, dataQualityScore: row.dataQualityScore,
      dataConflicts: row.dataConflicts, dataWarnings: row.dataWarnings,
      seriousConflict: row.seriousConflict, priceAmbiguity: row.priceAmbiguity },
    ...normalizeListingImages(car), url: car.url,
  };
}

export function serializeSearch(search: SearchResult, request: CarSearchRequest, searchedAt: string, durationMs: number): CarSearchResponse {
  const results = search.results.slice(0, request.limit).map(serializeCar);
  const v = search.verification;
  return {
    meta: { mode: search.sources.every(source => source.mode === 'fixture') ? 'DEMO' : 'LIVE', source: 'OLX', location: request.location, radiusKm: request.radiusKm, searchedAt, durationMs,
      localFetched: search.fetchedCount, eligible: search.eligibleCount, analyzed: search.analyzedCount,
      verified: v.succeeded, verificationFailed: v.failed, notRequested: v.notRequested, detailRequests: v.requested,
      dataConflicts: v.dataConflicts, cosmeticWarnings: v.cosmeticWarnings,
      mechanicalOrAccidentWarnings: v.mechanicalOrAccidentWarnings, legalWarnings: v.legalWarnings,
      totalResults: search.results.length, returnedResults: results.length, limit: request.limit,
      ...(search.requestMetrics ? { requestMetrics: search.requestMetrics } : {}),
      warnings: [...new Set([...search.sources.flatMap(source => source.warnings), ...(v.stoppedReason ? [v.stoppedReason] : [])])] },
    results,
    needsManualVerification: search.needsManualVerification.map(serializeCar),
    excludedAfterVerification: search.excludedAfterVerification.map(serializeCar),
  };
}
