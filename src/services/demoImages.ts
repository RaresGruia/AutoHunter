import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { canDisplayImages, demoImagePathPattern, imageMetadata, normalizeListingImages, type ListingImages } from '../models/ListingImages.js';

export type DemoImageCategory = 'cars' | 'tractors' | 'tools';
export type DemoImageManifest = Partial<Record<DemoImageCategory, Record<string, ListingImages>>>;

export async function readDemoImageManifest(file = resolve('fixtures/demo-images.json')): Promise<DemoImageManifest> {
  try {
    const data: unknown = JSON.parse(await readFile(file, 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid DEMO image manifest');
    return data as DemoImageManifest;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return {};
    throw error;
  }
}

export function attachDemoImages<T extends ListingImages & { id: string }>(listing: T, category: DemoImageCategory, manifest: DemoImageManifest): T {
  const configured = manifest[category]?.[listing.id] ?? listing;
  const entry = canDisplayImages(configured.imageRights) ? configured : {imageUrls:[]};
  const ownPath = (value: unknown): value is string => {
    if (typeof value !== 'string') return false;
    const match = demoImagePathPattern.exec(value);
    return match?.[1] === category && match[2] === listing.id;
  };
  // Never pass through a remote URL, another listing's images or a filesystem path in DEMO.
  const images = normalizeListingImages({
    imageUrl: ownPath(entry.imageUrl) ? entry.imageUrl : null,
    imageUrls: Array.isArray(entry.imageUrls) ? entry.imageUrls.filter(ownPath) : [],
    thumbnailUrl: ownPath(entry.thumbnailUrl) ? entry.thumbnailUrl : null,
    ...imageMetadata(entry),
  });
  return { ...listing, ...images, ...(canDisplayImages(configured.imageRights) ? {imageRights:configured.imageRights!} : {}) };
}
