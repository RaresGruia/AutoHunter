import type { CarListing } from '../models/CarListing.js';
import type { ComparableCriteria } from '../models/ComparableCriteria.js';
import type { SourceAdapter, SourceResult } from '../sources/SourceAdapter.js';
import { identifyCar, identityKey, normalizeCarIdentity } from '../analysis/carIdentity.js';
import { MAX_COMPARABLE_SEARCHES, MARKET_REQUEST_INTERVAL_MS } from '../config/marketSettings.js';
import { accessDenied } from './diskCache.js';

export interface MarketSearchDiagnostic { source: string; group: string; fetched: number; mode: SourceResult['mode']; warnings: string[] }
export interface MarketDiagnostics {
  used: number;
  budget: number;
  cacheHits: number;
  cacheMisses: number;
  staleCacheUsed: number;
  persistentCacheHits: number;
  skippedGroups: string[];
  searches: MarketSearchDiagnostic[];
}
export interface MarketOptions { maxSearches?: number; intervalMs?: number; onProgress?: (message: string) => void }

export class ComparableMarketService {
  private readonly cache = new Map<string, Promise<CarListing[]>>();
  private readonly skipped = new Set<string>();
  private stoppedError: Error | null = null;
  private queue: Promise<void> = Promise.resolve();
  readonly diagnostics: MarketDiagnostics;

  constructor(private readonly adapters: readonly SourceAdapter[], private readonly options: MarketOptions = {}) {
    const budget = options.maxSearches ?? MAX_COMPARABLE_SEARCHES;
    if (!Number.isInteger(budget) || budget < 0 || budget > MAX_COMPARABLE_SEARCHES) throw new Error(`Bugetul de piață trebuie să fie între 0 și ${MAX_COMPARABLE_SEARCHES}.`);
    if (options.intervalMs !== undefined && (!Number.isFinite(options.intervalMs) || options.intervalMs < 0)) throw new Error('Interval de cereri invalid.');
    this.diagnostics = { used: 0, budget, cacheHits: 0, cacheMisses: 0, staleCacheUsed: 0, persistentCacheHits: 0, skippedGroups: [], searches: [] };
  }

  async collect(criteria: ComparableCriteria): Promise<CarListing[]> {
    if (this.stoppedError) throw this.stoppedError;
    const normalized = { ...criteria, ...identifyCar({ title: '', make: criteria.make, model: criteria.model }) };
    const groupKey = identityKey(normalized);
    if (!groupKey || normalized.identityConfidence < 70) return [];
    const pool: CarListing[] = [];
    for (const [index, adapter] of this.adapters.entries()) {
      const key = `${index}:${groupKey}`;
      let response = this.cache.get(key);
      if (response) this.diagnostics.cacheHits++;
      else {
        // Serializarea protejează bugetul și intervalul chiar dacă un consumator cere grupuri în paralel.
        response = this.queue.then(() => this.fetchGroup(adapter, normalized));
        this.queue = response.then(() => undefined, () => undefined);
        this.cache.set(key, response);
      }
      pool.push(...await response);
    }
    return pool;
  }

  private blocked = false;
  get accessBlocked(): boolean { return this.blocked; }
  private async fetchGroup(adapter: SourceAdapter, criteria: ComparableCriteria): Promise<CarListing[]> {
    if (this.stoppedError) throw this.stoppedError;
    const group = `${criteria.make} ${criteria.model}`;
    const cached = await adapter.getCachedComparables?.(criteria, this.blocked || adapter.accessBlocked);
    if (cached) {
      this.diagnostics.cacheHits++;
      this.diagnostics.persistentCacheHits++;
      if (cached.listings.some(car => car.marketDataFreshness === 'STALE')) this.diagnostics.staleCacheUsed++;
      return cached.listings.map(normalizeCarIdentity);
    }
    this.diagnostics.cacheMisses++;
    if (this.blocked || adapter.accessBlocked || this.diagnostics.used >= this.diagnostics.budget) {
      this.skipped.add(`${adapter.name}: ${group}`);
      this.diagnostics.skippedGroups = [...this.skipped];
      return [];
    }
    const requestNumber = ++this.diagnostics.used;
    if (requestNumber > 1) await new Promise(resolve => setTimeout(resolve, this.options.intervalMs ?? MARKET_REQUEST_INTERVAL_MS));
    this.options.onProgress?.(`MARKET ${requestNumber}/${this.diagnostics.budget}: ${group}`);
    try {
      const response = await adapter.searchComparables(criteria);
      if (adapter.accessBlocked) this.blocked = true;
      if (response.listings.some(car => car.marketDataFreshness === 'STALE')) this.diagnostics.staleCacheUsed++;
      this.diagnostics.searches.push({ source: adapter.name, group, fetched: response.listings.length,
        mode: response.mode, warnings: response.warnings });
      this.options.onProgress?.(`${group} -> ${response.listings.length} fetched`);
      return response.listings.map(normalizeCarIdentity);
    } catch (error: unknown) {
      if (accessDenied(error)) {
        this.blocked = true;
        this.options.onProgress?.(`OLX_ACCESS_DENIED: ${group}; fresh requests stopped.`);
        const stale = await adapter.getCachedComparables?.(criteria, true);
        if (stale) { this.diagnostics.staleCacheUsed++; return stale.listings.map(normalizeCarIdentity); }
        return [];
      }
      this.stoppedError = new Error(`Căutarea pieței s-a oprit la ${group} (${requestNumber}/${this.diagnostics.budget} cereri rezervate): ${error instanceof Error ? error.message : String(error)}`);
      throw this.stoppedError;
    }
  }
}
