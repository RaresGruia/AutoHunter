import type { TractorListing, TractorRisk } from './types.js';
import { normalizeText, clamp } from '../analysis/text.js';
export function tractorRisk(car: TractorListing): TractorRisk {
  const text = normalizeText(`${car.title}. ${car.description}. ${car.documents ?? ''}. ${car.registrationStatus ?? ''}`);
  const risk: TractorRisk = { mechanical: 0, hydraulic: 0, transmission: 0, cosmetic: 0, legal: 0, data: 0, overall: 0, dataQuality: 100, seriousConflict: false, warnings: [] };
  const rules: [keyof Pick<TractorRisk, 'mechanical' | 'hydraulic' | 'transmission' | 'cosmetic' | 'legal'>, RegExp, number, string][] = [
    ['mechanical', /motor defect|nu porneste|bate motorul|fum excesiv|consuma ulei|punte fata defecta|4x4 defect|planetara (?:defecta|rupta)/g, 90, 'Risc mecanic / motor / punte.'],
    ['hydraulic', /hidraulica defecta|pomp[aă] hidraulic[aă] (?:defecta|defect)|ridicator defect|nu ridica/g, 85, 'Risc hidraulic.'],
    ['transmission', /cutie defecta|sare din viteze|ambreiaj defect/g, 85, 'Risc transmisie / ambreiaj.'],
    ['legal', /fara acte|acte lipsa/g, 80, 'Acte lipsă: necesită clarificare înainte de cumpărare.'],
    ['legal', /neinmatriculat|neimatriculat/g, 15, 'Înmatriculare de verificat.'],
    ['cosmetic', /anvelope uzate|rugina|cabina deteriorata|zgarieturi|vopsea uzata/g, 25, 'Uzură cosmetică / anvelope / cabină.'],
  ];
  for (const [category, pattern, severity, message] of rules) for (const match of text.matchAll(pattern)) {
    const before = text.slice(Math.max(0, match.index! - 30), match.index);
    if (/(?:fara|nu|nu are|nu este|niciun)\s*$/.test(before) || /(?:reparat|inlocuit)\s*$/.test(before)) continue;
    risk[category] = Math.max(risk[category], severity);
    if (!risk.warnings.includes(message)) risk.warnings.push(message);
  }
  for (const field of [car.year, car.operatingHours, car.horsepower, car.documents, car.make, car.model]) if (field === null) risk.data += 8;
  if (!car.description.trim()) risk.data += 10;
  if (car.identityConfidence < 70) risk.data += 25;
  const years = [...normalizeText(car.description).matchAll(/\ban(?:ul)?\s*[:=]?\s*((?:19|20)\d{2})\b/g)].map(m => Number(m[1]));
  const hours = [...normalizeText(car.description).matchAll(/\b(\d[\d .]*)\s*ore\b/g)].map(m => Number(m[1]!.replace(/[ .]/g, '')));
  if ((car.year !== null && years.some(y => Math.abs(y - car.year!) > 1))
    || (car.operatingHours !== null && hours.some(h => Math.abs(h - car.operatingHours!) > Math.max(500, car.operatingHours! * 0.2)))) {
    risk.seriousConflict = true; risk.data = Math.max(risk.data, 75); risk.warnings.push('Date contradictorii: anul/orele din descriere diferă de câmpuri.');
  }
  risk.data = clamp(risk.data); risk.dataQuality = 100 - risk.data;
  risk.overall = Math.max(risk.mechanical, risk.hydraulic, risk.transmission, risk.legal, risk.data, risk.cosmetic);
  if (risk.data) risk.warnings.push('Date lipsă sau incerte; scorurile nu confirmă starea tehnică.');
  return risk;
}
