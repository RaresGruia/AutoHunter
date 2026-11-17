import type { TractorListing } from './types.js';

/** Reject malformed source data rather than inventing tractor specifications. */
export function validateTractorListing(value: unknown): asserts value is TractorListing {
  if (!value || typeof value !== 'object') throw new Error('Invalid tractor listing');
  const row = value as Record<string, unknown>;
  const invalid = () => { throw new Error('Invalid tractor listing'); };
  for (const key of ['id', 'source', 'url', 'title', 'locationText', 'description']) {
    if (typeof row[key] !== 'string') invalid();
  }
  if (!row.id || !row.source || !row.title) invalid();
  try { if (!['https:', 'http:'].includes(new URL(String(row.url)).protocol)) invalid(); } catch { invalid(); }
  for (const key of ['make', 'model', 'engine', 'fuel', 'transmission', 'cabin', 'registrationStatus', 'documents', 'sellerType', 'publishedAt']) {
    if (row[key] !== null && typeof row[key] !== 'string') invalid();
  }
  for (const [key, min, max] of [['year', 1900, new Date().getFullYear()+1], ['horsepower', 1, 1000],
    ['operatingHours', 0, 200000], ['latitude', -90, 90], ['longitude', -180, 180]] as const) {
    const n = row[key];
    if (n !== null && (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max)) invalid();
  }
  if (row.year !== null && !Number.isInteger(row.year)) invalid();
  for (const [key, min, max] of [['priceEur', 1, 500000], ['identityConfidence', 0, 100]] as const) {
    const n = row[key];
    if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) invalid();
  }
  if (!['4X4', '4X2', 'UNKNOWN'].includes(String(row.drivetrain))) invalid();
  if (row.frontLoader !== null && typeof row.frontLoader !== 'boolean') invalid();
  if (!Array.isArray(row.imageUrls) || !row.imageUrls.every(url => typeof url === 'string')) invalid();
  for (const key of ['imageUrl','thumbnailUrl']) {
    const value = row[key];
    if (value !== undefined && value !== null && typeof value !== 'string') throw new Error('Invalid listing image');
  }
}
