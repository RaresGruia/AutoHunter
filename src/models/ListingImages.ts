/** Shared transport contract. DEMO uses local /demo-images/... paths; LIVE may use authorized HTTPS URLs. */
export interface ListingImages {
  imageUrl?: string | null;
  imageUrls: string[];
  thumbnailUrl?: string | null;
  imageRights?: ImageRights;
  imagePresentation?: 'REPRESENTATIVE_MODEL' | 'ACTUAL_ITEM';
  imageAttributions?: ImageAttribution[];
}

export interface ImageAttribution {
  imageUrl: string; title: string; author: string; sourceUrl: string;
  license: string; licenseUrl: string; changes: string;
}

/** Optional display metadata; no HTML or unsafe links from imported descriptions. */
export function imageMetadata(value: unknown): Pick<ListingImages, 'imagePresentation' | 'imageAttributions'> {
  if (!value || typeof value !== 'object') return {};
  const v = value as Record<string, unknown>;
  const safeLink = (url: unknown) => {
    try { const u = new URL(String(url)); return u.protocol === 'https:' && !u.username && !u.password; } catch { return false; }
  };
  const credits = Array.isArray(v.imageAttributions) ? v.imageAttributions.filter((credit): credit is ImageAttribution =>
    !!credit && typeof credit === 'object' && ['imageUrl','title','author','sourceUrl','license','licenseUrl','changes'].every(key =>
      typeof credit[key] === 'string' && credit[key].trim()) && safeLink(credit.sourceUrl) && safeLink(credit.licenseUrl)) : [];
  return {
    ...(v.imagePresentation === 'REPRESENTATIVE_MODEL' || v.imagePresentation === 'ACTUAL_ITEM' ? {imagePresentation:v.imagePresentation} : {}),
    ...(credits.length ? {imageAttributions:credits} : {}),
  };
}

export interface ImageRights { status: 'UNKNOWN' | 'OWNED' | 'LICENSED'; evidence: string | null }
export function canDisplayImages(rights: ImageRights | undefined): boolean {
  return !!rights && ['OWNED','LICENSED'].includes(rights.status) && typeof rights.evidence === 'string' && rights.evidence.trim().length > 0;
}

export function normalizeListingImages(images: ListingImages): { imageUrl: string | null; imageUrls: string[]; thumbnailUrl: string | null } & Pick<ListingImages, 'imagePresentation' | 'imageAttributions'> {
  const imageUrls = [...new Set([images.imageUrl, ...images.imageUrls].filter((value): value is string =>
    typeof value === 'string' && value.trim().length > 0))];
  return { imageUrl: imageUrls[0] ?? null, imageUrls, thumbnailUrl: images.thumbnailUrl || null, ...imageMetadata(images) };
}

export const demoImagePathPattern = /^\/demo-images\/(cars|tractors|tools)\/([a-z0-9_-]+)\/((?:[0-9]{2}|thumbnail)\.(?:jpg|jpeg|png|webp))$/i;
