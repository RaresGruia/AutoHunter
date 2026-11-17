import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { publicListingUrl } from './brave.js';
import type { ManualOffer } from './types.js';
import { imageMetadata } from '../models/ListingImages.js';

const nullableText = (value: unknown, max = 250) =>
  typeof value === 'string' && value.trim() ? value.trim().slice(0, max) : null;
export function validateManual(value: unknown, now = new Date().toISOString()): ManualOffer {
  if (!value || typeof value !== 'object') throw Error('INVALID_MANUAL_OFFER');
  const v = value as Record<string, unknown>;
  const url = typeof v.originalUrl === 'string' ? publicListingUrl(v.originalUrl) : null;
  const permissionEvidence = nullableText(v.permissionEvidence, 1000);
  if (
    !url ||
    v.country !== 'RO' ||
    !['cars', 'tractors', 'tools'].includes(String(v.category)) ||
    v.dataUseAllowed !== true ||
    !permissionEvidence
  )
    throw Error('DATA_PERMISSION_REQUIRED');
  if (
    v.priceEur !== undefined &&
    v.priceEur !== null &&
    (typeof v.priceEur !== 'number' || !Number.isFinite(v.priceEur) || v.priceEur <= 0)
  )
    throw Error('INVALID_PRICE');
  const attributes: ManualOffer['attributes'] = {};
  const allowed = [
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
  ];
  if (v.attributes !== undefined) {
    if (!v.attributes || typeof v.attributes !== 'object' || Array.isArray(v.attributes))
      throw Error('INVALID_ATTRIBUTES');
    for (const [key, item] of Object.entries(v.attributes)) {
      if (
        !allowed.includes(key) ||
        !(
          item === null ||
          (typeof item === 'string' && item.length <= 5000) ||
          typeof item === 'boolean' ||
          (typeof item === 'number' && Number.isFinite(item) && item >= 0)
        )
      )
        throw Error('INVALID_ATTRIBUTES');
      attributes[key] = item;
    }
  }
  const availability = v.availability ?? 'UNVERIFIED';
  if (!['UNVERIFIED', 'USER_CONFIRMED', 'EXPIRED'].includes(String(availability)))
    throw Error('INVALID_AVAILABILITY');
  const imageRights: ManualOffer['imageRights'] = { status: 'UNKNOWN', evidence: null };
  let imageUrls: string[] = [];
  if (Array.isArray(v.imageUrls) && v.imageUrls.length) {
    const rights = v.imageRights as Record<string, unknown> | undefined;
    if (
      v.imageDisplayAllowed !== true ||
      !rights ||
      !['OWNED', 'LICENSED'].includes(String(rights.status)) ||
      !nullableText(rights.evidence, 1000)
    )
      throw Error('IMAGE_PERMISSION_REQUIRED');
    if (v.imagePresentation !== 'ACTUAL_ITEM') throw Error('ACTUAL_ITEM_PHOTOS_REQUIRED');
    imageUrls = v.imageUrls.map((item) => {
      const url = typeof item === 'string' ? publicListingUrl(item) : null;
      if (!url) throw Error('INVALID_IMAGE_URL');
      return url;
    });
    if (imageUrls.length > 12) throw Error('TOO_MANY_IMAGES');
    imageRights.status = rights.status as 'OWNED' | 'LICENSED';
    imageRights.evidence = nullableText(rights.evidence, 1000);
  }
  return {
    id: 'manual:' + createHash('sha256').update(url).digest('hex').slice(0, 24),
    category: v.category as ManualOffer['category'],
    originalUrl: url,
    title: nullableText(v.title) ?? 'Titlu necompletat',
    priceEur: typeof v.priceEur === 'number' ? v.priceEur : null,
    make: nullableText(v.make),
    model: nullableText(v.model),
    attributes,
    imageUrls,
    imageRights,
    ...(imageMetadata(v).imageAttributions
      ? {
          imageAttributions: imageMetadata(v).imageAttributions!.filter((credit) =>
            imageUrls.includes(credit.imageUrl),
          ),
        }
      : {}),
    permissionEvidence,
    importedAt: now,
    lastVerifiedAt: availability === 'UNVERIFIED' ? null : now,
    availability: availability as ManualOffer['availability'],
  };
}
export class ManualOfferStore {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly file = resolve('data/imports/live-offers.json')) {}
  async list(): Promise<ManualOffer[]> {
    try {
      const rows: unknown = JSON.parse(await readFile(this.file, 'utf8'));
      if (!Array.isArray(rows)) throw Error('INVALID_MANUAL_STORE');
      return rows as ManualOffer[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
  async save(offer: ManualOffer): Promise<void> {
    const operation = this.queue.then(async () => {
      const rows = await this.list(),
        filtered = rows.filter((row) => row.id !== offer.id);
      if (filtered.length >= 1000) throw Error('MANUAL_IMPORT_LIMIT');
      await mkdir(dirname(this.file), { recursive: true });
      const temporary = this.file + '.' + randomUUID() + '.tmp';
      await writeFile(temporary, JSON.stringify([...filtered, offer], null, 2) + '\n', { flag: 'wx' });
      await rename(temporary, this.file);
    });
    this.queue = operation.catch(() => {});
    await operation;
  }
}
