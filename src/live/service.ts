import type { DiscoverySourceAdapter, DiscoveryHit } from '../discovery/SourceAdapter.js';
import { SourceRegistry, sourceBlockReason } from '../discovery/registry.js';
import { canonicalListingUrl } from '../discovery/normalize.js';
import { BraveSearchAdapter, readBraveConfig, type BraveConfig } from './brave.js';
import { ManualOfferStore, validateManual } from './manual.js';
import { manualLiveOffer, analyzeLiveOffers, insufficient } from './analyze.js';
import type { LiveCategory, LiveOffer, LiveResponse } from './types.js';
import { AvailabilityReports } from './availability.js';
import { indexFacts } from './indexFacts.js';

export class LiveService {
  private adapter: DiscoverySourceAdapter | undefined;
  private identity = '';
  private cache = new Map<string, { until: number; hits: DiscoveryHit[] }>();
  private readonly store: ManualOfferStore;
  private readonly reports: AvailabilityReports;
  constructor(
    private readonly options: {
      config?: () => Promise<BraveConfig>;
      adapter?: DiscoverySourceAdapter;
      store?: ManualOfferStore;
      now?: () => number;
      reports?: AvailabilityReports;
    } = {},
  ) {
    this.store = options.store ?? new ManualOfferStore();
    this.reports = options.reports ?? new AvailabilityReports();
  }
  private time() {
    return (this.options.now ?? Date.now)();
  }
  private async source() {
    const config = await (this.options.config ?? readBraveConfig)();
    const identity = JSON.stringify(config);
    if (identity !== this.identity) {
      this.cache.clear();
      this.adapter = this.options.adapter ?? new BraveSearchAdapter(config);
      this.identity = identity;
    }
    const registry = new SourceRegistry();
    registry.register(this.adapter!.descriptor, this.adapter);
    return { config, registry, adapter: this.adapter! };
  }
  async status() {
    const { config, registry } = await this.source();
    return {
      mode: 'LIVE',
      configured: config.enabled && !!config.key,
      enabled: config.enabled,
      keyConfigured: !!config.key,
      sources: registry.list(),
      storage: 'TRANSIENT',
      maxResults: config.count,
      message:
        config.enabled && config.key
          ? 'Brave configurat; disponibilitatea anunțurilor necesită verificare.'
          : 'Completează BRAVE_SEARCH_API_KEY în .env și AUTOHUNTER_LIVE_ENABLED=true.',
      manualImport: true,
    };
  }
  async import(value: unknown) {
    const row = validateManual(value, new Date(this.time()).toISOString());
    await this.store.save(row);
    return manualLiveOffer(row, this.time());
  }
  async reportAvailability(value: unknown) {
    return this.reports.save(value, new Date(this.time()).toISOString());
  }
  async search(category: LiveCategory, query: string, includeUnavailable = false): Promise<LiveResponse> {
    const searchedAt = new Date(this.time()).toISOString(),
      warnings: string[] = [],
      { config, adapter } = await this.source();
    const blocked = sourceBlockReason(adapter.descriptor, config.enabled);
    let hits: DiscoveryHit[] = [],
      searchStatus = blocked ?? 'OK';
    if (blocked)
      warnings.push(
        'Căutarea web necesită configurarea cheii Brave Search. Importul manual rămâne disponibil.',
      );
    else {
      const key = category + ':' + query.trim().toLowerCase(),
        cached = this.cache.get(key);
      if (cached && cached.until > this.time()) {
        hits = cached.hits;
        searchStatus = 'CACHED';
      } else {
        try {
          const batch = await adapter.load(category, { query });
          hits = batch.hits ?? [];
          if (this.cache.size >= 20) this.cache.delete(this.cache.keys().next().value!);
          const entry = { until: this.time() + 300000, hits };
          this.cache.set(key, entry);
          const timer = setTimeout(() => {
            if (this.cache.get(key) === entry) this.cache.delete(key);
          }, 300000);
          timer.unref();
        } catch (error) {
          searchStatus =
            error instanceof Error && /^BRAVE_/.test(error.message) ? error.message : 'BRAVE_UNAVAILABLE';
          warnings.push(
            'Sursa de căutare nu este disponibilă: ' + searchStatus + '. Nu s-au folosit rezultate DEMO.',
          );
        }
      }
    }
    const manual = (await this.store.list())
      .filter((row) => row.category === category)
      .map((row) => manualLiveOffer(row, this.time()));
    const text = query.toLowerCase().split(/\s+/).filter(Boolean);
    const matching = manual.filter((row) =>
      text.every((term) => `${row.title} ${row.make ?? ''} ${row.model ?? ''}`.toLowerCase().includes(term)),
    );
    const byUrl = new Map<string, LiveOffer>();
    for (const hit of hits) {
      if (hit.category !== category) continue;
      const url = canonicalListingUrl(hit.originalUrl);
      if (!url) continue;
      byUrl.set(url, {
        ...hit,
        indexFacts: indexFacts(hit),
        origin: 'WEB_INDEX',
        availability: 'UNVERIFIED',
        lastVerifiedAt: null,
        priceEur: null,
        make: null,
        model: null,
        attributes: {},
        imageUrls: [],
        imageRights: { status: 'UNKNOWN', evidence: null },
        normalized: null,
        analysis: insufficient(
          'Rezultat din indexul web; prețul, caracteristicile și disponibilitatea nu au fost verificate.',
        ),
      });
    }
    // A manually checked copy takes precedence over the same indexed URL, without inventing verification.
    for (const row of matching) {
      const key = canonicalListingUrl(row.originalUrl);
      if (key) byUrl.set(key, row);
    }
    const reports = new Map((await this.reports.list()).map((row) => [row.originalUrl, row]));
    const annotated = [...byUrl.values()].map((row) => {
      const report = reports.get(canonicalListingUrl(row.originalUrl)!);
      return report && report.status !== 'UNVERIFIED'
        ? { ...row, availability: report.status, availabilityReport: report }
        : row;
    });
    const excludedUnavailable = annotated.filter((row) =>
      ['EXPIRED', 'UNAVAILABLE'].includes(row.availability),
    ).length;
    const results = analyzeLiveOffers(
      annotated.filter((row) => includeUnavailable || !['EXPIRED', 'UNAVAILABLE'].includes(row.availability)),
    );
    return {
      meta: {
        mode: 'LIVE',
        category,
        query,
        searchedAt,
        discovered: results.length,
        scored: results.filter((row) => row.analysis.status === 'SCORED').length,
        sources: [
          ...(hits.length ? ['Brave Search'] : []),
          ...(matching.length ? ['Import manual autorizat'] : []),
        ],
        warnings,
        searchStatus,
        storage: 'TRANSIENT',
        excludedUnavailable,
      },
      results,
    };
  }
}
