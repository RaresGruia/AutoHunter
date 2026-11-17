import { imageMetadata } from '../../../src/models/ListingImages';
import {apiBaseUrl} from '../apiBaseUrl';
import { apiDecode as d, createCategoryApiClient, mapMode, ApiClientError } from '../apiClient';
import type { TractorSearchResponse, TractorSearchSettings, TractorResult } from './types';

export function mapTractorResponse(value: unknown): TractorSearchResponse {
  const root=d.record(value), meta=d.record(root.meta);
  if(meta.category!=='tractors') throw new ApiClientError('INVALID_RESPONSE');
  return {meta:{mode:mapMode(meta.mode),category:'tractors',location:d.text(meta.location),radiusKm:d.number(meta.radiusKm),
    localFetched:d.number(meta.localFetched),eligible:d.number(meta.eligible),returnedResults:d.number(meta.returnedResults),limit:d.number(meta.limit),warnings:d.texts(meta.warnings)},
    results:d.array(root.results).map(mapTractor)};
}
function mapTractor(value:unknown):TractorResult {
  const r=d.record(value), c=d.record(r.listing), p=d.record(r.price), s=d.record(r.scores), risk=d.record(r.risks);
  const drive=d.text(c.drivetrain), classification=d.text(r.classification);
  if(drive!=='4X4'&&drive!=='4X2'&&drive!=='UNKNOWN') throw new ApiClientError('INVALID_RESPONSE');
  if(classification!=='GREAT_DEAL'&&classification!=='GOOD_DEAL'&&classification!=='INTERESTING'&&classification!=='FAIR'&&classification!=='POOR_VALUE'&&classification!=='NEEDS_VERIFICATION') throw new ApiClientError('INVALID_RESPONSE');
  return {listing:{id:d.text(c.id),source:d.text(c.source),url:d.text(c.url),title:d.text(c.title),make:d.nullableText(c.make),model:d.nullableText(c.model),
    identityConfidence:d.number(c.identityConfidence),year:d.nullableNumber(c.year),priceEur:d.number(c.priceEur),horsepower:d.nullableNumber(c.horsepower),
    engine:d.nullableText(c.engine),fuel:d.nullableText(c.fuel),drivetrain:drive,operatingHours:d.nullableNumber(c.operatingHours),
    transmission:d.nullableText(c.transmission),cabin:d.nullableText(c.cabin),frontLoader:c.frontLoader===null?null:d.boolean(c.frontLoader),
    registrationStatus:d.nullableText(c.registrationStatus),documents:d.nullableText(c.documents),locationText:d.text(c.locationText),
    latitude:d.nullableNumber(c.latitude),longitude:d.nullableNumber(c.longitude),description:d.text(c.description),imageUrls:d.texts(c.imageUrls),
    ...(c.imageUrl===undefined?{}:{imageUrl:d.nullableText(c.imageUrl)}),
    ...(c.thumbnailUrl===undefined?{}:{thumbnailUrl:d.nullableText(c.thumbnailUrl)}), ...imageMetadata(c),
    sellerType:d.nullableText(c.sellerType),publishedAt:d.nullableText(c.publishedAt)},
    price:{estimatedMarketEur:d.nullableNumber(p.estimatedMarketEur),discountPercent:d.nullableNumber(p.discountPercent),potentialSavingEur:d.nullableNumber(p.potentialSavingEur),
      comparableCount:d.number(p.comparableCount),confidence:d.number(p.confidence),similarityAverage:d.nullableNumber(p.similarityAverage)},
    scores:{deal:d.number(s.deal),tractorQuality:d.number(s.tractorQuality),flipPotential:d.number(s.flipPotential),opportunity:d.number(s.opportunity)},
    risks:{mechanical:d.number(risk.mechanical),hydraulic:d.number(risk.hydraulic),transmission:d.number(risk.transmission),cosmetic:d.number(risk.cosmetic),legal:d.number(risk.legal),data:d.number(risk.data),
      overall:d.number(risk.overall),dataQuality:d.number(risk.dataQuality),seriousConflict:d.boolean(risk.seriousConflict),warnings:d.texts(risk.warnings)},
    classification,positiveReasons:d.texts(r.positiveReasons),qualityReasons:d.texts(r.qualityReasons),warnings:d.texts(r.warnings),distanceKm:d.nullableNumber(r.distanceKm)};
}
export const tractorApi = createCategoryApiClient<TractorSearchSettings,TractorSearchResponse>(apiBaseUrl(),'/api/tractors/search',mapTractorResponse);
