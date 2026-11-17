import type { CarListing } from '../models/CarListing.js';
import { clamp, normalizeText } from './text.js';
import { hasUsableFullPrice } from './priceEstimator.js';
import { primaryDescription } from './descriptionContext.js';

export interface DataConsistency {
  dataQualityScore: number;
  dataConflicts: string[];
  dataWarnings: string[];
  seriousConflict: boolean;
  priceAmbiguity: boolean;
}

export function analyzeDataConsistency(listing: CarListing, previous?: CarListing): DataConsistency {
  const dataConflicts: string[] = [];
  const dataWarnings: string[] = [];
  let penalty = 0;
  let seriousConflict = false;
  const conflict = (message: string, weight: number): void => {
    if (dataConflicts.includes(message)) return;
    dataConflicts.push(message); penalty += weight; if (weight >= 35) seriousConflict = true;
  };
  const primary = primaryDescription(listing.description);
  if (primary.otherVehiclesMentioned) dataWarnings.push('Descrierea enumeră și alte vehicule; datele acestora nu sunt atribuite acestei mașini.');
  for (const [origin, raw] of [['Title', listing.title], ['Description', primary.text]] as const) {
    const text = normalizeText(raw);
    const years = [...text.matchAll(/\b(?:an(?:ul)?(?: de fabricatie| fabricatie)?|fabricat(?:a)? in|model an)\s*[:=/-]?\s*((?:19|20)\d{2})\b/g)].map(match => Number(match[1]));
    years.push(...[...text.matchAll(/\b(?:an(?:ul)?(?: de fabricatie| fabricatie)?|fabricat(?:a)? in)\s*[:=]?\s*\d{1,2}[./-]\d{1,2}[./-]((?:19|20)\d{2})\b/g)].map(match => Number(match[1])));
    // Un an izolat în titlu este uzual anul mașinii; în descriere cerem un context explicit.
    if (origin === 'Title') for (const match of text.matchAll(/\b((?:19|20)\d{2})\b/g)) {
      // O dată de import/ITP în titlu nu este implicit anul fabricației.
      if (/\b(?:\d{1,2}[./-]){1,2}$/.test(text.slice(0, match.index))) continue;
      const suffix = text.slice(match.index + match[0].length);
      if (/^\s*(?:eur\b|euro\b|€|cm3\b|cm³|cmc\b|cc\b|km\b)/.test(suffix)) continue;
      if (normalizeText(listing.model ?? '') === match[1]) continue;
      years.push(Number(match[1]));
    }
    for (const year of new Set(years)) if (listing.year !== null && year !== listing.year) {
      const difference = Math.abs(year - listing.year);
      if (difference >= 2) conflict(`AN INCONSISTENT: OLX field: ${listing.year}; ${origin}: ${year}`, 75);
      else { dataWarnings.push(`An diferit cu 1 an: OLX ${listing.year}; ${origin} ${year} (fabricație/înmatriculare de clarificat).`); penalty += 10; }
    }
    const mileages = [...text.matchAll(/\b(\d{1,3}(?:[. ,]\d{3})+|\d{4,7})\s*(?:km|kilometri)\b/g)]
      .map(match => ({ value: Number(match[1]!.replace(/[. ,]/g, '')), index: match.index }));
    mileages.push(...[...text.matchAll(/\b(?:km|kilometraj|rulaj)\s*[:=]?\s*(\d{1,3}(?:[. ,]\d{3})+|\d{4,7})\b/g)]
      .map(match => ({ value: Number(match[1]!.replace(/[. ,]/g, '')), index: match.index })));
    for (const mileage of mileages) {
      const prefix = text.slice(Math.max(0, mileage.index - 60), mileage.index);
      if (/\b(?:an(?:ul)?|fabricatie)\s*[:=-]?\s*$/.test(prefix)) continue;
      if (/\b\d{1,2}[./-]\d{1,2}[./-]\s*$/.test(prefix)) continue;
      if (/\b(?:revizie|distributie|schimbat\w*|garantie|peste|parcurs|pe roti|interval|ulei|anual)\b/.test(prefix)) continue;
      if (listing.mileageKm === null) continue;
      const difference = Math.abs(mileage.value - listing.mileageKm);
      if (difference > 30000) conflict(`KILOMETRAJ INCONSISTENT: OLX ${listing.mileageKm} km; ${origin} ${mileage.value} km`, 45);
      else if (difference >= 3000) { dataWarnings.push(`Kilometraj diferit: OLX ${listing.mileageKm} km; ${origin} ${mileage.value} km.`); penalty += 10; }
    }
    const fuel = normalizeText(listing.fuel ?? '');
    const diesel = /\b(?:diesel|motorina)\b/.test(text);
    const petrol = /\b(?:benzina|petrol|gasoline)\b/.test(text);
    if ((/diesel|motorina/.test(fuel) && petrol && !diesel) || (/benzina|petrol|gasoline/.test(fuel) && diesel && !petrol)) {
      conflict(`COMBUSTIBIL INCONSISTENT: OLX ${listing.fuel}; ${origin}: ${diesel ? 'diesel' : 'petrol/benzină'}`, 45);
    }
    const drive = normalizeText(listing.drivetrain ?? '');
    const four = /\b(?:4x4|4wd|awd)\b/.test(text);
    const two = /\b(?:4x2|2wd|fwd|rwd)\b/.test(text);
    // 4x2/4x4 pot desemna modurile selectabile ale aceleiași transmisii.
    if ((/4x2|2wd|fwd|rwd/.test(drive) && four && !two) || (/4x4|4wd|awd/.test(drive) && two && !four)) {
      conflict(`TRACȚIUNE INCONSISTENTĂ: OLX ${listing.drivetrain}; ${origin}: ${four ? '4x4' : '4x2'}`, 35);
    }
    const capacities = [...text.matchAll(/\b(\d{3,4})\s*(?:cm3|cm³|cmc|cc)\b/g)].map(match => Number(match[1]));
    const structuredCc = listing.engineCapacityCc ?? Number(listing.engine?.match(/^(\d{3,4})/)?.[1]);
    for (const cc of capacities) if (Number.isFinite(structuredCc) && Math.abs(structuredCc - cc) > 250) {
      conflict(`CILINDREE INCONSISTENTĂ: OLX ${structuredCc} cm³; ${origin}: ${cc} cm³`, 35);
    }
  }
  if (previous && previous.year !== null && listing.year !== null && previous.year !== listing.year) {
    conflict(`AN MODIFICAT: card ${previous.year}; pagina individuală ${listing.year}`, 75);
  }
  if (previous && Math.abs(previous.priceEur - listing.priceEur) > 1) dataWarnings.push(`Preț actualizat: card ${previous.priceEur} EUR; detalii ${listing.priceEur} EUR.`);
  const text = normalizeText(`${listing.title}. ${listing.description}`);
  if (/neinmatriculat|neimatriculat|unregistered/.test(normalizeText(listing.registrationText ?? ''))
    && /\binmatriculat\w*\b/.test(normalizeText(listing.title))) {
    dataWarnings.push('Înmatriculare contradictorie: titlul spune înmatriculat, câmpul OLX spune neînmatriculat.');
    penalty += 20;
  }
  const startingPrice = /\b(?:pret(?:ul)?\s*)?de la\s*\d[\d .]*\s*(?:eur|euro|€)/.test(text);
  const withoutVat = /\b(?:fara tva|tva neinclus|pret net)\b|\+\s*tva\b/.test(text);
  const priceAmbiguity = !hasUsableFullPrice(listing) || startingPrice || withoutVat;
  if (priceAmbiguity) { dataWarnings.push('PREȚ TOTAL NECLAR: avans/rată, preț de pornire sau TVA neincluse; necesită confirmare.'); penalty += 50; }
  if (/\b(?:finantare|rate|rata|avans)\b/.test(text)) dataWarnings.push('Finanțare/avans/rate menționate; verificați prețul integral, nu doar rata.');
  if (withoutVat) dataWarnings.push('Preț fără TVA/net: totalul de plată poate fi mai mare.');
  if (/\b(?:cu tva|tva inclus|tva deductibil)\b/.test(text)) dataWarnings.push('TVA menționat de vânzător; verificați dacă prețul afișat include TVA.');
  for (const [name, value] of [['an', listing.year], ['kilometraj', listing.mileageKm], ['combustibil', listing.fuel], ['descriere', listing.description]] as const) {
    if (value === null || value === '') { dataWarnings.push(`Date lipsă: ${name}.`); penalty += 12; }
  }
  return { dataQualityScore: clamp(100 - penalty), dataConflicts: [...new Set(dataConflicts)],
    dataWarnings: [...new Set(dataWarnings)], seriousConflict, priceAmbiguity };
}
