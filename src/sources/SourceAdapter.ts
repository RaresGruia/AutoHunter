import type { CarListing } from '../models/CarListing.js';
import type { SearchSettings } from '../models/SearchSettings.js';
import type { ComparableCriteria } from '../models/ComparableCriteria.js';

export interface SourceResult {
  source: string;
  mode: 'live' | 'fixture';
  listings: CarListing[];
  warnings: string[];
}

export interface SourceAdapter {
  readonly name: string;
  readonly accessBlocked?: boolean;
  readonly metrics?: { localNetworkRequests: number; localCacheHits: number; localStaleCacheHits?: number; freshMarketRequests: number; detailRequests: number };
  getCachedComparables?(criteria: ComparableCriteria, allowStale?: boolean): Promise<SourceResult | null>;
  searchLocal(settings: SearchSettings): Promise<SourceResult>;
  searchComparables(criteria: ComparableCriteria): Promise<SourceResult>;
  getListingDetails?(listing: CarListing): Promise<CarListing>;
}
