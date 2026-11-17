import { attachDemoImages, readDemoImageManifest } from '../../services/demoImages.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { SearchSettings } from '../../models/SearchSettings.js';
import type { ComparableCriteria } from '../../models/ComparableCriteria.js';
import { identityKey } from '../../analysis/carIdentity.js';
import type { SourceAdapter, SourceResult } from '../SourceAdapter.js';
import { normalizeText } from '../../analysis/text.js';
import { parseOlxHtml } from './olxParser.js';
import { loadPublicOlxPage, type PageLoader } from './olxPageLoader.js';
import type { CarListing } from '../../models/CarListing.js';
import { parseOlxDetailHtml } from './olxDetailParser.js';
import { runtimeMode } from '../../config/runtimeMode.js';
import { DiskCache, LOCAL_TTL_MS, MARKET_TTL_MS, accessDenied, type CacheEntry } from '../../services/diskCache.js';

const inFlight = new Map<string, Promise<SourceResult>>();

export function buildOlxSearchUrl(settings: SearchSettings): URL {
  const slug = normalizeText(settings.location).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (!slug) throw new Error('Localitatea nu poate fi transformată într-un URL OLX.');
  const url = new URL(`https://www.olx.ro/auto-masini-moto-ambarcatiuni/autoturisme/${slug}/`);
  url.searchParams.set('search[dist]', String(settings.radiusKm));
  url.searchParams.set('currency', 'EUR');
  // Bugetul se aplică după estimare, pentru a păstra comparabilele mai scumpe.
  return url;
}

export function buildOlxComparableUrl(criteria: ComparableCriteria): URL {
  if (!criteria.make || !criteria.model) throw new Error('Căutarea de piață necesită marcă și model.');
  const query = normalizeText(`${criteria.make} ${criteria.model}`).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const url = new URL(`https://www.olx.ro/auto-masini-moto-ambarcatiuni/autoturisme/q-${query}/`);
  url.searchParams.set('currency', 'EUR');
  return url;
}

export class OlxSourceAdapter implements SourceAdapter {
  readonly name = 'olx';
  accessBlocked = false;
  readonly metrics = { localNetworkRequests: 0, localCacheHits: 0, localStaleCacheHits: 0, freshMarketRequests: 0, detailRequests: 0 };
  private readonly disk: DiskCache | null;
  constructor(private readonly options: {
    mode?: 'live' | 'fixture';
    pageLoader?: PageLoader;
    fixturePath?: string | URL;
    demoImageManifestPath?: string;
    detailFixtureDirectory?: string;
    cacheDirectory?: string | false;
    now?: () => number;
  } = {}) {
    if (runtimeMode() === 'DEMO') this.options = { ...options, mode: 'fixture' };
    this.disk = this.options.mode === 'fixture' || options.cacheDirectory === false || (options.pageLoader && !options.cacheDirectory)
      ? null : new DiskCache(options.cacheDirectory || resolve('data/cache'), options.now);
  }

  private marketKey(criteria: ComparableCriteria): string { return `market:v2:olx:${identityKey(criteria)}`; }
  private fromCache(entry: CacheEntry, freshness: 'FRESH' | 'CACHED' | 'STALE', market: boolean): SourceResult {
    return { source: 'olx', mode: 'live', warnings: freshness === 'STALE'
      ? [`OLX_ACCESS_DENIED: ${market ? 'piață' : 'căutare locală'} din cache expirat (${entry.fetchedAt}).`]
      : freshness === 'CACHED' ? [`Date OLX din cache (${entry.fetchedAt}).`] : [],
      listings: entry.listings.map(car => ({ ...car, marketDataFreshness: freshness, marketFetchedAt: entry.fetchedAt })) };
  }
  async getCachedComparables(criteria: ComparableCriteria, allowStale = false): Promise<SourceResult | null> {
    if (!this.disk) return null;
    const entry = await this.disk.read(this.marketKey(criteria));
    if (!entry || (!allowStale && !this.disk.fresh(entry, MARKET_TTL_MS))) return null;
    return this.fromCache(entry, this.disk.fresh(entry, MARKET_TTL_MS) ? 'CACHED' : 'STALE', true);
  }
  private async network(url: URL, kind: 'localNetworkRequests' | 'freshMarketRequests' | 'detailRequests'): Promise<string> {
    if (this.accessBlocked) throw new Error('OLX_ACCESS_DENIED: fresh requests stopped for this run (403/429/protection).');
    this.metrics[kind]++;
    try { return await (this.options.pageLoader ?? loadPublicOlxPage)(url); }
    catch (error) {
      if (accessDenied(error)) { this.accessBlocked = true; throw new Error(`OLX_ACCESS_DENIED: ${String(error)}`); }
      throw error;
    }
  }
  private async cachedPage(key: string, url: URL, market: boolean): Promise<SourceResult> {
    const entry = await this.disk?.read(key);
    if (entry && this.disk!.fresh(entry, market ? MARKET_TTL_MS : LOCAL_TTL_MS)) {
      if (!market) this.metrics.localCacheHits++;
      return this.fromCache(entry, 'CACHED', market);
    }
    const sharedKey = this.disk ? `${resolve(this.disk.directory)}:${key}` : null;
    const pending = sharedKey ? inFlight.get(sharedKey) : undefined;
    if (pending) {
      try {
        const result = structuredClone(await pending);
        if (result.warnings.some(warning => warning.includes('OLX_ACCESS_DENIED'))) this.accessBlocked = true;
        return result;
      }
      catch (error) { if (accessDenied(error)) this.accessBlocked = true; throw error; }
    }
    const work = async (): Promise<SourceResult> => {
      try {
        const result = await this.readPage(url, market);
        if (this.disk) {
          const saved = await this.disk.write(key, result.listings);
          result.listings = this.fromCache(saved, 'FRESH', market).listings;
        }
        return result;
      } catch (error) {
        if (accessDenied(error)) {
          this.accessBlocked = true;
          if (entry) {
            if (!market) { this.metrics.localCacheHits++; this.metrics.localStaleCacheHits++; }
            return this.fromCache(entry, 'STALE', market);
          }
        }
        throw error;
      }
    };
    const response = work();
    if (sharedKey) inFlight.set(sharedKey, response);
    try { return await response; } finally { if (sharedKey) inFlight.delete(sharedKey); }
  }

