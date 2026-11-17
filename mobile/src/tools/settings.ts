import {defaultToolSettings,validateToolSettings} from '../../../src/tools/settings';
import type {ToolSearchSettings} from './types';
import type {JobStorage} from '../searchStorage';
import type {SettingsStorage} from '../settings';
export const DEFAULT_TOOL_SETTINGS:ToolSearchSettings={...defaultToolSettings};
export const TOOL_SETTINGS_KEY='autohunter:tool-settings:v1';
export const TOOL_SEARCH_KEY='autohunter:tool-currentSearchId:v1';
export function toolSettingsError(settings:ToolSearchSettings):string|null {
  try{validateToolSettings(settings);return null;}catch{return 'Verifică zona, raza, bugetul și opțiunile. Pentru alte localități sunt necesare coordonate.';}
}
export async function saveToolSettings(storage:SettingsStorage,settings:ToolSearchSettings):Promise<void>{
  validateToolSettings(settings);await storage.setItem(TOOL_SETTINGS_KEY,JSON.stringify(settings));
}
export async function loadToolSettings(storage:SettingsStorage):Promise<{settings:ToolSearchSettings;recovered:boolean}>{
  const raw=await storage.getItem(TOOL_SETTINGS_KEY);if(raw===null)return {settings:{...DEFAULT_TOOL_SETTINGS},recovered:false};
  try{
    const r:unknown=JSON.parse(raw);if(!r||typeof r!=='object')throw Error();
    const value=r as Record<string,unknown>;
    if(typeof value.location!=='string'||typeof value.radiusKm!=='number'||typeof value.minPriceEur!=='number'||typeof value.maxPriceEur!=='number'
      ||typeof value.condition!=='string'||typeof value.excludeBroken!=='boolean'||typeof value.limit!=='number')throw Error();
    // Full validation rejects unknown enums, malformed arrays and coordinates.
    const candidate=value as unknown as ToolSearchSettings;validateToolSettings(candidate);
    const settings:ToolSearchSettings={location:candidate.location,radiusKm:candidate.radiusKm,minPriceEur:candidate.minPriceEur,maxPriceEur:candidate.maxPriceEur,
      condition:candidate.condition,categories:candidate.categories==='ALL'?'ALL':[...candidate.categories],excludeBroken:candidate.excludeBroken,limit:candidate.limit,
      ...(candidate.origin?{origin:{latitude:candidate.origin.latitude,longitude:candidate.origin.longitude}}:{})};
    return {settings,recovered:false};
  }catch{return {settings:{...DEFAULT_TOOL_SETTINGS},recovered:true};}
}
export function toolJobStorage(storage:JobStorage):JobStorage{return {
  getItem:()=>storage.getItem(TOOL_SEARCH_KEY),setItem:(_key,value)=>storage.setItem(TOOL_SEARCH_KEY,value),removeItem:()=>storage.removeItem(TOOL_SEARCH_KEY),
};}
