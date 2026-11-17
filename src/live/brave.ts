import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { resolve } from 'node:path';
import { load as html } from 'cheerio';
import type { Category } from '../categories/category.js';
import type { DiscoverySourceAdapter, SourceDescriptor, SourceBatch } from '../discovery/SourceAdapter.js';
import { publicListingUrl } from '../models/ListingUrl.js';
export { publicListingUrl } from '../models/ListingUrl.js';

export interface BraveConfig {
  enabled: boolean;
  key: string;
  count: number;
}
export async function readBraveConfig(): Promise<BraveConfig> {
  let local: Record<string, string | undefined> = {};
  try {
    local = parseEnv(await readFile(resolve('.env'), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw Error('LIVE_CONFIGURATION_ERROR');
  }
  const value = (key: string) => process.env[key] ?? local[key] ?? '';
  const count = Number(value('BRAVE_SEARCH_MAX_RESULTS') || 20);
  return {
    enabled: value('AUTOHUNTER_LIVE_ENABLED') === 'true',
    key: value('BRAVE_SEARCH_API_KEY').trim(),
    count: Number.isInteger(count) ? Math.max(1, Math.min(20, count)) : 20,
  };
}
const domains = {
  cars: ['olx.ro', 'autovit.ro', 'publi24.ro', 'lajumate.ro', 'carzz.ro'],
  tractors: ['olx.ro', 'publi24.ro', 'lajumate.ro', 'agroline.ro', 'agriaffaires.ro', 'mascus.ro'],
  tools: ['olx.ro', 'publi24.ro', 'lajumate.ro', 'machineryline.ro'],
} as const;
export function isListingPage(url: URL, category: Category): boolean {
  if (category === 'equipment') return false;
  const host = url.hostname.replace(/^www\./, '');
  if (!(domains[category] as readonly string[]).includes(host)) return false;
  const path = url.pathname;
  if (host === 'olx.ro') return path.startsWith('/d/oferta/') && /\.html$/i.test(path);
  if (host === 'autovit.ro') return /\/anunt\/.+\.html$/i.test(path);
  if (host === 'publi24.ro') return /\/anunt\/.+\.html$/i.test(path);
  if (host === 'lajumate.ro') return /^\/ad\/.+-\d+\/?$/.test(path) || /[-/]\d+\.html$/.test(path);
  if (host === 'carzz.ro') return /-\d+\.html$/.test(path) || /^\/ad\/.+-\d+\/?$/.test(path);
  if (host === 'agroline.ro' || host === 'machineryline.ro') return /\/[-]\/vanzare\/.+--\w+/i.test(path);
  if (host === 'agriaffaires.ro') return /^\/(?:second-hand|nou)\/[^/]+\/\d{6,}\/[^/]+\.html$/i.test(path);
  if (host === 'mascus.ro') return /^\/[^/]+\/[^/]+\/[^/]+\/[a-z0-9]{8}\.html$/i.test(path);
  return false;
}
export class BraveSearchAdapter implements DiscoverySourceAdapter {
  readonly descriptor: SourceDescriptor;
  private blockedUntil = 0;
  private busy = false;
  constructor(
    private readonly config: BraveConfig,
    private readonly transport: typeof fetch = fetch,
    private readonly now = Date.now,
  ) {
    this.descriptor = {
      id: 'brave-search',
      name: 'Brave Search — index web',
      kind: 'AUTHORIZED_API',
      status: config.enabled && config.key ? 'AVAILABLE' : 'APPROVAL_REQUIRED',
      categories: ['cars', 'tractors', 'tools'],
      transport: 'NETWORK',
      configured: !!config.key,
      permission: {
        dataUse: config.enabled,
        imageDisplay: false,
        reference: 'https://api-dashboard.search.brave.com/documentation/resources/terms-of-service',
      },
      note: 'Linkuri indexate, nu confirmări ale disponibilității. Fără acces automat la paginile sau fotografiile platformelor.',
    };
  }
  async load(category: Category, context?: { query: string }): Promise<SourceBatch> {
    if (!this.config.enabled || !this.config.key) throw Error('BRAVE_NOT_CONFIGURED');
    if (category === 'equipment' || !context?.query.trim()) throw Error('INVALID_LIVE_QUERY');
    if (this.busy || this.now() < this.blockedUntil) throw Error('BRAVE_RATE_LIMITED');
    this.busy = true;
    this.blockedUntil = this.now() + 1100;
    try {
      // Do not force a generic category word into an exact model query: valid ads may omit it.
      const q = `${context.query.trim()} (${domains[category].map((domain) => 'site:' + domain).join(' OR ')})`;
      const url = new URL('https://api.search.brave.com/res/v1/web/search');
      // RO is not in Brave's country enum. Target Romania through language, query and domains.
      for (const [key, value] of Object.entries({
        q,
        country: 'ALL',
        search_lang: 'ro',
        count: String(this.config.count),
        safesearch: 'moderate',
      }))
        url.searchParams.set(key, value);
      const response = await this.transport(url, {
        headers: { Accept: 'application/json', 'X-Subscription-Token': this.config.key },
        redirect: 'error',
        signal: AbortSignal.timeout(12000),
      });
      if (response.status === 429) {
        const retry = response.headers.get('retry-after');
        const seconds = Number(retry);
        const until =
          Number.isFinite(seconds) && seconds > 0 ? this.now() + seconds * 1000 : Date.parse(retry ?? '');
        this.blockedUntil = Math.max(this.now() + 60000, Number.isFinite(until) ? until : 0);
        throw Error('BRAVE_RATE_LIMITED');
      }
      if (response.status === 401 || response.status === 403) throw Error('BRAVE_AUTH_FAILED');
      if (response.status === 422) throw Error('BRAVE_INVALID_PARAMETERS');
      if (!response.ok) throw Error('BRAVE_UNAVAILABLE');
      const body = await response.text();
      if (Buffer.byteLength(body) > 2 * 1024 * 1024) throw Error('BRAVE_RESPONSE_TOO_LARGE');
      const data: unknown = JSON.parse(body);
      const rows = (data as { web?: { results?: unknown[] } })?.web?.results;
      if (!Array.isArray(rows)) throw Error('BRAVE_INVALID_RESPONSE');
      const fetchedAt = new Date(this.now()).toISOString();
      const hits = rows.slice(0, this.config.count).flatMap((row) => {
        if (!row || typeof row !== 'object') return [];
        const r = row as Record<string, unknown>;
        if (typeof r.url !== 'string' || typeof r.title !== 'string') return [];
        const originalUrl = publicListingUrl(r.url);
        if (!originalUrl || !isListingPage(new URL(originalUrl), category)) return [];
        return [
          {
            id: 'brave:' + createHash('sha256').update(originalUrl).digest('hex').slice(0, 24),
            category,
            title: html(r.title).text().slice(0, 250),
            originalUrl,
            publisher: new URL(originalUrl).hostname,
            snippet: typeof r.description === 'string' ? html(r.description).text().slice(0, 700) : '',
            discoveredAt: fetchedAt,
          },
        ];
      });
      return { listings: [], comparables: [], hits, fetchedAt };
    } catch (error) {
      if (error instanceof Error && /^BRAVE_/.test(error.message)) throw error;
      if (error instanceof Error && (error.cause as { code?: string } | undefined)?.code === 'EACCES')
        throw Error('BRAVE_NETWORK_BLOCKED');
      throw Error('BRAVE_UNAVAILABLE');
    } finally {
      this.busy = false;
    }
  }
}
