import { load } from 'cheerio';
import type { CarListing } from '../../models/CarListing.js';
import { normalizeText } from '../../analysis/text.js';
import { identifyCar } from '../../analysis/carIdentity.js';

type RecordValue = Record<string, unknown>;
export interface ParseResult { listings: CarListing[]; warnings: string[] }

export function record(value: unknown): RecordValue {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as RecordValue : {};
}
function string(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}
function number(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^\d+(?:\.\d+)?$/.test(value.trim())) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function plainText(value: unknown): string {
  const $ = load(`<div>${string(value) ?? ''}</div>`);
  $('br').replaceWith(' ');
  $('p, div, li').append(' ');
  return $.text().replace(/\s+/g, ' ').trim();
}

export function parseDisplayedEuroPrice(value: unknown): number | null {
  const match = string(value)?.match(/^([\d\s.,]+)\s*(?:€|EUR)$/i);
  if (!match) return null;
  let numeric = match[1]!.replace(/\s/g, '');
  if (!/^\d+(?:[.,]\d+)*$/.test(numeric)) return null;
  const separator = Math.max(numeric.lastIndexOf('.'), numeric.lastIndexOf(','));
  if (separator >= 0 && numeric.length - separator - 1 <= 2) {
    numeric = numeric.slice(0, separator).replace(/[.,]/g, '') + '.' + numeric.slice(separator + 1);
  } else {
    if (!/^\d{1,3}(?:[.,]\d{3})+$/.test(numeric) && separator >= 0) return null;
    numeric = numeric.replace(/[.,]/g, '');
  }
  const price = Number(numeric);
  return Number.isFinite(price) && price > 0 ? price : null;
}

export function parseOlxAd(input: unknown, fixture: boolean, allowDisplayPrice = false): CarListing | null {
  const ad = record(input);
  const price = record(record(ad.price).regularPrice);
  const displayedEur = parseDisplayedEuroPrice(record(ad.price).displayValue);
  const priceEur = price.currencyCode === 'EUR' ? number(price.value)
    : allowDisplayPrice && displayedEur !== null && Number.isFinite(displayedEur) ? displayedEur : null;
  const title = string(ad.title);
  const urlText = string(ad.url);
  const id = typeof ad.id === 'number' ? String(ad.id) : string(ad.id);
  if (!id || !title || !urlText || priceEur === null || priceEur <= 0
    || ad.isActive === false) return null;
  let url: URL;
  try { url = new URL(urlText); } catch { return null; }
  const allowedHosts = fixture ? ['example.invalid'] : ['www.olx.ro', 'olx.ro'];
  if (url.protocol !== 'https:' || !allowedHosts.includes(url.hostname) || url.username || url.password) return null;
  url.search = '';
  url.hash = '';
  const params = new Map<string, RecordValue>();
  if (Array.isArray(ad.params)) for (const inputParam of ad.params) {
    const param = record(inputParam);
    if (typeof param.key === 'string') params.set(param.key, param);
  }
  const paramText = (key: string): string | null => string(params.get(key)?.value);
  const paramNumber = (key: string): number | null => number(params.get(key)?.normalizedValue);
  const location = record(ad.location);
  const map = record(ad.map);
  const year = paramNumber('year');
  const mileage = paramNumber('rulaj_pana');
  const lat = number(map.lat);
  const lon = number(map.lon);
  const hasCoordinates = lat !== null && lon !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
  const driveMatches = [...new Set(normalizeText(title).match(/\b(?:4x4|4x2|awd|fwd|rwd)\b/g) ?? [])];
  const description = plainText(ad.description);
  const state = paramText('state');
  return {
    id, source: fixture ? 'olx-fixture' : 'olx', url: url.href, title,
    ...identifyCar({ title, make: paramText('make'), model: paramText('model') }),
    year: year !== null && Number.isInteger(year) && year >= 1886 && year <= new Date().getFullYear() + 1 ? year : null,
    mileageKm: mileage !== null && Number.isInteger(mileage) && mileage >= 0 ? mileage : null,
    priceEur, fuel: paramText('petrol'), transmission: paramText('gearbox'),
    engine: paramNumber('enginesize') === null ? null : `${paramNumber('enginesize')} cm3`,
    engineCapacityCc: paramNumber('enginesize'), horsepower: paramNumber('engine_power'), bodyType: paramText('car_body'),
    generation: paramText('generation'), variant: paramText('version'),
    registrationText: paramText('registration_state'),
    drivetrain: paramText('drivetrain') ?? (driveMatches.length === 1 ? driveMatches[0]! : null),
    locationText: string(location.pathName) ?? string(location.cityName) ?? 'Necunoscută',
    latitude: hasCoordinates ? lat : null, longitude: hasCoordinates ? lon : null,
    description, conditionText: state,
    imageUrls: Array.isArray(ad.photos) ? ad.photos.filter((photo): photo is string =>
      typeof photo === 'string' && /^https:\/\//.test(photo)) : [],
    sellerType: typeof ad.isBusiness === 'boolean' ? (ad.isBusiness ? 'business' : 'private') : null,
    publishedAt: string(ad.createdTime),
    updatedAt: string(ad.lastRefreshTime),
  };
}

export function readOlxState(html: string): unknown {
  const $ = load(html);
  const title = normalizeText($('title').text());
  if (/captcha|access denied|just a moment|verifica.*(?:uman|robot)|challenge/.test(title)
    || $('[id*="captcha"], .g-recaptcha, #challenge-form').length) {
    throw new Error('OLX a afișat o protecție. Căutarea a fost oprită, fără reîncercare.');
  }
  let state: unknown;
  // Citim doar literalul JSON din HTML-ul public; nu executăm JavaScript de pe site.
  for (const script of $('script').toArray()) {
    const match = ($(script).html() ?? '').match(/(?:window\.)?__PRERENDERED_STATE__\s*=\s*("(?:\\.|[^"\\])*")/);
    if (match?.[1]) {
      try { state = JSON.parse(JSON.parse(match[1]) as string) as unknown; }
      catch { throw new Error('Datele OLX din HTML nu mai au formatul JSON așteptat.'); }
      break;
    }
  }
  return state;
}

export function parseOlxHtml(html: string, options: { fixture?: boolean } = {}): ParseResult {
  const state = readOlxState(html);
  const listing = record(record(record(state).listing).listing);
  if (!Array.isArray(listing.ads)) {
    throw new Error('Structura OLX nu este recunoscută. Parserul trebuie actualizat; nu sunt generate rezultate fictive.');
  }
  const listings: CarListing[] = [];
  for (const ad of listing.ads) {
    const parsed = parseOlxAd(ad, options.fixture ?? false);
    if (parsed) listings.push(parsed);
  }
  const skipped = listing.ads.length - listings.length;
  const warnings = skipped ? [`${skipped} anunțuri omise: monedă diferită de EUR, link extern, date invalide sau anunț inactiv.`] : [];
  if (listings.some(car => !car.make || !car.model)) warnings.push('Unele mărci/modele lipsesc sau sunt ambigue; nu sunt folosite pentru estimări.');
  return { listings, warnings };
}
