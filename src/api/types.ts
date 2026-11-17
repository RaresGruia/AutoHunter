import type { Coordinates, SearchSettings } from '../models/SearchSettings.js';
import type { SearchResult } from '../services/searchService.js';
import type { VerificationStatus } from '../services/listingVerificationService.js';

export interface CarSearchRequest {
  location: string;
  radiusKm: number;
  minPriceEur: number;
  maxPriceEur: number;
  minYear: number;
  maxMileageKm: number;
  excludeDamaged: boolean;
  limit: number;
  /** Required for locations other than the configured default; no implicit geocoding. */
  origin?: Coordinates;
}

export type SearchEngine = (settings: SearchSettings) => Promise<SearchResult>;

export interface ApiCar extends Pick<import('../models/ListingImages.js').ListingImages, 'imagePresentation' | 'imageAttributions'> {
  id: string;
  title: string;
  car: {
    make: string | null; model: string | null; year: number | null;
    mileageKm: number | null; fuel: string | null; transmission: string | null;
    engine: string | null; drivetrain: string | null;
    engineCapacityCc: number | null; horsepower: number | null; bodyType: string | null;
  };
  price: {
    askingEur: number; estimatedMarketEur: number | null; discountPercent: number | null;
    potentialSavingEur: number | null; comparableCount: number; confidence: number;
  };
  scores: { deal: number; flipPotential: number; overallRisk: number; carQuality: number; opportunity: number };
  classification: import('../analysis/carQuality.js').Classification;
  qualityReasons: string[];
  marketData: { freshness: string; fetchedAt: string | null; matchQuality: string; comparableSimilarityAverage: number | null };
  risks: { mechanical: number; accident: number; cosmetic: number; legal: number; price: number; data: number };
  positiveReasons: string[];
  warnings: string[];
  sellerClaims: string[];
  sellerType: string | null;
  registrationStatus: string | null;
  location: { text: string | null; distanceKm: number | null };
  verification: {
    status: VerificationStatus; dataQualityScore: number;
    dataConflicts: string[]; dataWarnings: string[]; seriousConflict: boolean; priceAmbiguity: boolean;
  };
  imageUrl: string | null;
  imageUrls: string[];
  thumbnailUrl: string | null;
  url: string;
}

export interface CarSearchResponse {
  meta: {
    mode: 'LIVE' | 'DEMO';
    requestMetrics?: SearchResult['requestMetrics'];
    source: 'OLX'; location: string; radiusKm: number; searchedAt: string; durationMs: number;
    localFetched: number; eligible: number; analyzed: number; verified: number;
    verificationFailed: number; notRequested: number; detailRequests: number;
    dataConflicts: number; cosmeticWarnings: number; mechanicalOrAccidentWarnings: number; legalWarnings: number;
    totalResults: number; returnedResults: number; limit: number;
    warnings: string[];
  };
  results: ApiCar[];
  needsManualVerification: ApiCar[];
  excludedAfterVerification: ApiCar[];
}

export interface ApiError { error: { code: string; message: string } }

export type SearchJobStatus = 'RUNNING' | 'COMPLETED' | 'FAILED';
export interface SearchJob {
  id: string;
  status: SearchJobStatus;
  startedAt: string;
  completedAt: string | null;
  request: CarSearchRequest;
  result: CarSearchResponse | null;
  error: ApiError['error'] | null;
}
export type SearchJobResponse =
  | { searchId: string; status: 'RUNNING'; startedAt: string }
  | { searchId: string; status: 'COMPLETED'; startedAt: string; completedAt: string; response: CarSearchResponse }
  | { searchId: string; status: 'FAILED'; startedAt: string; completedAt: string; error: ApiError['error'] };
