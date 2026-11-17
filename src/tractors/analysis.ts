import type { TractorListing, TractorEstimate, TractorResult, TractorClassification } from './types.js';
import { normalizeText, clamp } from '../analysis/text.js';
import { tractorRisk } from './risk.js';
export function tractorMedian(values: readonly number[]): number | null {
  const sorted = values.filter(Number.isFinite).sort((a,b) => a-b), n = sorted.length;
  return n ? n % 2 ? sorted[Math.floor(n/2)]! : (sorted[n/2-1]! + sorted[n/2]!) / 2 : null;
}
export function tractorSimilarity(a: TractorListing, b: TractorListing): number {
  if (!a.make || !a.model || !b.make || !b.model || a.identityConfidence < 70 || b.identityConfidence < 70
    || normalizeText(a.make) !== normalizeText(b.make) || normalizeText(a.model) !== normalizeText(b.model)) return 0;
  let score = 30;
  if (a.horsepower !== null && b.horsepower !== null) score += 20 * Math.max(0, 1 - Math.abs(a.horsepower-b.horsepower)/Math.max(15,a.horsepower*0.3));
  if (a.year !== null && b.year !== null) score += 15 * Math.max(0, 1-Math.abs(a.year-b.year)/12);
  if (a.drivetrain !== 'UNKNOWN' && a.drivetrain === b.drivetrain) score += 15;
  if (a.operatingHours !== null && b.operatingHours !== null) score += 10*Math.max(0,1-Math.abs(a.operatingHours-b.operatingHours)/5000);
  if (a.frontLoader !== null && a.frontLoader === b.frontLoader) score += 5;
  if (a.cabin && b.cabin && normalizeText(a.cabin) === normalizeText(b.cabin)) score += 5;
  return Math.round(score);
}
export function estimateTractor(listing: TractorListing, pool: readonly TractorListing[]): TractorEstimate {
  const ids = new Set<string>(), urls = new Set<string>();
  const candidates = pool.filter(c => {
    const key = `${c.source}:${c.id}`;
    if (key === `${listing.source}:${listing.id}` || c.url === listing.url || ids.has(key) || urls.has(c.url)) return false;
    ids.add(key); urls.add(c.url);
    const risk = tractorRisk(c);
    return Number.isFinite(c.priceEur) && c.priceEur >= 500 && c.priceEur <= 500000
      && Math.max(risk.mechanical, risk.hydraulic, risk.transmission, risk.legal, risk.data) < 35
      && tractorSimilarity(listing,c) >= 60
      && (listing.drivetrain === 'UNKNOWN' || c.drivetrain === 'UNKNOWN' || listing.drivetrain === c.drivetrain);
  }).sort((a,b) => tractorSimilarity(listing,b)-tractorSimilarity(listing,a)).slice(0,15);
  const center = tractorMedian(candidates.map(c=>c.priceEur));
  const mad = center === null ? 0 : tractorMedian(candidates.map(c=>Math.abs(c.priceEur-center)))!;
  const retained = center === null ? [] : candidates.filter(c=>Math.abs(c.priceEur-center) <= Math.max(center*0.35,3*1.4826*mad));
  if (retained.length < 3) return { estimatedMarketEur: null, discountPercent: null, potentialSavingEur: null,
    comparableCount: retained.length, confidence: 0, similarityAverage: retained.length ? Math.round(retained.reduce((n,c)=>n+tractorSimilarity(listing,c),0)/retained.length) : null };
  const price = tractorMedian(retained.map(c=>c.priceEur))!;
  const similarityAverage = Math.round(retained.reduce((n,c)=>n+tractorSimilarity(listing,c),0)/retained.length);
  const dispersion = tractorMedian(retained.map(c=>Math.abs(c.priceEur-price)))!/price;
  return { estimatedMarketEur: Math.round(price), discountPercent: Math.round((price-listing.priceEur)/price*1000)/10,
    potentialSavingEur: Math.round(price-listing.priceEur), comparableCount: retained.length, similarityAverage,
    confidence: Math.round((retained.length >= 6 ? 85 : retained.length >= 4 ? 65 : 45)*similarityAverage/100*Math.max(0.3,1-dispersion*2)) };
}
export function analyzeTractor(listing: TractorListing, pool: readonly TractorListing[], distanceKm: number | null, currentYear = new Date().getFullYear()): TractorResult {
  const risks = tractorRisk(listing), price = estimateTractor(listing,pool);
  price.confidence = Math.round(price.confidence * risks.dataQuality/100 * (distanceKm === null ? 0.8 : 1));
  const confidence = price.confidence/100, discount = clamp((price.discountPercent ?? 0)/30,0,1);
  const saving = clamp((price.potentialSavingEur ?? 0)/5000,0,1);
  const severe = Math.max(risks.mechanical,risks.hydraulic,risks.transmission,risks.legal);
  const deal = Math.round(clamp((60*discount+25*saving+15)*confidence-severe-risks.data*0.3-risks.cosmetic*0.1,
    0, (price.discountPercent ?? 0) < 0 ? Math.max(0,25+(price.discountPercent ?? 0)) : risks.seriousConflict ? 20 : 100));
  const age = listing.year === null ? null : Math.max(1,currentYear-listing.year);
  const annual = age && listing.operatingHours !== null ? listing.operatingHours/age : null;
  const qualityReasons = [age === null ? 'An necunoscut.' : `Vechime declarată: ${age} ani.`,
    annual === null ? 'Ore insuficient documentate.' : `Aproximativ ${Math.round(annual)} ore/an conform anunțului.`,
    listing.horsepower === null ? 'Putere necunoscută.' : `Putere documentată: ${listing.horsepower} CP; fără preferință automată pentru putere mare.`,
    listing.drivetrain === '4X4' ? '4x4 declarat; avantaj dependent de utilizare, nu garanție de stare.' : `Tracțiune: ${listing.drivetrain}.`,
    listing.documents ? 'Documente declarate; verificarea originalelor rămâne necesară.' : 'Documente necunoscute.'];
  const quality = Math.round(clamp((age === null ? 0 : 25*clamp(1-age/65,0,1))
    + (annual === null ? 0 : 15*clamp(1-Math.max(0,annual-250)/1000,0,1))
    + (listing.operatingHours === null ? 0 : 10*clamp(1-listing.operatingHours/20000,0,1))
    + risks.dataQuality*0.25 + (listing.horsepower !== null ? 5 : 0) + (listing.drivetrain !== 'UNKNOWN' ? 5 : 0)
    + (listing.description.trim() ? 5 : 0) + (listing.documents ? 5 : 0) + (listing.cabin !== null ? 3 : 0) + (listing.frontLoader !== null ? 2 : 0)
    - severe*0.65 - risks.cosmetic*0.15, 0, risks.seriousConflict ? 30 : 100));
  const minor = risks.cosmetic > 0 && risks.cosmetic <= 30 && severe < 20;
  const flip = discount === 0 ? 0 : Math.round(clamp((50*discount+25*saving+15*clamp(price.comparableCount/8,0,1)+(minor?10:0))*confidence*risks.dataQuality/100
    - risks.mechanical - risks.hydraulic - risks.transmission - risks.legal, 0, risks.seriousConflict || severe >= 70 ? 10 : 100));
  let classification: TractorClassification = 'FAIR';
  if (risks.seriousConflict || risks.data >= 50 || severe >= 70) classification = 'NEEDS_VERIFICATION';
  else if ((price.discountPercent ?? 0) >= 15 && price.confidence >= 40 && severe < 25) classification = 'GREAT_DEAL';
  else if ((price.discountPercent ?? 0) >= 7 && price.confidence >= 40 && severe < 25) classification = 'GOOD_DEAL';
  else if ((price.discountPercent ?? 0) <= -15 && price.confidence >= 30) classification = 'POOR_VALUE';
  else if (quality >= 72) classification = 'INTERESTING';
  const opportunity = Math.round(clamp(0.5*deal+0.3*quality+0.2*flip-severe*0.2,0,
    classification === 'NEEDS_VERIFICATION' ? 20 : (price.discountPercent ?? 0) <= -15 ? 30 : 100));
  const positiveReasons = [];
  if ((price.discountPercent ?? 0)>0) positiveReasons.push(`${price.discountPercent}% sub piața estimată, înainte de costuri.`);
  if (price.comparableCount >= 3) positiveReasons.push(`${price.comparableCount} comparabile tractor compatibile.`);
  if (!severe) positiveReasons.push('Fără indicii grave în text; nu este inspecție tehnică.');
  const warnings = [...risks.warnings, 'Starea declarată și orele nu sunt verificate fizic.'];
  if (price.estimatedMarketEur === null) warnings.push('Piață insuficientă: minimum 3 comparabile sigure necesare.');
  if ((price.discountPercent ?? 0)<0) warnings.push('Preț peste piața estimată.');
  if (distanceKm === null) warnings.push('Coordonate lipsă: raza nu poate fi confirmată.');
  const { rawData: _raw, ...safe } = listing;
  return { listing: safe, price, scores: { deal, tractorQuality: quality, flipPotential: flip, opportunity },
    classification, risks, positiveReasons, qualityReasons, warnings, distanceKm };
}
