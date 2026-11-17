import { demoImagePathPattern } from '../../src/models/ListingImages';
export type ListingCategory = 'cars' | 'tractors' | 'tools';
export type ListingMode = 'DEMO' | 'LIVE' | null | undefined;
export interface ListingImageInput extends Pick<import('../../src/models/ListingImages').ListingImages, 'imagePresentation' | 'imageAttributions'> {
  category: ListingCategory;
  mode: ListingMode;
  listingId?: string;
  listingUrl?: string;
  synthetic?: boolean;
  imageUrl?: string | null;
  imageUrls?: readonly (string | null | undefined)[];
  thumbnailUrl?: string | null;
}

export function isDemoListing({ mode, synthetic, listingUrl }: ListingImageInput): boolean {
  if (mode === 'DEMO' || synthetic) return true;
  try {
    const host = new URL(listingUrl ?? '').hostname;
    return host === 'example.invalid' || host.endsWith('.example.invalid');
  } catch { return false; }
}

export function listingImagePlan(input: ListingImageInput, apiBaseUrl?: string): { demo: boolean; uris: string[]; thumbnailUri: string | null } {
  const demo = isDemoListing(input);
  const resolveImage = (value: string | null | undefined): string | null => {
    if (!value) return null;
    const local = demoImagePathPattern.exec(value);
    if (local && local[1] === input.category && local[2] === input.listingId) {
      try {
        const base = new URL(apiBaseUrl ?? '');
        if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password) return null;
        return new URL(value, base).href;
      } catch { return null; }
    }
    // Synthetic listings only load from the local API's explicit DEMO asset route.
    if (demo || input.mode !== 'LIVE') return null;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.username && !url.password &&
        url.hostname !== 'example.invalid' && !url.hostname.endsWith('.example.invalid') ? url.href : null;
    } catch { return null; }
  };
  const uris = [...new Set([input.imageUrl, ...(input.imageUrls ?? [])].map(resolveImage).filter((uri): uri is string => !!uri))];
  const thumbnailUri = resolveImage(input.thumbnailUrl);
  return { demo, uris, thumbnailUri };
}
