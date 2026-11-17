import type { ListingImages } from '../models/ListingImages.js';
import type { Coordinates } from '../models/SearchSettings.js';
import type { CategorySource } from '../categories/category.js';

export const TOOL_CATEGORIES = ['DRILL','IMPACT_DRIVER','ANGLE_GRINDER','CIRCULAR_SAW','CHAINSAW','DEMOLITION_HAMMER','WELDER','COMPRESSOR','PRESSURE_WASHER','GENERATOR','MOWER','BRUSHCUTTER','OTHER'] as const;
export type ToolCategory = typeof TOOL_CATEGORIES[number];
export const TOOL_CONDITIONS = ['NEW','LIKE_NEW','USED','FOR_PARTS','UNKNOWN'] as const;
export type ToolCondition = typeof TOOL_CONDITIONS[number];
export const POWER_SOURCES = ['BATTERY','CORDED','PETROL','MANUAL','PNEUMATIC','UNKNOWN'] as const;
export type PowerSource = typeof POWER_SOURCES[number];
export interface ToolListing extends ListingImages {
  id: string; source: string; url: string; title: string;
  brand: string | null; model: string | null; identityConfidence: number;
  category: ToolCategory; subcategory: string | null; priceEur: number;
  condition: ToolCondition; powerSource: PowerSource;
  powerWatts: number | null; voltageV: number | null; batteryAh: number | null;
  engineCc: number | null; horsepower: number | null;
  batteriesIncluded: number | null; chargerIncluded: boolean | null;
  accessories: string[]; manufacturingYear: number | null;
  locationText: string; latitude: number | null; longitude: number | null;
  description: string; sellerType: string | null; publishedAt: string | null;
  synthetic: boolean; rawData?: unknown;
}
export interface ToolSearchSettings {
  location: string; radiusKm: number; minPriceEur: number; maxPriceEur: number;
  condition: ToolCondition | 'ALL'; categories: ToolCategory[] | 'ALL';
  excludeBroken: boolean; limit: number; origin?: Coordinates;
}
export interface ToolSourceAdapter extends CategorySource<ToolListing,ToolSearchSettings> {
  readonly category: 'tools'; searchComparables(): Promise<ToolListing[]>;
}
export interface ToolPackage {
  type: 'BODY_ONLY' | 'TOOL_PLUS_BATTERY' | 'KIT' | 'UNKNOWN';
  batteries: number | null; batteryAh: number | null; charger: boolean | null;
  caseIncluded: boolean; completeness: number; conflict: boolean; warnings: string[];
}
export interface ToolRisk {
  mechanicalRisk: number; electricalRisk: number; batteryRisk: number; cosmeticRisk: number;
  authenticityRisk: number; dataRisk: number; overall: number; dataQuality: number; warnings: string[];
}
export type ToolClassification = 'GREAT_DEAL' | 'GOOD_DEAL' | 'INTERESTING' | 'FAIR' | 'POOR_VALUE' | 'NEEDS_VERIFICATION';
export interface ToolEstimate {
  estimatedMarketPrice: number | null; discountPercent: number | null; potentialSavingEur: number | null;
  comparableCount: number; confidence: number; similarityAverage: number | null;
  matchQuality: 'EXACT' | 'GOOD' | 'RELAXED' | 'UNAVAILABLE';
}
export interface ToolResult {
  listing: Omit<ToolListing,'rawData'>; package: ToolPackage; price: ToolEstimate;
  scores: { deal: number; toolQuality: number; flipPotential: number; opportunity: number };
  classification: ToolClassification; risks: ToolRisk; positiveReasons: string[]; qualityReasons: string[]; warnings: string[];
  distanceKm: number | null;
}
export interface ToolSearchResponse {
  meta: { mode: 'DEMO' | 'LIVE'; category: 'tools'; location: string; radiusKm: number; localFetched: number;
    eligible: number; returnedResults: number; limit: number; warnings: string[] };
  results: ToolResult[];
}
