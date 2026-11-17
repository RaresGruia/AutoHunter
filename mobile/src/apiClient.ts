import type { CarSearchRequest, CarSearchResponse, CarSearchResult, SearchJobResponse, CategoryJobResponse } from './types';
import { imageMetadata } from '../../src/models/ListingImages';
import {apiBaseUrl,browserLoopbackAllowed} from './apiBaseUrl';

export class ApiClientError extends Error {
  constructor(public readonly code: string, public readonly searchId?: string) { super(code); this.name = 'ApiClientError'; }
}
export function apiErrorMessage(error: unknown): { title: string; detail: string } {
  const code = error instanceof ApiClientError ? error.code : 'NETWORK';
  if (code === 'CATEGORY_NOT_AVAILABLE_IN_LIVE_MODE') return { title: 'Această categorie este disponibilă numai în DEMO.', detail: 'Pornește backend-ul cu AUTOHUNTER_MODE=demo.' };
  if (code === 'TIMEOUT') return { title: 'Conexiunea cu AutoHunter a durat prea mult.', detail: 'Căutarea poate continua pe PC. Reconectează-te pentru a afla rezultatul.' };
  if (code === 'SEARCH_NOT_FOUND') return { title: 'Căutarea nu mai este disponibilă.', detail: 'Serverul poate fi repornit sau rezultatul a fost înlocuit. Poți începe o nouă căutare.' };
  if (code === 'SEARCH_IN_PROGRESS') return { title: 'Există deja o căutare în desfășurare.', detail: 'Așteaptă puțin înainte să încerci din nou.' };
  if (code === 'SOURCE_UNAVAILABLE') return { title: 'OLX nu a putut fi accesat momentan.', detail: 'Încearcă din nou peste puțin timp.' };
  if (code === 'INVALID_REQUEST' || code === 'LOCATION_COORDINATES_REQUIRED') return { title: 'Verifică setările căutării.', detail: 'Modifică setările și încearcă din nou.' };
  if (code === 'CONFIG') return { title: 'Conexiunea cu AutoHunter nu este configurată.', detail: 'Completează EXPO_PUBLIC_API_BASE_URL în mobile/.env cu adresa PC-ului, apoi repornește Expo.' };
  if (code === 'INVALID_RESPONSE') return { title: 'Răspunsul AutoHunter nu a putut fi citit.', detail: 'Verifică dacă aplicația și serverul sunt actualizate.' };
  return { title: 'Nu mă pot conecta la AutoHunter.', detail: 'Verifică dacă PC-ul este pornit și serverul AutoHunter rulează.' };
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ApiClientError('INVALID_RESPONSE');
  return value as Record<string, unknown>;
}
function text(value: unknown): string { if (typeof value !== 'string') throw new ApiClientError('INVALID_RESPONSE'); return value; }
function number(value: unknown): number { if (typeof value !== 'number' || !Number.isFinite(value)) throw new ApiClientError('INVALID_RESPONSE'); return value; }
function boolean(value: unknown): boolean { if (typeof value !== 'boolean') throw new ApiClientError('INVALID_RESPONSE'); return value; }
const nullableText = (value: unknown): string | null => value == null ? null : text(value);
const nullableNumber = (value: unknown): number | null => value == null ? null : number(value);
function array(value: unknown): unknown[] { if (!Array.isArray(value)) throw new ApiClientError('INVALID_RESPONSE'); return value; }
const texts = (value: unknown): string[] => array(value).map(text);

