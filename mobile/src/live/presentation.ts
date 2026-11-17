import type { DisplayOffer } from './offers';
import { isDemo } from './offers';
import { canDisplayImages, demoImagePathPattern } from '../../../src/models/ListingImages';
import { indexFacts } from '../../../src/live/indexFacts';
import { canonicalListingUrl } from '../../../src/models/ListingUrl';

export type SortOrder = 'relevance' | 'price-asc' | 'price-desc' | 'newest' | 'opportunity';
export interface OfferFilters {
  brand: string;
  location: string;
  minPrice: string;
  maxPrice: string;
  currency: 'ALL' | 'EUR' | 'RON';
  minYear: string;
  maxMileage: string;
  maxHours: string;
  condition: string;
  onlyPhotos: boolean;
  onlyVerified: boolean;
  favoritesOnly: boolean;
  includeUnavailable: boolean;
}
export const emptyFilters: OfferFilters = {
  brand: '',
  location: '',
  minPrice: '',
  maxPrice: '',
  currency: 'ALL',
  minYear: '',
  maxMileage: '',
  maxHours: '',
  condition: 'ALL',
  onlyPhotos: false,
  onlyVerified: false,
  favoritesOnly: false,
  includeUnavailable: false,
};
export const normalized = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
export const indexed = (row: DisplayOffer) => row.indexFacts ?? indexFacts(row);
export function priceOf(
  row: DisplayOffer,
): { amount: number; currency: 'EUR' | 'RON'; origin: 'CONFIRMED' | 'INDEX' } | null {
  if (row.priceEur !== null && Number.isFinite(row.priceEur))
    return { amount: row.priceEur, currency: 'EUR', origin: 'CONFIRMED' };
  const price = indexed(row).price;
  return price ? { ...price.value, origin: 'INDEX' } : null;
}
export function valueOf(row: DisplayOffer, key: 'year' | 'mileageKm' | 'operatingHours'): number | null {
  const value = row.attributes[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : (indexed(row)[key]?.value ?? null);
}
export function exactPhotoUrls(row: DisplayOffer): string[] {
  if (isDemo(row))
    return canDisplayImages(row.imageRights)
      ? row.imageUrls.filter((url) => {
          const match = demoImagePathPattern.exec(url);
          return match?.[1] === 'cars' && match[2] === row.id;
        })
      : [];
  if (
    row.imagePresentation !== 'ACTUAL_ITEM' ||
    !['OWNED', 'LICENSED'].includes(row.imageRights?.status) ||
    !row.imageRights.evidence?.trim()
  )
    return [];
  return row.imageUrls.filter((imageUrl) =>
    row.photoProvenance?.some(
      (photo) =>
        photo.imageUrl === imageUrl &&
        photo.listingId === row.id &&
        canonicalListingUrl(photo.originalUrl) === canonicalListingUrl(row.originalUrl) &&
        photo.evidence.trim(),
    ),
  );
}
export const confirmed = (row: DisplayOffer) =>
  ['ACTIVE_VERIFIED', 'USER_CONFIRMED'].includes(row.availability) && !!row.lastVerifiedAt;
export const unavailable = (row: DisplayOffer) => ['EXPIRED', 'UNAVAILABLE'].includes(row.availability);
export function splitAvailability(rows: readonly DisplayOffer[]) {
  return {
    confirmed: rows.filter((row) => !unavailable(row) && confirmed(row)),
    unverified: rows.filter((row) => !unavailable(row) && !confirmed(row)),
  };
}
export function availabilityText(row: DisplayOffer): string {
  if (isDemo(row)) return 'Exemplu DEMO · nu este ofertă reală';
  if (row.availabilityReport) return 'Raportat indisponibil';
  return {
    ACTIVE_VERIFIED: 'Verificat la sursă',
    USER_CONFIRMED: 'Confirmat de tine',
    UNVERIFIED: 'Disponibilitate neconfirmată',
    STALE: 'Verificare de reînnoit',
    EXPIRED: 'Anunț expirat',
    UNAVAILABLE: 'Anunț indisponibil',
  }[row.availability];
}
export function filtersError(filters: OfferFilters): string | null {
  for (const key of ['minPrice', 'maxPrice', 'minYear', 'maxMileage', 'maxHours'] as const) {
    const text = filters[key].trim();
    if (text && (!Number.isFinite(Number(text.replace(',', '.'))) || Number(text.replace(',', '.')) < 0))
      return 'Folosește valori numerice pozitive în filtre.';
  }
  if (filters.minPrice && filters.maxPrice && Number(filters.minPrice) > Number(filters.maxPrice))
    return 'Prețul maxim trebuie să fie mai mare decât cel minim.';
  return null;
}
export function selectOffers(
  rows: readonly DisplayOffer[],
  filters: OfferFilters,
  sort: SortOrder,
  favorites: ReadonlySet<string>,
): DisplayOffer[] {
  if (filtersError(filters)) return [];
  const bound = (value: number | null, min: string, max: string) =>
    (!min && !max) ||
    (value !== null &&
      (!min || value >= Number(min.replace(',', '.'))) &&
      (!max || value <= Number(max.replace(',', '.'))));
  const selected = rows.filter((row) => {
    const price = priceOf(row),
      url = canonicalListingUrl(row.originalUrl)!;
    return (
      (filters.includeUnavailable || !unavailable(row)) &&
      (!filters.brand ||
        normalized(`${row.make ?? ''} ${row.model ?? ''} ${row.title}`).includes(
          normalized(filters.brand),
        )) &&
      (!filters.location ||
        (typeof row.attributes.location === 'string' &&
          normalized(row.attributes.location).includes(normalized(filters.location)))) &&
      (filters.currency === 'ALL' || price?.currency === filters.currency) &&
      bound(price?.amount ?? null, filters.minPrice, filters.maxPrice) &&
      bound(valueOf(row, 'year'), filters.minYear, '') &&
      bound(valueOf(row, 'mileageKm'), '', filters.maxMileage) &&
      bound(valueOf(row, 'operatingHours'), '', filters.maxHours) &&
      (filters.condition === 'ALL' || row.attributes.condition === filters.condition) &&
      (!filters.onlyPhotos || exactPhotoUrls(row).length > 0) &&
      (!filters.onlyVerified || confirmed(row)) &&
      (!filters.favoritesOnly || favorites.has(url))
    );
  });
  if (sort === 'newest') selected.sort((a, b) => Date.parse(b.discoveredAt) - Date.parse(a.discoveredAt));
  if (sort === 'opportunity')
    selected.sort((a, b) =>
      a.analysis.dealScore === null
        ? b.analysis.dealScore === null
          ? 0
          : 1
        : b.analysis.dealScore === null
          ? -1
          : b.analysis.dealScore - a.analysis.dealScore,
    );
  if (sort.startsWith('price'))
    selected.sort((a, b) => {
      const x = priceOf(a),
        y = priceOf(b);
      if (!x || !y) return x ? -1 : y ? 1 : 0;
      return (
        x.currency.localeCompare(y.currency) ||
        (sort === 'price-asc' ? x.amount - y.amount : y.amount - x.amount)
      );
    });
  return selected;
}
export const amount = (value: number, currency = 'EUR') =>
  new Intl.NumberFormat('ro-RO', {
    style: 'currency',
    currency,
    maximumFractionDigits: Math.round(value) === value ? 0 : 2,
  }).format(value);
export const numberText = (value: number) => new Intl.NumberFormat('ro-RO').format(value);
export const shortTitle = (row: DisplayOffer) =>
  row.title
    .replace(/^(?:Utilizat|Nou|Folosit)\s+/i, '')
    .replace(/\s*[-–]\s*\d[\d.,\s]*(?:EUR|EURO|€|RON|lei)\b.*$/i, '')
    .replace(/\s*[-–]\s*(?:Autovit|OLX|Publi24)\.ro.*$/i, '')
    .trim() || row.title;
export const publisherName = (publisher: string) =>
  publisher
    .replace(/^www\./, '')
    .replace(/\.ro$/, '')
    .replace(/^./, (text) => text.toUpperCase());
