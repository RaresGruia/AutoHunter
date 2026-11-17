import type { CarListing } from '../models/CarListing.js';
import { analyzeListingRisk } from './listingRisk.js';
import { normalizeText } from './text.js';
import { identityKey } from './carIdentity.js';

export type ComparableLevel = 1 | 2 | 3;
export interface LevelDiagnostic { level: ComparableLevel; matches: number; retained: number; outliersRemoved: number }
export interface PriceEstimate {
  estimatedMarketPrice: number | null;
  discountPercent: number | null;
  absoluteSavingEur: number | null;
  comparableCount: number;
  confidenceScore: number;
  comparableLevel: ComparableLevel | null;
  diagnostics: LevelDiagnostic[];
  comparableSimilarityAverage?: number | null;
  matchQuality?: 'EXACT' | 'GOOD' | 'RELAXED' | 'UNAVAILABLE';
  marketDataFreshness?: 'FRESH' | 'CACHED' | 'STALE' | 'UNAVAILABLE';
  marketFetchedAt?: string | null;
}

export function median(values: readonly number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function normalized(value: string): string {
  const text = normalizeText(value).replace(/[^a-z0-9]/g, '');
  if (['motorina', 'diesel'].includes(text)) return 'diesel';
  if (['benzina', 'petrol', 'gasoline'].includes(text)) return 'petrol';
  if (['4x4', 'awd', '4wd', 'quattro'].includes(text)) return '4x4';
  if (['manuala', 'manual'].includes(text)) return 'manual';
  if (['automata', 'automatic', 'automat'].includes(text)) return 'automatic';
  if (['break', 'combi', 'estate', 'stationwagon'].includes(text)) return 'estate';
  if (['berlina', 'sedan', 'saloon'].includes(text)) return 'sedan';
  return text;
}
function compatible(a: string | null | undefined, b: string | null | undefined): boolean {
  return !a || !b || normalized(a) === normalized(b);
}
function engineCompatible(a: string | null, b: string | null): boolean {
  if (!a || !b) return true;
  const cc = (text: string): number | null => {
    const match = text.match(/^(\d{3,4})\s*cm[³3]$/);
    return match ? Number(match[1]) : null;
  };
  const left = cc(a);
  const right = cc(b);
  return left !== null && right !== null ? Math.abs(left - right) <= 100 : compatible(a, b);
}

export function matchesComparableLevel(a: CarListing, b: CarListing, level: ComparableLevel): boolean {
  if (!identityKey(a) || identityKey(a) !== identityKey(b)
    || (a.identityConfidence ?? 100) < 70 || (b.identityConfidence ?? 100) < 70
    || a.year === null || b.year === null || a.mileageKm === null || b.mileageKm === null) return false;
  if (Math.abs(a.year - b.year) > level + 1 || Math.abs(a.mileageKm - b.mileageKm) > 25000 * (level + 1)) return false;
  if (level <= 2 && (!a.fuel || !b.fuel || !compatible(a.fuel, b.fuel))) return false;
  if (level <= 2 && (!compatible(a.bodyType, b.bodyType) || !compatible(a.generation, b.generation) || !compatible(a.variant, b.variant))) return false;
  return level !== 1 || (compatible(a.drivetrain, b.drivetrain)
    && compatible(a.transmission, b.transmission) && engineCompatible(a.engine, b.engine)
    && (!a.engineCapacityCc || !b.engineCapacityCc || Math.abs(a.engineCapacityCc - b.engineCapacityCc) <= 100)
    && (!a.horsepower || !b.horsepower || Math.abs(a.horsepower - b.horsepower) <= Math.max(15, a.horsepower * 0.15)));
}

/** Missing attributes contribute no bonus; no configuration is inferred. */
export function comparableSimilarity(a: CarListing, b: CarListing): number {
  if (!identityKey(a) || identityKey(a) !== identityKey(b)) return 0;
  let score = 20;
  const same = (x: string | null | undefined, y: string | null | undefined, weight: number) => {
    if (x && y && compatible(x, y)) score += weight;
  };
  same(a.bodyType, b.bodyType, 12); same(a.fuel, b.fuel, 10);
  same(a.transmission, b.transmission, 8); same(a.drivetrain, b.drivetrain, 8);
  same(a.generation, b.generation, 4); same(a.variant, b.variant, 3);
  if (a.engine && b.engine && engineCompatible(a.engine, b.engine)) score += 8;
  else if (a.engineCapacityCc && b.engineCapacityCc && Math.abs(a.engineCapacityCc - b.engineCapacityCc) <= 100) score += 8;
  if (a.horsepower && b.horsepower && Math.abs(a.horsepower - b.horsepower) <= Math.max(15, a.horsepower * 0.15)) score += 5;
  if (a.year !== null && b.year !== null) score += 12 * Math.max(0, 1 - Math.abs(a.year - b.year) / 5);
  if (a.mileageKm !== null && b.mileageKm !== null) score += 10 * Math.max(0, 1 - Math.abs(a.mileageKm - b.mileageKm) / 125000);
  return Math.round(score);
}

export function areComparable(a: CarListing, b: CarListing): boolean {
  return matchesComparableLevel(a, b, 1);
}

export function hasUsableFullPrice(listing: CarListing): boolean {
  if (!Number.isFinite(listing.priceEur) || listing.priceEur < 300 || listing.priceEur > 500000) return false;
  const title = normalizeText(listing.title);
  const text = normalizeText(`${listing.title}. ${listing.description}`);
  if (/\bpret(?:ul)? (?:afisat )?(?:(?:este|reprezinta) )?(?:doar )?(?:avans|rata)\b/.test(text)
    || /^avans\b/.test(title)) return false;
  const amounts = [...text.matchAll(/\b(?:avans|rata(?: lunara)?)\s*[:=]?\s*(\d[\d .]*)\s*(?:eur|euro|€)/g),
    ...text.matchAll(/\b(\d[\d .]*)\s*(?:eur|euro|€)\s*(?:\/|pe)\s*luna\b/g)];
  return !amounts.some(match => Number(match[1]?.replace(/[ .]/g, '')) === listing.priceEur);
}

export function removePriceOutliers(listings: readonly CarListing[]): CarListing[] {
  if (listings.length < 5) return [...listings];
  const center = median(listings.map(car => car.priceEur))!;
  const mad = median(listings.map(car => Math.abs(car.priceEur - center)))!;
  // Pragul relativ împiedică eliminarea excesivă când multe prețuri sunt identice (MAD=0).
  const threshold = Math.max(3 * 1.4826 * mad, center * 0.35);
  return listings.filter(car => Math.abs(car.priceEur - center) <= threshold);
}

function confidence(listing: CarListing, comparables: readonly CarListing[], level: ComparableLevel, price: number): number {
  const count = comparables.length;
  const sample = count === 1 ? 12 : count === 2 ? 20 : count < 5 ? 35 : count < 8 ? 65 : count < 15 ? 85 : 95;
  const dispersion = median(comparables.map(car => Math.abs(car.priceEur - price)))! / price;
  const completeness = (car: CarListing): number => [car.fuel, car.engine, car.transmission, car.drivetrain].filter(Boolean).length / 4;
  const detail = 0.8 + 0.2 * Math.min(completeness(listing), comparables.reduce((sum, car) => sum + completeness(car), 0) / count);
  const identity = Math.min(listing.identityConfidence ?? 100,
    ...comparables.map(car => car.identityConfidence ?? 100)) / 100;
  return Math.round(sample * [1, 0.9, 0.7][level - 1]! * Math.max(0.3, 1 - dispersion * 1.5) * detail * identity);
}

export function estimatePrice(listing: CarListing, pool: readonly CarListing[]): PriceEstimate {
  const seen = new Set<string>();
  const urls = new Set<string>();
  const eligible = pool.filter(candidate => {
    const key = `${candidate.source}:${candidate.id}`;
    if (key === `${listing.source}:${listing.id}` || candidate.url === listing.url || seen.has(key) || urls.has(candidate.url)) return false;
    seen.add(key);
    urls.add(candidate.url);
    return hasUsableFullPrice(candidate) && analyzeListingRisk(candidate).riskScore < 35;
  });
  const diagnostics: LevelDiagnostic[] = [];
  let selected: CarListing[] = [];
  let selectedLevel: ComparableLevel | null = null;
  for (const level of [1, 2, 3] as const) {
    const matches = eligible.filter(candidate => matchesComparableLevel(listing, candidate, level))
      .sort((a, b) => comparableSimilarity(listing, b) - comparableSimilarity(listing, a) || a.id.localeCompare(b.id)).slice(0, 20);
    const retained = removePriceOutliers(matches);
    diagnostics.push({ level, matches: matches.length, retained: retained.length, outliersRemoved: matches.length - retained.length });
    // Dacă niciun nivel nu atinge 5, folosim cel mai mare eșantion; la egalitate preferăm nivelul strict.
    if (retained.length > selected.length || retained.length >= 5) { selected = retained; selectedLevel = level; }
    if (selected.length >= 5) break;
  }
  if (!selected.length || selectedLevel === null) return { estimatedMarketPrice: null, discountPercent: null,
    absoluteSavingEur: null, comparableCount: 0, confidenceScore: 0, comparableLevel: null, diagnostics,
    comparableSimilarityAverage: null, matchQuality: 'UNAVAILABLE', marketDataFreshness: 'UNAVAILABLE', marketFetchedAt: null };
  const price = median(selected.map(car => car.priceEur))!;
  const freshness = selected.some(car => car.marketDataFreshness === 'STALE') ? 'STALE'
    : selected.some(car => car.marketDataFreshness === 'CACHED') ? 'CACHED' : 'FRESH';
  const timestamps = selected.flatMap(car => car.marketFetchedAt ? [car.marketFetchedAt] : []).sort();
  const similarity = Math.round(selected.reduce((sum, car) => sum + comparableSimilarity(listing, car), 0) / selected.length);
  return { estimatedMarketPrice: Math.round(price), discountPercent: Math.round((price - listing.priceEur) / price * 1000) / 10,
    absoluteSavingEur: Math.round(price - listing.priceEur), comparableCount: selected.length,
    confidenceScore: Math.round(confidence(listing, selected, selectedLevel, price) * (freshness === 'STALE' ? 0.6 : 1)),
    comparableLevel: selectedLevel, diagnostics, comparableSimilarityAverage: similarity,
    matchQuality: selectedLevel === 1 ? 'EXACT' : selectedLevel === 2 ? 'GOOD' : 'RELAXED',
    marketDataFreshness: freshness, marketFetchedAt: timestamps[0] ?? null };
}
