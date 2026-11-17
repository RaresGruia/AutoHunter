import { canonicalListingUrl, publicListingUrl } from '../../../src/models/ListingUrl';
import type { LiveCategory } from '../../../src/live/types';
export const BOOKMARKS_KEY = 'autohunter:bookmarks:v1';
export interface Bookmark {
  url: string;
  category: LiveCategory;
  savedAt: string;
}
/** User-chosen links only; no persistent copy of Brave titles, snippets, prices or photographs. */
export function readBookmarks(raw: string | null): Bookmark[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    if (!Array.isArray(value)) return [];
    const seen = new Set<string>();
    return value
      .flatMap((row) => {
        if (
          !row ||
          typeof row !== 'object' ||
          typeof row.url !== 'string' ||
          !publicListingUrl(row.url) ||
          !['cars', 'tractors', 'tools'].includes(row.category) ||
          !Number.isFinite(Date.parse(row.savedAt))
        )
          return [];
        const url = canonicalListingUrl(row.url)!;
        if (seen.has(url)) return [];
        seen.add(url);
        return [{ url, category: row.category as LiveCategory, savedAt: row.savedAt }];
      })
      .slice(0, 500);
  } catch {
    return [];
  }
}
export function toggleBookmark(
  rows: Bookmark[],
  url: string,
  category: LiveCategory,
  now = new Date().toISOString(),
): Bookmark[] {
  if (!publicListingUrl(url)) return rows;
  const canonical = canonicalListingUrl(url)!;
  return rows.some((row) => row.url === canonical)
    ? rows.filter((row) => row.url !== canonical)
    : [{ url: canonical, category, savedAt: now }, ...rows].slice(0, 500);
}