function mapCar(value: unknown): CarSearchResult {
  const row = record(value), car = record(row.car), price = record(row.price), scores = record(row.scores);
  const risks = record(row.risks), location = record(row.location), verification = record(row.verification);
  const status = text(verification.status);
  if (status !== 'VERIFIED' && status !== 'FAILED' && status !== 'NOT_REQUESTED') throw new ApiClientError('INVALID_RESPONSE');
  return {
    id: text(row.id), title: text(row.title),
    car: { make: nullableText(car.make), model: nullableText(car.model), year: nullableNumber(car.year),
      mileageKm: nullableNumber(car.mileageKm), fuel: nullableText(car.fuel), transmission: nullableText(car.transmission),
      engine: nullableText(car.engine), drivetrain: nullableText(car.drivetrain), engineCapacityCc: nullableNumber(car.engineCapacityCc),
      horsepower: nullableNumber(car.horsepower), bodyType: nullableText(car.bodyType) },
    price: { askingEur: number(price.askingEur), estimatedMarketEur: nullableNumber(price.estimatedMarketEur),
      discountPercent: nullableNumber(price.discountPercent), potentialSavingEur: nullableNumber(price.potentialSavingEur),
      comparableCount: number(price.comparableCount), confidence: number(price.confidence) },
    scores: { deal: number(scores.deal), flipPotential: number(scores.flipPotential), overallRisk: number(scores.overallRisk),
      ...(scores.carQuality === undefined ? {} : { carQuality: nullableNumber(scores.carQuality) }),
      ...(scores.opportunity === undefined ? {} : { opportunity: nullableNumber(scores.opportunity) }) },
    ...(row.classification === undefined ? {} : { classification: text(row.classification) }),
    ...(row.qualityReasons === undefined ? {} : { qualityReasons: texts(row.qualityReasons) }),
    ...(row.marketData === undefined ? {} : { marketData: mapMarketData(row.marketData) }),
    risks: { mechanical: number(risks.mechanical), accident: number(risks.accident), cosmetic: number(risks.cosmetic),
      legal: number(risks.legal), price: number(risks.price), data: number(risks.data) },
    positiveReasons: texts(row.positiveReasons), warnings: texts(row.warnings), sellerClaims: texts(row.sellerClaims),
    sellerType: nullableText(row.sellerType), registrationStatus: nullableText(row.registrationStatus),
    location: { text: nullableText(location.text), distanceKm: nullableNumber(location.distanceKm) },
    verification: { status, dataQualityScore: number(verification.dataQualityScore), dataConflicts: texts(verification.dataConflicts),
      dataWarnings: texts(verification.dataWarnings), seriousConflict: boolean(verification.seriousConflict), priceAmbiguity: boolean(verification.priceAmbiguity) },
    imageUrl: nullableText(row.imageUrl),
    ...(row.imageUrls === undefined ? {} : { imageUrls: texts(row.imageUrls) }),
    ...(row.thumbnailUrl === undefined ? {} : { thumbnailUrl: nullableText(row.thumbnailUrl) }), ...imageMetadata(row), url: text(row.url),
  };
}
function mapMarketData(value: unknown): NonNullable<CarSearchResult['marketData']> {
  const market = record(value);
  const freshness = text(market.freshness), matchQuality = text(market.matchQuality);
  if (!['FRESH', 'CACHED', 'STALE', 'UNAVAILABLE'].includes(freshness)
    || !['EXACT', 'GOOD', 'RELAXED', 'UNAVAILABLE'].includes(matchQuality)) throw new ApiClientError('INVALID_RESPONSE');
  return { freshness, matchQuality, fetchedAt: nullableText(market.fetchedAt), comparableSimilarityAverage: nullableNumber(market.comparableSimilarityAverage) };
}
export function mapApiResponse(value: unknown): CarSearchResponse {
  const response = record(value), meta = record(response.meta);
  if (meta.source !== 'OLX') throw new ApiClientError('INVALID_RESPONSE');
  return {
    meta: { ...(meta.mode === undefined ? {} : { mode: mapMode(meta.mode) }), source: 'OLX', location: text(meta.location), radiusKm: number(meta.radiusKm), searchedAt: text(meta.searchedAt),
      durationMs: number(meta.durationMs), localFetched: number(meta.localFetched), eligible: number(meta.eligible), analyzed: number(meta.analyzed),
      verified: number(meta.verified), verificationFailed: number(meta.verificationFailed), notRequested: number(meta.notRequested),
      detailRequests: number(meta.detailRequests), dataConflicts: number(meta.dataConflicts), cosmeticWarnings: number(meta.cosmeticWarnings),
      mechanicalOrAccidentWarnings: number(meta.mechanicalOrAccidentWarnings), legalWarnings: number(meta.legalWarnings),
      totalResults: number(meta.totalResults), returnedResults: number(meta.returnedResults), limit: number(meta.limit), warnings: texts(meta.warnings) },
    results: array(response.results).map(mapCar), needsManualVerification: array(response.needsManualVerification).map(mapCar),
    excludedAfterVerification: array(response.excludedAfterVerification).map(mapCar),
  };
}

