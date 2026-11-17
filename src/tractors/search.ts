import type { TractorSearchSettings, TractorSearchResponse, TractorSourceAdapter } from './types.js';
import { validateTractorSettings, tractorOrigin } from './settings.js';
import { analyzeTractor } from './analysis.js';
import { tractorRisk } from './risk.js';
import { tractorIdentity } from './identity.js';
import { listingDistanceKm } from '../analysis/distance.js';
import { validateTractorListing } from './validation.js';
export async function searchTractors(settings: TractorSearchSettings, source: TractorSourceAdapter): Promise<TractorSearchResponse> {
  validateTractorSettings(settings);
  const batch = await source.searchLocal(settings), ids = new Set<string>(), urls = new Set<string>();
  batch.listings.forEach(validateTractorListing);
  const local = batch.listings.map(c=>({...c,...tractorIdentity(c)})).filter(c=>{
    const key = `${c.source}:${c.id}`;
    if (ids.has(key)||urls.has(c.url)||!Number.isFinite(c.priceEur)||c.priceEur<=0) return false;
    ids.add(key);urls.add(c.url);return true;
  });
  const market = await source.searchComparables();
  market.forEach(validateTractorListing);
  const pool = [...local, ...market.map(c=>({...c,...tractorIdentity(c)}))];
  const eligible = local.flatMap(listing=>{
    const distance = listingDistanceKm(tractorOrigin(settings)!,listing), risk = tractorRisk(listing);
    if (listing.priceEur<settings.minPriceEur || listing.priceEur>settings.maxPriceEur
      || (settings.minYear!==null && (listing.year===null || listing.year<settings.minYear))
      || (settings.minHorsepower!==null && (listing.horsepower===null || listing.horsepower<settings.minHorsepower))
      || (settings.maxOperatingHours!==null && (listing.operatingHours===null || listing.operatingHours>settings.maxOperatingHours))
      || (settings.require4x4 && listing.drivetrain!=='4X4') || (distance!==null && distance>settings.radiusKm)
      || (settings.excludeBroken && Math.max(risk.mechanical,risk.hydraulic,risk.transmission)>=70)) return [];
    return [analyzeTractor(listing,pool,distance)];
  }).sort((a,b)=>b.scores.opportunity-a.scores.opportunity || b.price.confidence-a.price.confidence || a.listing.id.localeCompare(b.listing.id));
  return { meta: { mode: batch.mode, category:'tractors', location:settings.location, radiusKm:settings.radiusKm,
    localFetched:local.length, eligible:eligible.length, returnedResults:Math.min(eligible.length,settings.limit), limit:settings.limit, warnings:batch.warnings }, results:eligible.slice(0,settings.limit) };
}
