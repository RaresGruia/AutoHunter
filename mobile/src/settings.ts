import type { CarSearchRequest } from './types';

export const DEFAULT_SETTINGS: Readonly<CarSearchRequest> = Object.freeze({ location: 'Deva', radiusKm: 100,
  minPriceEur: 2000, maxPriceEur: 10000, minYear: 2008, maxMileageKm: 250000, excludeDamaged: true, limit: 30 });
export const SETTINGS_KEY = 'autohunter:car-settings:v1';
export interface SettingsStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export function settingsError(s: CarSearchRequest): string | null {
  if (s.location !== 'Deva') return 'În această versiune căutăm în Deva și împrejurimi.';
  if (![s.radiusKm, s.minPriceEur, s.maxPriceEur, s.minYear, s.maxMileageKm, s.limit].every(Number.isFinite)) return 'Completează toate câmpurile cu numere valide.';
  if (s.radiusKm < 10 || s.radiusKm > 500) return 'Raza trebuie să fie între 10 și 500 km.';
  if (s.minPriceEur < 0 || s.maxPriceEur <= s.minPriceEur) return 'Bugetul maxim trebuie să fie mai mare decât cel minim, iar minimul cel puțin 0.';
  if (!Number.isInteger(s.minYear) || s.minYear < 1980 || s.minYear > new Date().getFullYear()) return 'Verifică anul minim: între 1980 și anul curent.';
  if (s.maxMileageKm < 0) return 'Kilometrii maximi nu pot fi negativi.';
  if (!Number.isInteger(s.limit) || s.limit < 1 || s.limit > 30) return 'Alege între 1 și 30 de rezultate.';
  if (typeof s.excludeDamaged !== 'boolean') return 'Verifică opțiunea pentru mașini avariate.';
  return null;
}

function decodeSettings(value: unknown): CarSearchRequest | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  if (typeof v.location !== 'string' || typeof v.excludeDamaged !== 'boolean'
    || typeof v.radiusKm !== 'number' || typeof v.minPriceEur !== 'number' || typeof v.maxPriceEur !== 'number'
    || typeof v.minYear !== 'number' || typeof v.maxMileageKm !== 'number' || typeof v.limit !== 'number') return null;
  const s: CarSearchRequest = { location: v.location, radiusKm: v.radiusKm, minPriceEur: v.minPriceEur,
    maxPriceEur: v.maxPriceEur, minYear: v.minYear, maxMileageKm: v.maxMileageKm,
    excludeDamaged: v.excludeDamaged, limit: v.limit };
  return settingsError(s) ? null : s;
}
export async function loadSettings(storage: SettingsStorage): Promise<{ settings: CarSearchRequest; recovered: boolean }> {
  const raw = await storage.getItem(SETTINGS_KEY);
  if (raw === null) return { settings: { ...DEFAULT_SETTINGS }, recovered: false };
  let decoded: CarSearchRequest | null = null;
  try { decoded = decodeSettings(JSON.parse(raw)); } catch { /* Invalid saved data falls back explicitly. */ }
  return { settings: decoded ?? { ...DEFAULT_SETTINGS }, recovered: decoded === null };
}
export async function saveSettings(storage: SettingsStorage, settings: CarSearchRequest): Promise<void> {
  const error = settingsError(settings);
  if (error) throw new Error(error);
  await storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}
export async function resetSettings(storage: SettingsStorage): Promise<CarSearchRequest> {
  const settings = { ...DEFAULT_SETTINGS };
  await saveSettings(storage, settings);
  return settings;
}