export function mapJobResponse(value: unknown): SearchJobResponse { return mapCategoryJobResponse(value, mapApiResponse); }
export function mapCategoryJobResponse<Result>(value: unknown, mapper: (value: unknown) => Result): CategoryJobResponse<Result> {
  const job = record(value);
  const searchId = text(job.searchId), startedAt = text(job.startedAt);
  if (!searchId || !Number.isFinite(Date.parse(startedAt))) throw new ApiClientError('INVALID_RESPONSE');
  if (job.status === 'RUNNING') return { searchId, startedAt, status: 'RUNNING' };
  const completedAt = text(job.completedAt);
  if (!Number.isFinite(Date.parse(completedAt))) throw new ApiClientError('INVALID_RESPONSE');
  if (job.status === 'COMPLETED') return { searchId, startedAt, completedAt, status: 'COMPLETED', response: mapper(job.response) };
  if (job.status === 'FAILED') { const error = record(job.error); return { searchId, startedAt, completedAt, status: 'FAILED', error: { code: text(error.code), message: text(error.message) } }; }
  throw new ApiClientError('INVALID_RESPONSE');
}

export function createApiClient(baseUrl: string | undefined, options: { fetcher?: typeof fetch; timeoutMs?: number } = {}) {
  return createCategoryApiClient<CarSearchRequest, CarSearchResponse>(baseUrl, '/api/cars/search', mapApiResponse, options);
}
export function createCategoryApiClient<Request, Result>(baseUrl: string | undefined, path: string, mapper: (value: unknown) => Result, options: { fetcher?: typeof fetch; timeoutMs?: number } = {}) {
  let posting = false;
  async function request(path: string, settings?: Request): Promise<unknown> {
      let base: URL;
      try {
        base = new URL(baseUrl ?? '');
        if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password
          || ['localhost', '127.0.0.1', '[::1]', '0.0.0.0', 'your_pc_ip'].includes(base.hostname.toLowerCase())&&!browserLoopbackAllowed(base)
          || base.search || base.hash) throw new Error();
      } catch { throw new ApiClientError('CONFIG'); }
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, options.timeoutMs ?? 15_000);
      try {
        const response = await (options.fetcher ?? fetch)(`${base.href.replace(/\/$/, '')}${path}`, {
          method: settings ? 'POST' : 'GET', headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' },
          ...(settings ? { body: JSON.stringify(settings) } : {}), signal: controller.signal });
        let json: unknown;
        try { json = await response.json(); } catch { throw new ApiClientError(response.ok ? 'INVALID_RESPONSE' : 'NETWORK'); }
        if (!response.ok) {
          const candidate = typeof json === 'object' && json !== null ? (json as Record<string, unknown>).error : null;
          const code = candidate && typeof candidate === 'object' ? (candidate as Record<string, unknown>).code : null;
          const id = json && typeof json === 'object' ? (json as Record<string, unknown>).searchId : undefined;
          throw new ApiClientError(typeof code === 'string' ? code : response.status === 404 ? 'SEARCH_NOT_FOUND' : 'NETWORK', typeof id === 'string' ? id : undefined);
        }
        return json;
      } catch (error: unknown) {
        if (timedOut) throw new ApiClientError('TIMEOUT');
        throw error instanceof ApiClientError ? error : new ApiClientError('NETWORK');
      } finally { clearTimeout(timer); }
  }
  return {
    async search(settings: Request): Promise<CategoryJobResponse<Result>> {
      if (posting) throw new ApiClientError('SEARCH_IN_PROGRESS');
      posting = true;
      try { return mapCategoryJobResponse(await request(path, settings), mapper); }
      finally { posting = false; }
    },
    async getJob(id: string): Promise<CategoryJobResponse<Result>> { return mapCategoryJobResponse(await request(`${path}/${encodeURIComponent(id)}`), mapper); },
    async current(): Promise<CategoryJobResponse<Result> | null> { const value = await request(`${path}/current`); return value === null ? null : mapCategoryJobResponse(value, mapper); },
    async getMode(): Promise<'LIVE' | 'DEMO'> { return mapMode(record(await request('/health')).mode); },
  };
}

// Expo replaces this exact property access in the mobile bundle.
export const apiClient = createApiClient(apiBaseUrl());

export function mapMode(value: unknown): 'LIVE' | 'DEMO' { if (value !== 'LIVE' && value !== 'DEMO') throw new ApiClientError('INVALID_RESPONSE'); return value; }
export const apiDecode = { record, text, number, boolean, nullableText, nullableNumber, array, texts };
