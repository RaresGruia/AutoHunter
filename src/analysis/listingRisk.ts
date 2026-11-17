import type { CarListing } from '../models/CarListing.js';
import type { DataConsistency } from './dataConsistency.js';
import { registrationStatus } from './listingFacts.js';
import { clamp, normalizeText } from './text.js';
import { primaryDescription } from './descriptionContext.js';

export interface ListingRisk {
  mechanicalRisk: number;
  accidentRisk: number;
  cosmeticRisk: number;
  legalRisk: number;
  priceRisk: number;
  dataRisk: number;
  overallRisk: number;
  riskReasons: string[];
  riskScore: number;
  reasons: string[];
}
export type RiskInput = Pick<ListingRisk, 'riskScore' | 'reasons'> & Partial<ListingRisk>;
export const HIGH_RISK_THRESHOLD = 70;
type Category = 'mechanicalRisk' | 'accidentRisk' | 'cosmeticRisk' | 'legalRisk';
const rules: ReadonlyArray<{ pattern: RegExp; weight: number; reason: string; category: Category }> = [
  { pattern: /\bavariat\w*\b/g, weight: 80, reason: 'Avarii menționate', category: 'accidentRisk' },
  { pattern: /\baccidentat\w*\b/g, weight: 75, reason: 'Accident menționat', category: 'accidentRisk' },
  { pattern: /\bdaun[ae]\w*\b/g, weight: 75, reason: 'Daună menționată', category: 'accidentRisk' },
  { pattern: /\blovit\w*\b/g, weight: 50, reason: 'Lovitură menționată', category: 'accidentRisk' },
  { pattern: /\belemente indoite\b/g, weight: 65, reason: 'Elemente îndoite', category: 'accidentRisk' },
  { pattern: /\bairbag(?:uri)? (?:declansat\w*|sarit\w*)\b/g, weight: 85, reason: 'Airbag declanșat', category: 'accidentRisk' },
  { pattern: /\bmotor(?:ul)? defect\w*\b/g, weight: 90, reason: 'Motor defect', category: 'mechanicalRisk' },
  { pattern: /\bcuti[ae](?: de viteze)? defect\w*\b/g, weight: 85, reason: 'Cutie defectă', category: 'mechanicalRisk' },
  { pattern: /\bnu (?:mai )?porneste\b/g, weight: 85, reason: 'Mașina nu pornește', category: 'mechanicalRisk' },
  { pattern: /\bpentru piese\b/g, weight: 95, reason: 'Vândută pentru piese', category: 'mechanicalRisk' },
  { pattern: /\bdezmembra\w*\b/g, weight: 95, reason: 'Dezmembrări', category: 'mechanicalRisk' },
  { pattern: /\bprobleme (?:la |cu )?(?:motor|motorul)\b/g, weight: 80, reason: 'Probleme motor', category: 'mechanicalRisk' },
  { pattern: /\bprobleme (?:la |cu )?cuti[ae]\b/g, weight: 80, reason: 'Probleme cutie', category: 'mechanicalRisk' },
  { pattern: /\bbate motorul\b/g, weight: 85, reason: 'Zgomote anormale motor', category: 'mechanicalRisk' },
  { pattern: /\bconsuma ulei\b/g, weight: 65, reason: 'Consum de ulei menționat', category: 'mechanicalRisk' },
  { pattern: /\b(?:turbina|injectoare|ambreiaj|volanta|dpf) defect\w*\b/g, weight: 75, reason: 'Componentă mecanică defectă', category: 'mechanicalRisk' },
  { pattern: /\b(?:injectoare|ambreiaj|volanta)\b/g, weight: 5, reason: 'Injectoare/ambreiaj/volantă menționate; context de verificat', category: 'mechanicalRisk' },
  { pattern: /\b(?:martori aprinsi|check engine)\b/g, weight: 55, reason: 'Martori de bord / check engine', category: 'mechanicalRisk' },
  { pattern: /\bnecesita investitii\b/g, weight: 35, reason: 'Necesită investiții', category: 'mechanicalRisk' },
  { pattern: /\bimperf?ectiuni estetice\b/g, weight: 25, reason: 'Caroserie cu imperfecțiuni estetice', category: 'cosmeticRisk' },
  { pattern: /\bzgarietur\w*\b/g, weight: 20, reason: 'Zgârieturi menționate', category: 'cosmeticRisk' },
  { pattern: /\bindoitur\w*\b/g, weight: 25, reason: 'Îndoituri menționate', category: 'cosmeticRisk' },
  { pattern: /\b(?:de vopsit|vopsea sarita)\b/g, weight: 25, reason: 'Vopsea de reparat', category: 'cosmeticRisk' },
  { pattern: /\brugina\b/g, weight: 40, reason: 'Rugină; amploarea trebuie verificată', category: 'cosmeticRisk' },
  { pattern: /\bparbriz fisurat\b/g, weight: 30, reason: 'Parbriz fisurat', category: 'cosmeticRisk' },
  { pattern: /\b(?:fara acte|acte lipsa)\b/g, weight: 95, reason: 'Lipsă acte', category: 'legalRisk' },
  { pattern: /\bradiat\w*\b/g, weight: 45, reason: 'Vehicul radiat; documente de verificat', category: 'legalRisk' },
  { pattern: /\bnumere expirate\b/g, weight: 35, reason: 'Numere expirate', category: 'legalRisk' },
];

