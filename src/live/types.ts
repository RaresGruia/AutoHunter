import type { CommonListing, DiscoveryHit, ListingInput } from '../discovery/SourceAdapter.js';
import type { IndexFacts } from './indexFacts.js';
import type { AvailabilityReport } from './availability.js';
import type { ImageAttribution } from '../models/ListingImages.js';
export type LiveCategory = 'cars' | 'tractors' | 'tools';
export interface ManualOffer {
  id: string;
  category: LiveCategory;
  originalUrl: string;
  title: string;
  priceEur: number | null;
  make: string | null;
  model: string | null;
  attributes: NonNullable<ListingInput['attributes']>;
  imageUrls: string[];
  imageRights: ListingInput['imageRights'];
  permissionEvidence: string;
  imageAttributions?: ImageAttribution[];
  importedAt: string;
  lastVerifiedAt: string | null;
  availability: 'UNVERIFIED' | 'USER_CONFIRMED' | 'EXPIRED';
}
export interface LiveAnalysis {
  status: 'INSUFFICIENT_DATA' | 'SCORED';
  dealScore: number | null;
  flipPotential?: number | null;
  overallRisk?: number | null;
  estimatedMarketEur: number | null;
  savingEur: number | null;
  discountPercent: number | null;
  confidence: number | null;
  comparableCount: number;
  reasons: string[];
  risks: string[];
  comparableUrls: string[];
}
export interface LiveOffer extends DiscoveryHit {
  origin: 'WEB_INDEX' | 'MANUAL';
  availability: 'ACTIVE_VERIFIED' | 'UNVERIFIED' | 'USER_CONFIRMED' | 'STALE' | 'EXPIRED' | 'UNAVAILABLE';
  indexFacts?: IndexFacts;
  availabilityReport?: AvailabilityReport;
  photoProvenance?: {
    imageUrl: string;
    listingId: string;
    originalUrl: string;
    method: 'MANUAL_PERMISSION';
    evidence: string;
  }[];
  lastVerifiedAt: string | null;
  priceEur: number | null;
  make: string | null;
  model: string | null;
  attributes: NonNullable<ListingInput['attributes']>;
  imageUrls: string[];
  imageRights: ListingInput['imageRights'];
  imagePresentation?: 'ACTUAL_ITEM' | 'REPRESENTATIVE_MODEL';
  imageAttributions?: ImageAttribution[];
  normalized: CommonListing | null;
  analysis: LiveAnalysis;
}
export interface LiveResponse {
  meta: {
    mode: 'LIVE';
    category: LiveCategory;
    query: string;
    searchedAt: string;
    discovered: number;
    scored: number;
    sources: string[];
    warnings: string[];
    searchStatus: string;
    storage: 'TRANSIENT';
    excludedUnavailable?: number;
  };
  results: LiveOffer[];
}
