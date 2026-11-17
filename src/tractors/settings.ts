import type { TractorSearchSettings } from './types.js';
import { normalizeText } from '../analysis/text.js';
export const tractorLocations = {
  deva: { latitude: 45.878, longitude: 22.914 }, hunedoara: { latitude: 45.75, longitude: 22.9 },
  orastie: { latitude: 45.842, longitude: 23.2 },
};
export const defaultTractorSettings: TractorSearchSettings = {
  location: 'Deva', radiusKm: 150, minPriceEur: 2000, maxPriceEur: 20000, minYear: null,
  minHorsepower: null, maxOperatingHours: null, require4x4: false, excludeBroken: true, limit: 30,
};
export function tractorOrigin(settings: TractorSearchSettings) {
  return settings.origin ?? tractorLocations[normalizeText(settings.location) as keyof typeof tractorLocations];
}
export function validateTractorSettings(s: TractorSearchSettings): void {
  const origin = tractorOrigin(s);
  if (!s.location.trim() || s.location.length > 120 || !origin || !Number.isFinite(origin.latitude) || !Number.isFinite(origin.longitude)
    || Math.abs(origin.latitude) > 90 || Math.abs(origin.longitude) > 180
    || ![s.radiusKm, s.minPriceEur, s.maxPriceEur, s.limit].every(Number.isFinite)
    || s.radiusKm < 10 || s.radiusKm > 500 || s.minPriceEur < 0 || s.maxPriceEur <= s.minPriceEur
    || ![10,20,30].includes(s.limit)
    || (s.minYear !== null && (!Number.isInteger(s.minYear) || s.minYear < 1900 || s.minYear > new Date().getFullYear()))
    || (s.minHorsepower !== null && (!Number.isFinite(s.minHorsepower) || s.minHorsepower < 0 || s.minHorsepower > 1000))
    || (s.maxOperatingHours !== null && (!Number.isFinite(s.maxOperatingHours) || s.maxOperatingHours < 0))
    || typeof s.require4x4 !== 'boolean' || typeof s.excludeBroken !== 'boolean') throw new Error('INVALID_REQUEST: setări tractor invalide sau coordonate necesare pentru localitate.');
}
