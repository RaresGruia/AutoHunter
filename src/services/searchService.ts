import type { CarListing } from '../models/CarListing.js';
import type { SearchSettings } from '../models/SearchSettings.js';
import type { SourceAdapter, SourceResult } from '../sources/SourceAdapter.js';
import { validateSettings } from '../config/searchSettings.js';
import { analyzeListingRisk, hasSevereVehicleRisk, type ListingRisk } from '../analysis/listingRisk.js';
import { estimatePrice, hasUsableFullPrice, type PriceEstimate } from '../analysis/priceEstimator.js';
import { listingDistanceKm } from '../analysis/distance.js';
import { calculateDealScore } from '../analysis/dealScore.js';
import { normalizeCarIdentity, identityKey } from '../analysis/carIdentity.js';
import { ComparableMarketService, type MarketDiagnostics, type MarketOptions } from './comparableMarketService.js';
import { MAX_LOCAL_CANDIDATES } from '../config/marketSettings.js';
import { analyzeDataConsistency } from '../analysis/dataConsistency.js';
import { calculateCarQuality, calculateOpportunity, classifyCar } from '../analysis/carQuality.js';
import { calculateFlipPotential } from '../analysis/flipPotential.js';
import { verifyFinalists, compareRanked, type VerifiedCar, type VerificationOptions, type VerificationSummary } from './listingVerificationService.js';

export interface RankedCar {
  opportunityScore?: number;
  listing: CarListing;
  risk: ListingRisk;
  estimate: PriceEstimate;
  distanceKm: number | null;
  dealScore: number;
}
export interface SearchResult {
  requestMetrics?: { localNetworkRequests: number; localCacheHits: number; marketCacheHits: number; marketCacheMisses: number;
    freshMarketRequests: number; detailRequests: number; staleCacheUsed: number; totalOlxRequests: number; withoutCacheEstimatedRequests: number; marketRequestDedupHits: number };
  results: VerifiedCar[];
  needsManualVerification: VerifiedCar[];
  excludedAfterVerification: VerifiedCar[];
  verification: VerificationSummary;
  sources: Omit<SourceResult, 'listings'>[];
  fetchedCount: number;
  excludedHighRisk: number;
  excludedByFilters: number;
  eligibleCount: number;
  analyzedCount: number;
  market: MarketDiagnostics;
}

