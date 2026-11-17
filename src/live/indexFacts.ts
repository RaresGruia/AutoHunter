import type { DiscoveryHit } from '../discovery/SourceAdapter.js';

export interface IndexedValue<T> {
  value: T;
  field: 'title' | 'snippet';
  evidence: string;
}
export interface IndexFacts {
  price?: IndexedValue<{ amount: number; currency: 'EUR' | 'RON' }>;
  year?: IndexedValue<number>;
  mileageKm?: IndexedValue<number>;
  operatingHours?: IndexedValue<number>;
}
/** Display hints only. These are never copied into confirmed attributes or the scoring pool. */
export function indexFacts(
  hit: Pick<DiscoveryHit, 'title' | 'snippet' | 'category' | 'publisher'>,
  year = new Date().getFullYear(),
): IndexFacts {
  const result: IndexFacts = {};
  const ambiguousPayment = /\b(avans|rat[ăa]|rate|lunar|leasing|de la)\b/iu.test(
    hit.title + ' ' + hit.snippet,
  );
  const number = (raw: string): number => {
    let value = raw.replace(/[\s\u00a0]/g, '');
    const last = Math.max(value.lastIndexOf(','), value.lastIndexOf('.'));
    if (last >= 0 && value.length - last - 1 <= 2)
      value = value.slice(0, last).replace(/[.,]/g, '') + '.' + value.slice(last + 1);
    else value = value.replace(/[.,]/g, '');
    return Number(value);
  };
  for (const field of ['title', 'snippet'] as const) {
    const text = hit[field],
      money = [...text.matchAll(/(\d[\d.,\s\u00a0]*?)\s*(EUR|EURO|€|RON|LEI)(?![\p{L}])/giu)];
    if (!result.price && money.length === 1 && !ambiguousPayment) {
      const match = money[0]!,
        amount = number(match[1]!);
      if (Number.isFinite(amount) && amount > 0 && amount <= 100000000)
        result.price = {
          value: { amount, currency: /^(?:EUR|EURO|€)$/i.test(match[2]!) ? 'EUR' : 'RON' },
          field,
          evidence: match[0].trim(),
        };
    }
    const mileage = [...text.matchAll(/(\d[\d.,\s\u00a0]*?)\s*km\b/giu)];
    if (!result.mileageKm && hit.category === 'cars' && mileage.length === 1) {
      const value = number(mileage[0]![1]!);
      if (Number.isInteger(value) && value >= 0 && value < 10000000)
        result.mileageKm = { value, field, evidence: mileage[0]![0].trim() };
    }
    const explicitYear = text.match(
      /\b(?:an(?:ul)?(?: fabrica[țt]ie(?:i)?| de fabrica[țt]ie)?|fabricat[ăa]?(?: în| in)?)\s*[:=-]?\s*((?:19|20)\d{2})\b/iu,
    );
    const listingYear =
      field === 'title' && hit.category === 'cars' && /autovit\.ro$/i.test(hit.publisher)
        ? text.match(/^(?:Utilizat|Nou|Folosit)\s+\S+\s+.+\s+((?:19|20)\d{2})\s*[-–]/iu)
        : null;
    const foundYear = explicitYear ?? listingYear;
    if (!result.year && foundYear) {
      const value = Number(foundYear[1]);
      if (value >= 1900 && value <= year + 1) result.year = { value, field, evidence: foundYear[0].trim() };
    }
    const hours = [...text.matchAll(/(\d[\d.,\s\u00a0]*?)\s*ore(?:\s+de\s+func[țt]ionare)?\b/giu)];
    if (!result.operatingHours && hit.category === 'tractors' && hours.length === 1) {
      const value = number(hours[0]![1]!);
      if (Number.isFinite(value) && value >= 0)
        result.operatingHours = { value, field, evidence: hours[0]![0].trim() };
    }
  }
  return result;
}
