import type { Coordinates } from '../models/SearchSettings.js';
export interface LocatedListing { latitude?: number | null; longitude?: number | null }

export function isCoordinates(value: Coordinates): boolean {
  return Number.isFinite(value.latitude) && Number.isFinite(value.longitude)
    && Math.abs(value.latitude) <= 90 && Math.abs(value.longitude) <= 180;
}

export function haversineKm(from: Coordinates, to: Coordinates): number {
  if (!isCoordinates(from) || !isCoordinates(to)) throw new Error('Coordonate invalide.');
  const rad = (n: number): number => n * Math.PI / 180;
  const a = Math.sin(rad(to.latitude - from.latitude) / 2) ** 2
    + Math.cos(rad(from.latitude)) * Math.cos(rad(to.latitude))
    * Math.sin(rad(to.longitude - from.longitude) / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(Math.min(1, a)), Math.sqrt(Math.max(0, 1 - a)));
}

export function listingDistanceKm(origin: Coordinates, listing: LocatedListing): number | null {
  if (listing.latitude == null || listing.longitude == null) return null;
  const point = { latitude: listing.latitude, longitude: listing.longitude };
  return isCoordinates(point) ? haversineKm(origin, point) : null;
}
