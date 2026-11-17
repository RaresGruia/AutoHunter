import {listingDistanceKm} from '../analysis/distance.js';
import {toolOrigin,validateToolSettings} from './settings.js';
import {validateToolListing} from './validation.js';
import {toolIdentity} from './identity.js';
import {toolRisk} from './risk.js';
import {analyzeTool} from './analysis.js';
import type {ToolListing,ToolSourceAdapter,ToolSearchSettings,ToolSearchResponse} from './types.js';
export async function searchTools(settings:ToolSearchSettings,source:ToolSourceAdapter):Promise<ToolSearchResponse>{
  validateToolSettings(settings);const batch=await source.searchLocal(settings);
  const normalize=(listings:ToolListing[])=>listings.map(listing=>{validateToolListing(listing);return {...listing,...toolIdentity(listing)};});
  const ids=new Set<string>(),urls=new Set<string>();
  const local=normalize(batch.listings).filter(c=>{const key=`${c.source}:${c.id}`;if(ids.has(key)||urls.has(c.url))return false;ids.add(key);urls.add(c.url);return true;});
  const market=[...local,...normalize(await source.searchComparables())];
  const results=local.flatMap(listing=>{
    const distance=listingDistanceKm(toolOrigin(settings)!,listing),risk=toolRisk(listing);
    if(listing.priceEur<settings.minPriceEur||listing.priceEur>settings.maxPriceEur||(distance!==null&&distance>settings.radiusKm)
      ||(settings.condition!=='ALL'&&listing.condition!==settings.condition)||(settings.categories!=='ALL'&&!settings.categories.includes(listing.category))
      ||(settings.excludeBroken&&(listing.condition==='FOR_PARTS'||Math.max(risk.mechanicalRisk,risk.electricalRisk,risk.batteryRisk)>=70)))return [];
    return [analyzeTool(listing,market,distance)];
  }).sort((a,b)=>b.scores.opportunity-a.scores.opportunity||b.price.confidence-a.price.confidence||a.listing.id.localeCompare(b.listing.id));
  return {meta:{mode:batch.mode,category:'tools',location:settings.location,radiusKm:settings.radiusKm,localFetched:local.length,
    eligible:results.length,returnedResults:Math.min(results.length,settings.limit),limit:settings.limit,warnings:batch.warnings},results:results.slice(0,settings.limit)};
}