  async search(settings: SearchSettings): Promise<SourceResult> {
    return this.searchLocal(settings);
  }

  async searchLocal(settings: SearchSettings): Promise<SourceResult> {
    const key = `local:v2:${JSON.stringify([normalizeText(settings.location), settings.origin, settings.radiusKm,
      settings.minPriceEur, settings.maxPriceEur, settings.minYear, settings.maxMileageKm, settings.excludeDamaged])}`;
    return this.cachedPage(key, buildOlxSearchUrl(settings), false);
  }

  async searchComparables(criteria: ComparableCriteria): Promise<SourceResult> {
    const result = await this.cachedPage(this.marketKey(criteria), buildOlxComparableUrl(criteria), true);
    if (result.mode === 'fixture') result.listings = result.listings.filter(listing => identityKey(listing) === identityKey(criteria));
    return result;
  }

  async getListingDetails(listing: CarListing): Promise<CarListing> {
    const fixture = this.options.mode === 'fixture';
    if (fixture) {
      if (!/^[a-z0-9_-]+$/i.test(listing.id)) throw new Error('ID fixture invalid.');
      const html = await readFile(resolve(this.options.detailFixtureDirectory ?? 'fixtures/details', `${listing.id}.html`), 'utf8');
      return attachDemoImages(parseOlxDetailHtml(html, listing, { fixture: true }), 'cars', await readDemoImageManifest(this.options.demoImageManifestPath));
    }
    const url = new URL(listing.url);
    if (url.protocol !== 'https:' || !['olx.ro', 'www.olx.ro'].includes(url.hostname)
      || !url.pathname.startsWith('/d/oferta/') || url.username || url.password || url.port) throw new Error('URL de detalii OLX invalid.');
    const html = await this.network(url, 'detailRequests');
    try { return parseOlxDetailHtml(html, listing); }
    catch (error) { if (accessDenied(error)) this.accessBlocked = true; throw error; }
  }

  private async readPage(url: URL, market = false): Promise<SourceResult> {
    const mode = this.options.mode ?? 'live';
    const html = mode === 'fixture'
      ? await readFile(this.options.fixturePath ?? resolve('fixtures/olx-search.html'), 'utf8')
      : await this.network(url, market ? 'freshMarketRequests' : 'localNetworkRequests');
    const parsed = parseOlxHtml(html, { fixture: mode === 'fixture' });
    const images = mode === 'fixture' ? await readDemoImageManifest(this.options.demoImageManifestPath) : {};
    return { source: this.name, mode, listings: mode === 'fixture' ? parsed.listings.map(car => attachDemoImages(car, 'cars', images)) : parsed.listings, warnings: [
      ...(mode === 'fixture' ? ['DEMO: toate anunțurile și coordonatele din fixture sunt sintetice.'] : [
        'LIVE: o pagină per căutare, eșantion incomplet; estimările folosesc prețuri cerute, nu tranzacții.',
        'Coordonatele OLX pot fi aproximative. Distanța este în linie dreaptă.',
      ]), ...parsed.warnings,
    ] };
  }
}
