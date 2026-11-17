import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseOlxHtml } from '../sources/olx/olxParser.js';
import { attachDemoImages, readDemoImageManifest } from '../services/demoImages.js';
import type { LiveOffer, LiveResponse } from '../live/types.js';

/** A separate discriminated contract: sample data cannot pass the LIVE response decoder. */
export type DemoVehicle = Omit<LiveOffer, 'origin' | 'availability'> & {
  mode: 'DEMO';
  origin: 'DEMO';
  availability: 'DEMO';
};
export interface DemoVehicleResponse {
  meta: Omit<LiveResponse['meta'], 'mode'> & { mode: 'DEMO' };
  results: DemoVehicle[];
}
const ids = ['demo-duster-good', 'demo-Focus-0', 'demo-Golf-0', 'demo-Megane-0', 'demo-no-comparables'];

/** Reuses existing local fixtures and licensed images; never loads publisher pages. */
export async function demoVehicles(
  manifestPath?: string,
  fixturePath = resolve('fixtures/olx-search.html'),
): Promise<DemoVehicleResponse> {
  const parsed = parseOlxHtml(await readFile(fixturePath, 'utf8'), { fixture: true });
  const manifest = await readDemoImageManifest(manifestPath);
  const results = ids.map((id) => {
    const original = parsed.listings.find((row) => row.id === id);
    if (!original) throw Error('DEMO_VEHICLE_MISSING');
    const row = attachDemoImages(original, 'cars', manifest);
    return {
      mode: 'DEMO' as const,
      origin: 'DEMO' as const,
      availability: 'DEMO' as const,
      id: row.id,
      category: 'cars' as const,
      title: `${row.make ?? ''} ${row.model ?? ''}`.trim(),
      originalUrl: row.url,
      publisher: 'AutoHunter DEMO',
      snippet: 'Date de exemplu. Nu este o ofertă de vânzare.',
      discoveredAt: '2026-10-25T00:00:00.000Z',
      lastVerifiedAt: null,
      priceEur: row.priceEur,
      make: row.make,
      model: row.model,
      attributes: {
        year: row.year,
        mileageKm: row.mileageKm,
        fuel: row.fuel,
        transmission: row.transmission,
        engine: row.engine,
        location: row.locationText,
      },
      imageUrls: row.imageUrls,
      imageRights: row.imageRights ?? { status: 'UNKNOWN' as const, evidence: null },
      ...(row.imagePresentation ? { imagePresentation: row.imagePresentation } : {}),
      ...(row.imageAttributions ? { imageAttributions: row.imageAttributions } : {}),
      normalized: null,
      analysis: {
        status: 'INSUFFICIENT_DATA' as const,
        dealScore: null,
        estimatedMarketEur: null,
        savingEur: null,
        discountPercent: null,
        confidence: null,
        comparableCount: 0,
        reasons: [],
        risks: [],
        comparableUrls: [],
      },
    };
  });
  return {
    meta: {
      mode: 'DEMO',
      category: 'cars',
      query: 'Colecția DEMO',
      discovered: results.length,
      searchedAt: '2026-10-25T00:00:00.000Z',
      scored: 0,
      sources: ['Local DEMO fixtures'],
      warnings: [],
      searchStatus: 'DEMO',
      storage: 'TRANSIENT',
    },
    results,
  };
}
