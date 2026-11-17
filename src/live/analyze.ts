import { normalizeListing, deduplicate } from '../discovery/normalize.js';
import type { CommonListing, SourceDescriptor } from '../discovery/SourceAdapter.js';
import type { CarListing } from '../models/CarListing.js';
import type { TractorListing } from '../tractors/types.js';
import { TOOL_CATEGORIES, TOOL_CONDITIONS, POWER_SOURCES, type ToolListing } from '../tools/types.js';
import { tractorIdentity } from '../tractors/identity.js';
import { toolIdentity } from '../tools/identity.js';
import { estimatePrice } from '../analysis/priceEstimator.js';
import { analyzeListingRisk } from '../analysis/listingRisk.js';
import { analyzeDataConsistency } from '../analysis/dataConsistency.js';
import { calculateDealScore } from '../analysis/dealScore.js';
import { calculateFlipPotential } from '../analysis/flipPotential.js';
import { defaultSearchSettings } from '../config/searchSettings.js';
import { analyzeTractor } from '../tractors/analysis.js';
import { analyzeTool } from '../tools/analysis.js';
import type { LiveAnalysis, LiveOffer, ManualOffer } from './types.js';

export const insufficient = (
  reason = 'Lipsesc date verificate despre ofertă și comparabile.',
): LiveAnalysis => ({
  status: 'INSUFFICIENT_DATA',
  dealScore: null,
  flipPotential: null,
  overallRisk: null,
  estimatedMarketEur: null,
  savingEur: null,
  discountPercent: null,
  confidence: null,
  comparableCount: 0,
  reasons: [reason],
  risks: [],
  comparableUrls: [],
});
const descriptor: SourceDescriptor = {
  id: 'manual-real',
  name: 'Import manual autorizat',
  kind: 'MANUAL_IMPORT',
  status: 'AVAILABLE',
  categories: ['cars', 'tractors', 'tools'],
  configured: true,
  transport: 'LOCAL',
  permission: {
    dataUse: true,
    imageDisplay: true,
    reference: 'Declarații individuale de drepturi la import',
  },
  note: 'Date introduse de utilizator, fără acces automat la URL.',
};
export function manualLiveOffer(row: ManualOffer, now = Date.now()): LiveOffer {
  const verifiedTime = Date.parse(row.lastVerifiedAt ?? '');
  const stale =
    row.availability === 'USER_CONFIRMED' &&
    (!Number.isFinite(verifiedTime) || verifiedTime > now || now - verifiedTime > 24 * 3600000);
  let normalized: CommonListing | null = null;
  if (row.priceEur !== null)
    normalized = normalizeListing(
      {
        id: row.id,
        category: row.category,
        title: row.title,
        originalUrl: row.originalUrl,
        make: row.make,
        model: row.model,
        price: { amount: row.priceEur, currency: 'EUR' },
        location: {
          country: 'RO',
          text: typeof row.attributes.location === 'string' ? row.attributes.location : null,
          latitude: null,
          longitude: null,
        },
        imageUrls: row.imageUrls,
        imageRights: row.imageRights,
        imagePresentation: 'ACTUAL_ITEM',
        attributes: row.attributes,
      },
      descriptor,
      row.importedAt,
    );
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    originalUrl: row.originalUrl,
    publisher: new URL(row.originalUrl).hostname,
    snippet: '',
    discoveredAt: row.importedAt,
    origin: 'MANUAL',
    availability: stale ? 'STALE' : row.availability,
    lastVerifiedAt: row.lastVerifiedAt,
    priceEur: row.priceEur,
    make: row.make,
    model: row.model,
    attributes: row.attributes,
    imageUrls: row.imageUrls,
    imageRights: row.imageRights,
    imagePresentation: 'ACTUAL_ITEM',
    ...(row.imageAttributions ? { imageAttributions: row.imageAttributions } : {}),
    photoProvenance: row.imageUrls.map((imageUrl) => ({
      imageUrl,
      listingId: row.id,
      originalUrl: row.originalUrl,
      method: 'MANUAL_PERMISSION' as const,
      evidence: row.imageRights.evidence ?? '',
    })),
    normalized,
    analysis: insufficient(),
  };
}
const n = (a: CommonListing['metadata']['attributes'], key: string) =>
  typeof a[key] === 'number' ? a[key] : null;
const s = (a: CommonListing['metadata']['attributes'], key: string) =>
  typeof a[key] === 'string' ? a[key] : null;
