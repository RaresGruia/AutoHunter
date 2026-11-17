import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { CarListing } from '../models/CarListing.js';

export const MARKET_TTL_MS = 12 * 60 * 60 * 1000;
export const LOCAL_TTL_MS = 2 * 60 * 1000;
export interface CacheEntry { version: 1; key: string; source: string; fetchedAt: string; listings: CarListing[] }
export class DiskCache {
  constructor(readonly directory: string, readonly now: () => number = Date.now) {}
  private path(key: string): string { return resolve(this.directory, `${createHash('sha256').update(key).digest('hex')}.json`); }
  async read(key: string): Promise<CacheEntry | null> {
    try {
      const content = await readFile(this.path(key), 'utf8');
      if (content.length > 12 * 1024 * 1024) return null;
      const row = JSON.parse(content) as CacheEntry;
      if (row.version !== 1 || row.key !== key || row.source !== 'olx' || !Number.isFinite(Date.parse(row.fetchedAt))
        || Date.parse(row.fetchedAt) > this.now() || !Array.isArray(row.listings)
        || !row.listings.every(car => car && typeof car.id === 'string' && car.source === 'olx'
          && typeof car.url === 'string' && typeof car.title === 'string' && typeof car.description === 'string'
          && typeof car.locationText === 'string' && Number.isFinite(car.priceEur) && Array.isArray(car.imageUrls)
          && ['make', 'model', 'fuel', 'engine', 'transmission', 'bodyType', 'drivetrain', 'generation', 'variant', 'conditionText', 'registrationText'].every(field => {
            const value = (car as unknown as Record<string, unknown>)[field]; return value == null || typeof value === 'string';
          })
          && (car.year === null || Number.isFinite(car.year)) && (car.mileageKm === null || Number.isFinite(car.mileageKm)))) return null;
      return row;
    } catch { return null; }
  }
  fresh(entry: CacheEntry, ttl: number): boolean { return this.now() - Date.parse(entry.fetchedAt) < ttl; }
  async write(key: string, listings: CarListing[]): Promise<CacheEntry> {
    const entry: CacheEntry = { version: 1, key, source: 'olx', fetchedAt: new Date(this.now()).toISOString(),
      listings: listings.map(({ rawData: _raw, ...car }) => car) };
    const temporary = `${this.path(key)}.${randomUUID()}.tmp`;
    try {
      await mkdir(this.directory, { recursive: true });
      await writeFile(temporary, JSON.stringify(entry), 'utf8');
      await rename(temporary, this.path(key));
    } catch { /* Cache failure must not discard a successful public response. */ }
    finally { await unlink(temporary).catch(() => undefined); }
    return entry;
  }
}

export function accessDenied(error: unknown): boolean {
  return /\b(?:403|429)\b|captcha|access.denied|protec[tț]ie|just a moment/i.test(String(error));
}