function isNegated(text: string, index: number): boolean {
  const prefix = text.slice(Math.max(0, index - 65), index);
  return /\b(?:fara|nu|nici|ne|nicio|niciun|nu este|nu e|nu a fost|nu are|nu prezinta|fara a fi)\s*$/.test(prefix)
    || /\b(?:fara|nu are)\s+(?:\w+\s*[,/]?\s*){1,3}(?:sau|si)\s*$/.test(prefix);
}

export function analyzeListingRisk(listing: Pick<CarListing, 'title' | 'description' | 'conditionText' | 'registrationText'>,
  consistency?: DataConsistency): ListingRisk {
  const text = normalizeText(`${listing.title}. ${primaryDescription(listing.description).text}. ${listing.conditionText ?? ''}`);
  const categories = { mechanicalRisk: 0, accidentRisk: 0, cosmeticRisk: 0, legalRisk: 0 };
  const reasons: string[] = [];
  for (const rule of rules) {
    if ([...text.matchAll(rule.pattern)].some(match => !isNegated(text, match.index))) {
      categories[rule.category] = clamp(categories[rule.category] + rule.weight);
      reasons.push(rule.reason);
    }
  }
  const registration = registrationStatus(listing);
  if (registration === 'UNREGISTERED' || registration === 'IMPORT') {
    categories.legalRisk = Math.max(10, categories.legalRisk);
    reasons.push(registration === 'UNREGISTERED' ? 'Neînmatriculată; pot exista costuri suplimentare de înmatriculare' : 'Import; documente și eventuale costuri de înmatriculare de verificat');
  }
  const dataRisk = consistency ? 100 - consistency.dataQualityScore : 0;
  const priceRisk = consistency?.priceAmbiguity ? 75 : 0;
  const scores = [...Object.values(categories), dataRisk, priceRisk];
  const max = Math.max(...scores);
  const overallRisk = Math.round(clamp(max + (scores.reduce((a, b) => a + b, 0) - max) * 0.25));
  reasons.push(...(consistency?.dataConflicts ?? []));
  if (priceRisk) reasons.push('Prețul total real este neclar');
  return { ...categories, priceRisk, dataRisk, overallRisk, riskReasons: reasons, riskScore: overallRisk, reasons };
}

export function hasSevereVehicleRisk(risk: ListingRisk): boolean {
  return Math.max(risk.mechanicalRisk, risk.accidentRisk, risk.legalRisk) >= HIGH_RISK_THRESHOLD;
}
