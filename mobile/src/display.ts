import type { CarSearchResult } from './types';

export const numberText = (n: number | null): string => n === null ? 'Necunoscut' : n.toLocaleString('ro-RO');
export const money = (n: number | null): string => n === null ? 'Necunoscută' : `${numberText(n)} €`;
export const distance = (n: number | null): string => n === null ? 'Distanță necunoscută' : `${Math.round(n)} km`;
export function dealDisplay(score: number): { label: string; color: string; background: string } {
  if (score >= 60) return { label: 'Ofertă bună', color: '#176343', background: '#E6F4EB' };
  if (score >= 35) return { label: 'De luat în calcul', color: '#83500B', background: '#FFF1D8' };
  return { label: 'Ofertă modestă', color: '#52616C', background: '#EDF0F2' };
}
export function discountText(value: number | null): string {
  if (value === null) return 'Piață insuficient cunoscută';
  if (value === 0) return 'La nivelul pieței estimate';
  return `${value > 0 ? '↓' : '↑'} ${numberText(Math.abs(value))}% ${value > 0 ? 'sub' : 'peste'} piața estimată`;
}
export function carName(car: CarSearchResult): string {
  return car.car.make && car.car.model ? `${car.car.make} ${car.car.model}` : car.title;
}
export function verificationText(status: CarSearchResult['verification']['status']): string {
  return { VERIFIED: 'Pagina verificată', FAILED: 'Verificarea paginii a eșuat', NOT_REQUESTED: 'Pagina nu a fost verificată' }[status];
}
export const classificationLabels: Record<string, string> = {
  GREAT_DEAL: '🔥 Chilipir', GOOD_DEAL: '✅ Ofertă bună', INTERESTING_CAR: '👀 Mașină interesantă',
  FAIR: 'Preț / valoare de evaluat', POOR_VALUE: '⚠️ Preț ridicat', NEEDS_VERIFICATION: '🔎 Necesită verificare',
};
export function scoreLabels(scores: { deal: number; carQuality?: number | null; flipPotential: number }): string[] {
  return [`🔥 Deal: ${scores.deal}/100`, `🚗 Car Quality: ${scores.carQuality ?? '—'}/100`, `💰 Flip: ${scores.flipPotential}/100`];
}
export function visibleResults<T>(results: T[], all: boolean): T[] { return all ? results : results.slice(0, 10); }
