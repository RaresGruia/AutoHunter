import type { TractorSearchSettings } from './types';
import type { SettingsStorage } from '../settings';
import type { JobStorage } from '../searchStorage';
export const TRACTOR_SETTINGS_KEY='autohunter:tractor-settings:v1';
export const TRACTOR_SEARCH_KEY='autohunter:tractor-currentSearchId:v1';
export const DEFAULT_TRACTOR_SETTINGS:TractorSearchSettings={location:'Deva',radiusKm:150,minPriceEur:2000,maxPriceEur:20000,
  minYear:null,minHorsepower:null,maxOperatingHours:null,require4x4:false,excludeBroken:true,limit:30};
export function tractorSettingsError(s:TractorSearchSettings):string|null {
  if(!s.location.trim() || s.location.length>120) return 'Locație invalidă.';
  if(!['deva','hunedoara','orastie','orăștie'].includes(s.location.trim().toLowerCase()) && !s.origin) return 'Alege Deva, Hunedoara sau Orăștie; pentru alte localități sunt necesare coordonate.';
  if(s.origin && (!Number.isFinite(s.origin.latitude)||!Number.isFinite(s.origin.longitude)||Math.abs(s.origin.latitude)>90||Math.abs(s.origin.longitude)>180)) return 'Coordonate invalide.';
  if(![s.radiusKm,s.minPriceEur,s.maxPriceEur,s.limit].every(Number.isFinite)||s.radiusKm<10||s.radiusKm>500
    ||s.minPriceEur<0||s.maxPriceEur<=s.minPriceEur||![10,20,30].includes(s.limit)) return 'Verifică raza, bugetul și numărul de rezultate.';
  if(s.minYear!==null&&(!Number.isInteger(s.minYear)||s.minYear<1900||s.minYear>new Date().getFullYear())) return 'An minim invalid.';
  if(s.minHorsepower!==null&&(!Number.isFinite(s.minHorsepower)||s.minHorsepower<0||s.minHorsepower>1000)) return 'CP minim invalid.';
  if(s.maxOperatingHours!==null&&(!Number.isFinite(s.maxOperatingHours)||s.maxOperatingHours<0)) return 'Ore maxime invalide.';
  if(typeof s.require4x4!=='boolean'||typeof s.excludeBroken!=='boolean') return 'Opțiuni tractor invalide.';
  return null;
}
export async function loadTractorSettings(storage:SettingsStorage):Promise<{settings:TractorSearchSettings;recovered:boolean}> {
  const raw=await storage.getItem(TRACTOR_SETTINGS_KEY);
  if(raw===null)return {settings:{...DEFAULT_TRACTOR_SETTINGS},recovered:false};
  try {
    const input:unknown=JSON.parse(raw);
    if(!input||typeof input!=='object')throw Error();
    const r=input as Record<string,unknown>;
    if(typeof r.location!=='string'||typeof r.radiusKm!=='number'||typeof r.minPriceEur!=='number'||typeof r.maxPriceEur!=='number'
      ||typeof r.require4x4!=='boolean'||typeof r.excludeBroken!=='boolean'||typeof r.limit!=='number'
      ||![r.minYear,r.minHorsepower,r.maxOperatingHours].every(v=>v===null||typeof v==='number'))throw Error();
    const settings:TractorSearchSettings={location:r.location,radiusKm:r.radiusKm,minPriceEur:r.minPriceEur,maxPriceEur:r.maxPriceEur,
      minYear:r.minYear as number|null,minHorsepower:r.minHorsepower as number|null,maxOperatingHours:r.maxOperatingHours as number|null,
      require4x4:r.require4x4,excludeBroken:r.excludeBroken,limit:r.limit};
    if(r.origin!==undefined){
      if(!r.origin||typeof r.origin!=='object')throw Error();
      const origin=r.origin as Record<string,unknown>;
      if(typeof origin.latitude!=='number'||typeof origin.longitude!=='number')throw Error();
      settings.origin={latitude:origin.latitude,longitude:origin.longitude};
    }
    if(tractorSettingsError(settings))throw Error();
    return {settings,recovered:false};
  }catch{return {settings:{...DEFAULT_TRACTOR_SETTINGS},recovered:true};}
}
export async function saveTractorSettings(storage:SettingsStorage,settings:TractorSearchSettings):Promise<void>{
  const error=tractorSettingsError(settings);if(error)throw Error(error);
  await storage.setItem(TRACTOR_SETTINGS_KEY,JSON.stringify(settings));
}
/** Reuses the existing search-session storage functions with a category-specific key. */
export function tractorJobStorage(storage:JobStorage):JobStorage{return {
  getItem:()=>storage.getItem(TRACTOR_SEARCH_KEY),setItem:(_key,value)=>storage.setItem(TRACTOR_SEARCH_KEY,value),removeItem:()=>storage.removeItem(TRACTOR_SEARCH_KEY),
};}
