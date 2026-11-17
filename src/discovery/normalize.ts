import { imageMetadata } from '../models/ListingImages.js';
import type { CommonListing, ListingInput, SourceDescriptor } from './SourceAdapter.js';
import { normalizeListingImages, demoImagePathPattern } from '../models/ListingImages.js';
import { canonicalListingUrl } from '../models/ListingUrl.js';
export { canonicalListingUrl } from '../models/ListingUrl.js';

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;
export function normalizeListing(
  input: ListingInput,
  source: SourceDescriptor,
  fetchedAt: string,
  eurPerRon?: number,
): CommonListing {
  if (
    !input ||
    !text(input.id) ||
    !text(input.title) ||
    !source.categories.includes(input.category) ||
    !input.price ||
    !Number.isFinite(input.price.amount) ||
    input.price.amount <= 0 ||
    !['EUR', 'RON'].includes(input.price.currency) ||
    !input.location ||
    input.location.country !== 'RO' ||
    !Array.isArray(input.imageUrls) ||
    !input.imageUrls.every((url) => typeof url === 'string') ||
    !Number.isFinite(Date.parse(fetchedAt))
  )
    throw new Error('INVALID_LISTING');
  for (const [value, limit] of [
    [input.location.latitude, 90],
    [input.location.longitude, 180],
  ] as const) {
    if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > limit))
      throw new Error('INVALID_COORDINATES');
  }
  if ((input.location.latitude === null) !== (input.location.longitude === null))
    throw new Error('INCOMPLETE_COORDINATES');
  const rate = input.price.currency === 'RON' ? eurPerRon : 1;
  if (!rate || !Number.isFinite(rate) || rate <= 0) throw new Error('EXPLICIT_EXCHANGE_RATE_REQUIRED');
  const priceEur = Math.round(input.price.amount * rate * 100) / 100;
  if (!Number.isFinite(priceEur) || priceEur <= 0) throw new Error('INVALID_NORMALIZED_PRICE');
  const originalUrl = canonicalListingUrl(input.originalUrl);
  if (input.originalUrl !== null && input.originalUrl !== undefined && typeof input.originalUrl !== 'string')
    throw new Error('INVALID_ORIGINAL_URL');
  if (input.originalUrl && !originalUrl) throw new Error('INVALID_ORIGINAL_URL');
  const granted =
    source.permission.imageDisplay &&
    ['OWNED', 'LICENSED'].includes(input.imageRights?.status) &&
    !!text(input.imageRights?.evidence);
  const safeImage = (url: string): boolean => {
    if (source.kind === 'DEMO') {
      const match = demoImagePathPattern.exec(url);
      return match?.[1] === input.category && match[2] === input.id;
    }
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
    } catch {
      return false;
    }
  };
  const images = normalizeListingImages(granted ? input : { imageUrls: [] });
  const sanitized = normalizeListingImages({
    imageUrl: images.imageUrl && safeImage(images.imageUrl) ? images.imageUrl : null,
    imageUrls: images.imageUrls.filter(safeImage),
    thumbnailUrl: images.thumbnailUrl && safeImage(images.thumbnailUrl) ? images.thumbnailUrl : null,
    ...imageMetadata(images),
  });
  const attributes: CommonListing['metadata']['attributes'] = {};
  for (const [key, value] of Object.entries(input.attributes ?? {}))
    if (
      [
        'year',
        'mileageKm',
        'horsepower',
        'operatingHours',
        'subcategory',
        'condition',
        'fuel',
        'transmission',
        'powerSource',
        'engineCapacityCc',
        'engineCc',
        'engine',
        'drivetrain',
        'description',
        'voltageV',
        'batteryAh',
        'batteriesIncluded',
        'chargerIncluded',
        'powerWatts',
        'manufacturingYear',
        'accessories',
        'location',
      ].includes(key) &&
      (value === null ||
        typeof value === 'string' ||
        typeof value === 'boolean' ||
        (typeof value === 'number' && Number.isFinite(value)))
    )
      attributes[key] = value;
  const identity =
    input.identity && text(input.identity.namespace) && text(input.identity.value)
      ? { namespace: input.identity.namespace.trim(), value: input.identity.value.trim() }
      : undefined;
  return {
    id: source.id + ':' + input.id,
    sourceId: source.id,
    sourceListingId: input.id,
    sourceKind: source.kind,
    category: input.category,
    title: input.title.trim(),
    originalUrl: input.originalUrl ?? null,
    make: text(input.make)?.normalize('NFKC').toLowerCase() ?? null,
    model: text(input.model)?.normalize('NFKC').toLowerCase() ?? null,
    priceEur,
    location: {
      country: input.location.country,
      text: text(input.location.text),
      latitude: input.location.latitude,
      longitude: input.location.longitude,
    },
    ...sanitized,
    imageRights: granted
      ? { status: input.imageRights.status, evidence: input.imageRights.evidence }
      : { status: 'UNKNOWN', evidence: null },
    metadata: {
      mode: source.kind === 'DEMO' ? 'DEMO' : source.transport === 'LOCAL' ? 'IMPORTED' : 'LIVE',
      fetchedAt,
      originalPrice: { amount: input.price.amount, currency: input.price.currency },
      eurPerRon: input.price.currency === 'RON' ? rate : null,
      ...(identity ? { identity } : {}),
      attributes,
    },
  };
}

export interface DeduplicatedListing {
  listing: CommonListing;
  origins: { sourceId: string; sourceListingId: string; originalUrl: string | null; priceEur: number }[];
  priceConflict: boolean;
}
export function deduplicate(listings: readonly CommonListing[]): DeduplicatedListing[] {
  // Union all exact identifiers. Similar make/model/price alone never proves a duplicate.
  const parent = listings.map((_, i) => i),
    keys = new Map<string, number>();
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i]!)));
  listings.forEach((listing, i) => {
    const identity = listing.metadata.identity;
    const prefix = listing.metadata.mode + '|' + listing.category;
    const values = [
      prefix + '|id|' + listing.id,
      ...(listing.originalUrl ? [prefix + '|url|' + canonicalListingUrl(listing.originalUrl)] : []),
      ...(identity ? [prefix + '|identity|' + JSON.stringify([identity.namespace, identity.value])] : []),
    ];
    for (const key of values) {
      const previous = keys.get(key);
      if (previous !== undefined) parent[find(i)] = find(previous);
      else keys.set(key, i);
    }
  });
  const groups = new Map<number, CommonListing[]>();
  listings.forEach((row, i) => {
    const key = find(i),
      group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  });
  return [...groups.values()].map((group) => ({
    listing: group[0]!,
    origins: group.map((row) => ({
      sourceId: row.sourceId,
      sourceListingId: row.sourceListingId,
      originalUrl: row.originalUrl,
      priceEur: row.priceEur,
    })),
    priceConflict: new Set(group.map((row) => row.priceEur)).size > 1,
  }));
}