export async function searchCars(settings: SearchSettings, adapters: readonly SourceAdapter[], options: MarketOptions & { verification?: VerificationOptions } = {}): Promise<SearchResult> {
  validateSettings(settings);
  const batches: SourceResult[] = [];
  const sourceAdapters = new Map<string, SourceAdapter>();
  for (const adapter of adapters) {
    const batch = await adapter.searchLocal(settings);
    batches.push(batch);
    for (const listing of batch.listings) sourceAdapters.set(listing.source, adapter);
  }
  const unique = new Map<string, CarListing>();
  const urls = new Set<string>();
  for (const batch of batches) for (const listing of batch.listings) {
    const key = `${listing.source}:${listing.id}`;
    if (!unique.has(key) && !urls.has(listing.url) && Number.isFinite(listing.priceEur) && listing.priceEur > 0) {
      unique.set(key, normalizeCarIdentity(listing));
      urls.add(listing.url);
    }
  }
  const pool = [...unique.values()];
  let excludedHighRisk = 0;
  let excludedByFilters = 0;
  const eligible: { listing: CarListing; risk: ListingRisk; distanceKm: number | null }[] = [];
  for (const listing of pool) {
    const risk = analyzeListingRisk(listing);
    if (settings.excludeDamaged && hasSevereVehicleRisk(risk)) {
      excludedHighRisk++;
      continue;
    }
    const distanceKm = listingDistanceKm(settings.origin, listing);
    if (!hasUsableFullPrice(listing) || listing.priceEur < settings.minPriceEur || listing.priceEur > settings.maxPriceEur
      || listing.year === null || listing.year < settings.minYear
      || listing.mileageKm === null || listing.mileageKm > settings.maxMileageKm
      || (distanceKm !== null && distanceKm > settings.radiusKm)) {
      excludedByFilters++;
      continue;
    }
    eligible.push({ listing, risk, distanceKm });
  }
  const groupSizes = new Map<string, number>();
  for (const { listing } of eligible) {
    const key = identityKey(listing);
    if (key) groupSizes.set(key, (groupSizes.get(key) ?? 0) + 1);
  }
  // Defectele cosmetice sau importul nu trebuie să împingă un model în afara bugetului de piață.
  eligible.sort((a, b) => Number(hasSevereVehicleRisk(a.risk)) - Number(hasSevereVehicleRisk(b.risk))
    || Number((b.listing.identityConfidence ?? 0) >= 70) - Number((a.listing.identityConfidence ?? 0) >= 70)
    || (groupSizes.get(identityKey(b.listing) ?? '') ?? 0) - (groupSizes.get(identityKey(a.listing) ?? '') ?? 0)
    || (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity)
    || (b.listing.year ?? 0) - (a.listing.year ?? 0)
    || (a.listing.mileageKm ?? Infinity) - (b.listing.mileageKm ?? Infinity)
    || a.listing.id.localeCompare(b.listing.id));
  const represented = new Set<string>();
  const representatives: typeof eligible = [];
  const remaining: typeof eligible = [];
  for (const candidate of eligible) {
    const key = identityKey(candidate.listing) ?? `${candidate.listing.source}:${candidate.listing.id}`;
    if (represented.has(key)) remaining.push(candidate);
    else { represented.add(key); representatives.push(candidate); }
  }
  const candidates = [...representatives, ...remaining].slice(0, MAX_LOCAL_CANDIDATES);
  // Local-only preliminary analysis prioritizes promising cars before spending the fresh market budget.
  const priorities = new Map(candidates.map(({ listing, risk, distanceKm }) => {
    const estimate = estimatePrice(listing, pool), data = analyzeDataConsistency(listing);
    const quality = calculateCarQuality(listing, risk, data, 'NOT_REQUESTED').carQualityScore;
    const deal = calculateDealScore(listing, estimate, risk, distanceKm, settings, undefined, data);
    return [listing, calculateOpportunity(deal, quality, calculateFlipPotential(estimate, risk, data), estimate, risk, classifyCar(quality, estimate, risk, data))];
  }));
  candidates.sort((a, b) => priorities.get(b.listing)! - priorities.get(a.listing)!);
  options.onProgress?.(`LOCAL: ${pool.length} fetched; ${eligible.length} eligible; ${candidates.length} analyzed`);
  const marketOptions = { ...options };
  if (marketOptions.intervalMs === undefined && batches.every(batch => batch.mode === 'fixture')) marketOptions.intervalMs = 0;
  const market = new ComparableMarketService(adapters, marketOptions);
  const results: RankedCar[] = [];
  const collectedPool = [...pool];
  for (const { listing, risk, distanceKm } of candidates) {
    const comparables = (listing.identityConfidence ?? 0) >= 70 ? await market.collect(listing) : [];
    collectedPool.push(...comparables);
    const estimate = estimatePrice(listing, [...pool, ...comparables]);
    // Lipsa localizării reduce încrederea rezultatului, fără a inventa un punct pe hartă.
    if (distanceKm === null) estimate.confidenceScore = Math.round(estimate.confidenceScore * 0.75);
    if (!listing.description.trim()) estimate.confidenceScore = Math.round(estimate.confidenceScore * 0.8);
    results.push({ listing, risk, estimate, distanceKm,
      dealScore: calculateDealScore(listing, estimate, risk, distanceKm, settings) });
  }
  results.sort(compareRanked);
  const verificationOptions: VerificationOptions = { ...options.verification };
  verificationOptions.accessBlocked = market.accessBlocked || adapters.some(adapter => adapter.accessBlocked);
  if (verificationOptions.intervalMs === undefined && batches.every(batch => batch.mode === 'fixture')) verificationOptions.intervalMs = 0;
  if (options.onProgress) verificationOptions.onProgress = options.onProgress;
  const verified = await verifyFinalists(results, collectedPool, settings, async listing => {
    const adapter = sourceAdapters.get(listing.source);
    if (!adapter?.getListingDetails) throw new Error('Sursa nu oferă verificarea paginii individuale.');
    return adapter.getListingDetails(listing);
  }, verificationOptions);
  const sum = (key: 'localNetworkRequests' | 'localCacheHits' | 'freshMarketRequests' | 'detailRequests') => adapters.reduce((total, adapter) => total + (adapter.metrics?.[key] ?? 0), 0);
  const requestMetrics = { localNetworkRequests: sum('localNetworkRequests'), localCacheHits: sum('localCacheHits'),
    marketCacheHits: market.diagnostics.persistentCacheHits, marketCacheMisses: market.diagnostics.cacheMisses,
    marketRequestDedupHits: market.diagnostics.cacheHits - market.diagnostics.persistentCacheHits,
    freshMarketRequests: sum('freshMarketRequests'), detailRequests: sum('detailRequests'),
    staleCacheUsed: market.diagnostics.staleCacheUsed + adapters.reduce((total, adapter) => total + (adapter.metrics?.localStaleCacheHits ?? 0), 0),
    totalOlxRequests: sum('localNetworkRequests') + sum('freshMarketRequests') + sum('detailRequests'),
    withoutCacheEstimatedRequests: 1 + Math.min(12, groupSizes.size) + Math.min(10, candidates.length) };
  options.onProgress?.(`LOCAL NETWORK REQUESTS: ${requestMetrics.localNetworkRequests}\nMARKET CACHE HITS: ${requestMetrics.marketCacheHits}\nMARKET CACHE MISSES: ${requestMetrics.marketCacheMisses}\nFRESH MARKET REQUESTS: ${requestMetrics.freshMarketRequests}/${market.diagnostics.budget}\nDETAIL REQUESTS: ${requestMetrics.detailRequests}/${verified.verification.budget}\nSTALE CACHE USED: ${requestMetrics.staleCacheUsed}\nTOTAL OLX REQUESTS: ${requestMetrics.totalOlxRequests}\nWithout cache estimated requests: ${requestMetrics.withoutCacheEstimatedRequests}\nActual requests: ${requestMetrics.totalOlxRequests}`);
  return { ...verified, requestMetrics, fetchedCount: pool.length, excludedHighRisk, excludedByFilters,
    eligibleCount: eligible.length, analyzedCount: candidates.length, market: market.diagnostics,
    sources: batches.map(({ source, mode, warnings }) => ({ source, mode, warnings })) };
}
