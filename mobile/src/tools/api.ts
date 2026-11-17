import { imageMetadata } from '../../../src/models/ListingImages';
import {apiBaseUrl} from '../apiBaseUrl';
import {apiDecode as d,ApiClientError,createCategoryApiClient,mapMode} from '../apiClient';
import {TOOL_CATEGORIES,TOOL_CONDITIONS,POWER_SOURCES} from '../../../src/tools/types';
import type {ToolSearchResponse,ToolSearchSettings,ToolResult} from './types';
function enumeration<T extends string>(value:unknown,allowed:readonly T[]):T {
  const found=allowed.find(item=>item===value);if(found===undefined)throw new ApiClientError('INVALID_RESPONSE');return found;
}
export function mapToolResponse(value:unknown):ToolSearchResponse {
  const root=d.record(value),meta=d.record(root.meta);if(meta.category!=='tools')throw new ApiClientError('INVALID_RESPONSE');
  return {meta:{mode:mapMode(meta.mode),category:'tools',location:d.text(meta.location),radiusKm:d.number(meta.radiusKm),localFetched:d.number(meta.localFetched),
    eligible:d.number(meta.eligible),returnedResults:d.number(meta.returnedResults),limit:d.number(meta.limit),warnings:d.texts(meta.warnings)},results:d.array(root.results).map(mapTool)};
}
function mapTool(value:unknown):ToolResult {
  const r=d.record(value),c=d.record(r.listing),p=d.record(r.price),k=d.record(r.package),s=d.record(r.scores),risk=d.record(r.risks);
  return {listing:{id:d.text(c.id),source:d.text(c.source),url:d.text(c.url),title:d.text(c.title),brand:d.nullableText(c.brand),model:d.nullableText(c.model),
    identityConfidence:d.number(c.identityConfidence),category:enumeration(c.category,TOOL_CATEGORIES),subcategory:d.nullableText(c.subcategory),priceEur:d.number(c.priceEur),
    condition:enumeration(c.condition,TOOL_CONDITIONS),powerSource:enumeration(c.powerSource,POWER_SOURCES),powerWatts:d.nullableNumber(c.powerWatts),voltageV:d.nullableNumber(c.voltageV),
    batteryAh:d.nullableNumber(c.batteryAh),engineCc:d.nullableNumber(c.engineCc),horsepower:d.nullableNumber(c.horsepower),batteriesIncluded:d.nullableNumber(c.batteriesIncluded),
    chargerIncluded:c.chargerIncluded===null?null:d.boolean(c.chargerIncluded),accessories:d.texts(c.accessories),manufacturingYear:d.nullableNumber(c.manufacturingYear),
    locationText:d.text(c.locationText),latitude:d.nullableNumber(c.latitude),longitude:d.nullableNumber(c.longitude),description:d.text(c.description),imageUrls:d.texts(c.imageUrls),
    ...(c.imageUrl===undefined?{}:{imageUrl:d.nullableText(c.imageUrl)}),
    ...(c.thumbnailUrl===undefined?{}:{thumbnailUrl:d.nullableText(c.thumbnailUrl)}), ...imageMetadata(c),
    sellerType:d.nullableText(c.sellerType),publishedAt:d.nullableText(c.publishedAt),synthetic:d.boolean(c.synthetic)},
    package:{type:enumeration(k.type,['BODY_ONLY','TOOL_PLUS_BATTERY','KIT','UNKNOWN']),batteries:d.nullableNumber(k.batteries),batteryAh:d.nullableNumber(k.batteryAh),
      charger:k.charger===null?null:d.boolean(k.charger),caseIncluded:d.boolean(k.caseIncluded),completeness:d.number(k.completeness),conflict:d.boolean(k.conflict),warnings:d.texts(k.warnings)},
    price:{estimatedMarketPrice:d.nullableNumber(p.estimatedMarketPrice),discountPercent:d.nullableNumber(p.discountPercent),potentialSavingEur:d.nullableNumber(p.potentialSavingEur),
      comparableCount:d.number(p.comparableCount),confidence:d.number(p.confidence),similarityAverage:d.nullableNumber(p.similarityAverage),matchQuality:enumeration(p.matchQuality,['EXACT','GOOD','RELAXED','UNAVAILABLE'])},
    scores:{deal:d.number(s.deal),toolQuality:d.number(s.toolQuality),flipPotential:d.number(s.flipPotential),opportunity:d.number(s.opportunity)},
    classification:enumeration(r.classification,['GREAT_DEAL','GOOD_DEAL','INTERESTING','FAIR','POOR_VALUE','NEEDS_VERIFICATION']),
    risks:{mechanicalRisk:d.number(risk.mechanicalRisk),electricalRisk:d.number(risk.electricalRisk),batteryRisk:d.number(risk.batteryRisk),cosmeticRisk:d.number(risk.cosmeticRisk),
      authenticityRisk:d.number(risk.authenticityRisk),dataRisk:d.number(risk.dataRisk),overall:d.number(risk.overall),dataQuality:d.number(risk.dataQuality),warnings:d.texts(risk.warnings)},
    positiveReasons:d.texts(r.positiveReasons),qualityReasons:d.texts(r.qualityReasons),warnings:d.texts(r.warnings),distanceKm:d.nullableNumber(r.distanceKm)};
}
export const toolsApi=createCategoryApiClient<ToolSearchSettings,ToolSearchResponse>(apiBaseUrl(),'/api/tools/search',mapToolResponse);
