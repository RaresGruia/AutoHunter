import type { RuntimeMode } from '../config/runtimeMode.js';
export type Category = 'cars' | 'tractors' | 'tools' | 'equipment';
export interface CategorySource<Listing, Settings> {
  readonly name: string;
  readonly category: Category;
  searchLocal(settings: Settings): Promise<{ listings: Listing[]; mode: RuntimeMode; warnings: string[] }>;
}
export const categoryCapabilities = {
  cars: { demo: true, live: true }, tractors: { demo: true, live: false },
  tools: { demo: true, live: false }, equipment: { demo: false, live: false },
} as const;
