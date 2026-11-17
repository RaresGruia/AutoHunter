import type { ListingImages } from '../models/ListingImages.js';
import type { Coordinates } from '../models/SearchSettings.js';
import type { CategorySource } from '../categories/category.js';

export interface TractorListing extends ListingImages {
  id: string; source: string; url: string; title: string;
  make: string | null; model: string | null; identityConfidence: number;
  year: number | null; priceEur: number; horsepower: number | null; engine: string | null; fuel: string | null;
  drivetrain: '4X4' | '4X2' | 'UNKNOWN'; operatingHours: number | null;
  transmission: string | null; cabin: string | null; frontLoader: boolean | null;
  registrationStatus: string | null; documents: string | null;
  locationText: string; latitude: number | null; longitude: number | null;
  description: string; sellerType: string | null; publishedAt: string | null;
  rawData?: unknown;
}
export interface TractorSearchSettings {
  location: string; radiusKm: number; minPriceEur: number; maxPriceEur: number;
  minYear: number | null; minHorsepower: number | null; maxOperatingHours: number | null;
  require4x4: boolean; excludeBroken: boolean; limit: number; origin?: Coordinates;
}
export interface TractorSourceAdapter extends CategorySource<TractorListing, TractorSearchSettings> {
  readonly category: 'tractors';
  searchComparables(): Promise<TractorListing[]>;
}
export interface TractorRisk {
  mechanical: number; hydraulic: number; transmission: number; cosmetic: number; legal: number; data: number;
  overall: number; dataQuality: number; seriousConflict: boolean; warnings: string[];
}
export interface TractorEstimate {
  estimatedMarketEur: number | null; discountPercent: number | null; potentialSavingEur: number | null;
  comparableCount: number; confidence: number; similarityAverage: number | null;
}
export type TractorClassification = 'GREAT_DEAL' | 'GOOD_DEAL' | 'INTERESTING' | 'FAIR' | 'POOR_VALUE' | 'NEEDS_VERIFICATION';
export interface TractorResult {
  listing: Omit<TractorListing, 'rawData'>; price: TractorEstimate;
  scores: { deal: number; tractorQuality: number; flipPotential: number; opportunity: number };
  classification: TractorClassification; risks: TractorRisk;
  positiveReasons: string[]; qualityReasons: string[]; warnings: string[]; distanceKm: number | null;
}
export interface TractorSearchResponse {
  meta: { mode: 'LIVE' | 'DEMO'; category: 'tractors'; location: string; radiusKm: number;
    localFetched: number; eligible: number; returnedResults: number; limit: number; warnings: string[] };
  results: TractorResult[];
}
