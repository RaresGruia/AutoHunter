import type { SearchSettings } from '../models/SearchSettings.js';

export const defaultSearchSettings: SearchSettings = {
  location: 'Deva',
  origin: { latitude: 45.878, longitude: 22.914 },
  radiusKm: 100,
  minPriceEur: 2000,
  maxPriceEur: 10000,
  minYear: 2008,
  maxMileageKm: 250000,
  excludeDamaged: true,
  registrationPenalty: 3,
};

export function validateSettings(settings: SearchSettings): void {
  const numbers = [settings.radiusKm, settings.minPriceEur, settings.maxPriceEur,
    settings.minYear, settings.maxMileageKm, settings.origin.latitude, settings.origin.longitude];
  if (!numbers.every(Number.isFinite) || settings.radiusKm <= 0 || settings.minPriceEur < 0
    || settings.maxPriceEur < settings.minPriceEur || settings.maxMileageKm < 0
    || !Number.isInteger(settings.minYear) || settings.minYear < 1886
    || settings.minYear > new Date().getFullYear() + 1
    || Math.abs(settings.origin.latitude) > 90 || Math.abs(settings.origin.longitude) > 180
    || !settings.location.trim() || typeof settings.excludeDamaged !== 'boolean'
    || (settings.registrationPenalty !== undefined && (!Number.isFinite(settings.registrationPenalty) || settings.registrationPenalty < 0 || settings.registrationPenalty > 20))) {
    throw new Error('Setări de căutare invalide. Verifică bugetul, anul, raza și coordonatele.');
  }
}
