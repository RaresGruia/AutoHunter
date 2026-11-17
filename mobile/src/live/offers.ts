import type { LiveOffer, LiveResponse } from '../../../src/live/types';
import type { DemoVehicle, DemoVehicleResponse } from '../../../src/demo/vehicles';
export type DisplayOffer = LiveOffer | DemoVehicle;
export type DisplayResponse = LiveResponse | DemoVehicleResponse;
export const isDemo = (row: DisplayOffer): row is DemoVehicle => 'mode' in row && row.mode === 'DEMO';
export function readDemoResponse(value: unknown): DemoVehicleResponse {
  const result = value as DemoVehicleResponse;
  if (
    result?.meta?.mode !== 'DEMO' ||
    result.meta.category !== 'cars' ||
    !Array.isArray(result.results) ||
    result.results.some(
      (row) =>
        row.mode !== 'DEMO' ||
        row.origin !== 'DEMO' ||
        row.category !== 'cars' ||
        typeof row.id !== 'string' ||
        typeof row.title !== 'string' ||
        typeof row.priceEur !== 'number' ||
        !Number.isFinite(row.priceEur) ||
        row.priceEur <= 0 ||
        !Array.isArray(row.imageUrls) ||
        row.analysis?.dealScore !== null,
    )
  )
    throw Error('INVALID_DEMO_RESPONSE');
  return result;
}
export const DEMO_FAVORITES_KEY = 'autohunter:demo-favorites:v1';
export function readDemoFavorites(raw: string | null): string[] {
  try {
    const value: unknown = JSON.parse(raw ?? '[]');
    return Array.isArray(value)
      ? [
          ...new Set(
            value.filter((id): id is string => typeof id === 'string' && /^demo-[a-z0-9_-]+$/i.test(id)),
          ),
        ].slice(0, 100)
      : [];
  } catch {
    return [];
  }
}