function car(c: CommonListing): CarListing {
  const a = c.metadata.attributes;
  return {
    id: c.id,
    source: c.sourceId,
    url: c.originalUrl!,
    title: c.title,
    make: c.make,
    model: c.model,
    priceEur: c.priceEur,
    year: n(a, 'year'),
    mileageKm: n(a, 'mileageKm'),
    fuel: s(a, 'fuel'),
    transmission: s(a, 'transmission'),
    engine: s(a, 'engine'),
    engineCapacityCc: n(a, 'engineCapacityCc'),
    drivetrain: s(a, 'drivetrain'),
    locationText: c.location.text ?? '',
    latitude: null,
    longitude: null,
    description: s(a, 'description') ?? '',
    imageUrls: c.imageUrls,
    marketDataFreshness: 'FRESH',
    marketFetchedAt: c.metadata.fetchedAt,
  };
}
function tractor(c: CommonListing): TractorListing {
  const a = c.metadata.attributes,
    identity = tractorIdentity({ title: c.title, make: c.make, model: c.model });
  return {
    id: c.id,
    source: c.sourceId,
    url: c.originalUrl!,
    title: c.title,
    ...identity,
    priceEur: c.priceEur,
    year: n(a, 'year'),
    horsepower: n(a, 'horsepower'),
    engine: s(a, 'engine'),
    fuel: s(a, 'fuel'),
    drivetrain: a.drivetrain === '4X4' || a.drivetrain === '4X2' ? a.drivetrain : 'UNKNOWN',
    operatingHours: n(a, 'operatingHours'),
    transmission: s(a, 'transmission'),
    cabin: null,
    frontLoader: null,
    registrationStatus: null,
    documents: null,
    locationText: c.location.text ?? '',
    latitude: null,
    longitude: null,
    description: s(a, 'description') ?? '',
    sellerType: null,
    publishedAt: null,
    imageUrls: c.imageUrls,
  };
}
function tool(c: CommonListing): ToolListing {
  const a = c.metadata.attributes,
    category = TOOL_CATEGORIES.find((v) => v === a.subcategory) ?? 'OTHER',
    identity = toolIdentity({ title: c.title, brand: c.make, model: c.model, category });
  return {
    id: c.id,
    source: c.sourceId,
    url: c.originalUrl!,
    title: c.title,
    ...identity,
    subcategory: null,
    priceEur: c.priceEur,
    condition: TOOL_CONDITIONS.find((v) => v === a.condition) ?? 'UNKNOWN',
    powerSource: POWER_SOURCES.find((v) => v === a.powerSource) ?? 'UNKNOWN',
    powerWatts: n(a, 'powerWatts'),
    voltageV: n(a, 'voltageV'),
    batteryAh: n(a, 'batteryAh'),
    engineCc: n(a, 'engineCc'),
    horsepower: n(a, 'horsepower'),
    batteriesIncluded: n(a, 'batteriesIncluded'),
    chargerIncluded: typeof a.chargerIncluded === 'boolean' ? a.chargerIncluded : null,
    accessories: (s(a, 'accessories') ?? '')
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean),
    manufacturingYear: n(a, 'manufacturingYear'),
    locationText: c.location.text ?? '',
    latitude: null,
    longitude: null,
    description: s(a, 'description') ?? '',
    imageUrls: c.imageUrls,
    sellerType: null,
    publishedAt: null,
    synthetic: false,
  };
}
export function analyzeLiveOffers(offers: LiveOffer[]): LiveOffer[] {
  const current = (row: LiveOffer) =>
    row.origin === 'MANUAL' && !('mode' in row) && row.normalized && row.availability === 'USER_CONFIRMED';
  const verified = offers.filter(current);
  const groups = deduplicate(verified.map((row) => row.normalized!));
  const pool = groups.filter((group) => !group.priceConflict).map((group) => group.listing);
  return offers.map((row) => {
    const c = row.normalized;
    if (!c || !current(row))
      return {
        ...row,
        analysis: insufficient('Disponibilitatea și datele ofertei nu sunt confirmate recent de utilizator.'),
      };
    if (!c.make || !c.model)
      return { ...row, analysis: insufficient('Marca și modelul sunt necesare pentru comparații.') };
    if (
      groups.find((group) => group.origins.some((origin) => origin.originalUrl === c.originalUrl))
        ?.priceConflict
    )
      return { ...row, analysis: insufficient('Prețuri contradictorii între surse.') };
    const candidates = pool.filter(
      (peer) => peer.category === c.category && peer.originalUrl !== c.originalUrl,
    );
    let price: number | null = null,
      saving: number | null = null,
      discount: number | null = null,
      confidence = 0,
      count = 0,
      deal: number | null = null,
      flipPotential: number | null = null,
      overallRisk: number | null = null,
      risks: string[] = [],
      comparableUrls: string[] = [];
    if (c.category === 'cars') {
      const target = car(c),
        peers = candidates.map(car);
      if (target.year === null || target.mileageKm === null || !target.fuel || !target.engineCapacityCc)
        return {
          ...row,
          analysis: insufficient(
            'Pentru mașini sunt necesare anul, kilometrajul, combustibilul și cilindreea.',
          ),
        };
      const estimate = estimatePrice(target, peers),
        data = analyzeDataConsistency(target),
        risk = analyzeListingRisk(target, data);
      if (data.seriousConflict || data.priceAmbiguity)
        return {
          ...row,
          analysis: insufficient(
            'Date contradictorii sau preț ambiguu; clarifică anunțul înainte de scoring.',
          ),
        };
      ({
        estimatedMarketPrice: price,
        absoluteSavingEur: saving,
        discountPercent: discount,
        confidenceScore: confidence,
        comparableCount: count,
      } = estimate);
      if (count >= 5 && confidence >= 40) {
        deal = calculateDealScore(target, estimate, risk, null, defaultSearchSettings, undefined, data);
        flipPotential = calculateFlipPotential(estimate, risk, data);
        overallRisk = risk.overallRisk;
      }
      risks = risk.riskReasons;
      comparableUrls = peers
        .filter((peer) => peer.make === target.make && peer.model === target.model)
        .map((peer) => peer.url);
    } else if (c.category === 'tractors') {
      const target = tractor(c),
        peers = candidates.map(tractor);
      if (
        target.year === null ||
        target.horsepower === null ||
        target.operatingHours === null ||
        target.drivetrain === 'UNKNOWN'
      )
        return {
          ...row,
          analysis: insufficient('Pentru tractoare completează anul, puterea, orele și tracțiunea.'),
        };
      const analysis = analyzeTractor(target, peers, null);
      ({
        estimatedMarketEur: price,
        potentialSavingEur: saving,
        discountPercent: discount,
        confidence,
        comparableCount: count,
      } = analysis.price);
      if (analysis.risks.seriousConflict)
        return { ...row, analysis: insufficient('Date contradictorii despre tractor.') };
      if (count >= 3 && confidence >= 40) deal = analysis.scores.deal;
      risks = analysis.warnings;
      comparableUrls = peers
        .filter((peer) => peer.make === target.make && peer.model === target.model)
        .map((peer) => peer.url);
    } else if (c.category === 'tools') {
      const target = tool(c),
        peers = candidates.map(tool);
      if (target.condition === 'UNKNOWN' || target.powerSource === 'UNKNOWN')
        return {
          ...row,
          analysis: insufficient('Pentru scule completează starea, alimentarea și pachetul/accesoriile.'),
        };
      const analysis = analyzeTool(target, peers, null);
      ({
        estimatedMarketPrice: price,
        potentialSavingEur: saving,
        discountPercent: discount,
        confidence,
        comparableCount: count,
      } = analysis.price);
      if (analysis.package.conflict)
        return { ...row, analysis: insufficient('Pachetul sculei conține date contradictorii.') };
      if (count >= 3 && confidence >= 40) deal = analysis.scores.deal;
      risks = analysis.warnings;
      comparableUrls = peers
        .filter((peer) => peer.brand === target.brand && peer.model === target.model)
        .map((peer) => peer.url);
    }
    if (deal === null)
      return {
        ...row,
        analysis: {
          ...insufficient('Comparabile sau încredere insuficiente pentru Deal Score.'),
          comparableCount: count,
          risks,
        },
      };
    return {
      ...row,
      analysis: {
        status: 'SCORED',
        dealScore: deal,
        flipPotential,
        overallRisk,
        estimatedMarketEur: price,
        savingEur: saving,
        discountPercent: discount,
        confidence,
        comparableCount: count,
        reasons: [
          'Mediană calculată cu motorul existent pe oferte reale confirmate; prețuri cerute, nu tranzacții.',
          'Economia estimată nu include transport, taxe sau reparații.',
        ],
        risks,
        comparableUrls,
      },
    };
  });
}
