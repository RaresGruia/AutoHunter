import { normalizeText } from '../analysis/text.js';
import { TOOL_CATEGORIES, TOOL_CONDITIONS, type ToolSearchSettings } from './types.js';

export const toolLocations = { deva: {latitude:45.878,longitude:22.914}, hunedoara: {latitude:45.75,longitude:22.9}, orastie: {latitude:45.842,longitude:23.2} };
export const defaultToolSettings: ToolSearchSettings = { location:'Deva',radiusKm:100,minPriceEur:20,maxPriceEur:3000,
  condition:'ALL',categories:'ALL',excludeBroken:true,limit:30 };
export function toolOrigin(s: ToolSearchSettings) { return s.origin ?? toolLocations[normalizeText(s.location) as keyof typeof toolLocations]; }
export function validateToolSettings(s: ToolSearchSettings): void {
  const origin = toolOrigin(s);
  if (!s.location.trim() || s.location.length>120 || !origin || !Number.isFinite(origin.latitude) || !Number.isFinite(origin.longitude)
    || Math.abs(origin.latitude)>90 || Math.abs(origin.longitude)>180
    || ![s.radiusKm,s.minPriceEur,s.maxPriceEur,s.limit].every(Number.isFinite) || s.radiusKm<10 || s.radiusKm>500
    || s.minPriceEur<0 || s.maxPriceEur<=s.minPriceEur || ![10,20,30].includes(s.limit) || typeof s.excludeBroken!=='boolean'
    || (s.condition!=='ALL' && !TOOL_CONDITIONS.includes(s.condition))
    || (s.categories!=='ALL' && (!Array.isArray(s.categories) || !s.categories.length || s.categories.length>TOOL_CATEGORIES.length
      || new Set(s.categories).size!==s.categories.length || s.categories.some(c=>!TOOL_CATEGORIES.includes(c))))) {
    throw new Error('Setări scule invalide. Pentru o localitate necunoscută sunt necesare coordonate origin.');
  }
}
