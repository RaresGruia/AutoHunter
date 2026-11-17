import type { CarListing } from '../src/models/CarListing.js';
import type { SourceAdapter } from '../src/sources/SourceAdapter.js';

export function car(overrides: Partial<CarListing> = {}): CarListing {
  const id = overrides.id ?? 'target';
  return { id, source: 'test', url: `https://example.invalid/${id}`, title: 'Dacia Duster 1.5 dCi 4x4',
    make: 'Dacia', model: 'Duster', year: 2021, mileageKm: 123000, priceEur: 9500,
    fuel: 'Diesel', engine: '1461 cm3', transmission: 'Manuala', drivetrain: '4x4',
    locationText: 'Hunedoara', latitude: 45.75, longitude: 22.9,
    description: 'Revizii documentate, disponibilă pentru inspecție.', imageUrls: [], ...overrides };
}

export function peers(): CarListing[] {
  return [11000,11200,11300,11400,11500,11600,11700,11800,12000]
    .map((priceEur, i) => car({ id: `peer-${i}`, priceEur }));
}

export function adapterWith(local: CarListing[], market: CarListing[] = []): SourceAdapter {
  return { name: 'test', searchLocal: async () => ({ source: 'test', mode: 'fixture', warnings: [], listings: local }),
    searchComparables: async () => ({ source: 'test', mode: 'fixture', warnings: [], listings: market }) };
}
