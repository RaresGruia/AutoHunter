import { attachDemoImages, readDemoImageManifest } from '../services/demoImages.js';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import type { TractorListing, TractorSourceAdapter } from './types.js';
import { tractorIdentity } from './identity.js';
import { validateTractorListing } from './validation.js';
export class DemoTractorSourceAdapter implements TractorSourceAdapter {
  readonly name = 'tractor-demo'; readonly category = 'tractors' as const;
  constructor(private readonly imageManifestPath?: string) {}
  private async listings(key: 'local' | 'market'): Promise<TractorListing[]> {
    const file = JSON.parse(await readFile(resolve('fixtures/tractors.json'),'utf8')) as { synthetic: boolean; local: TractorListing[]; market: TractorListing[] };
    if (file.synthetic !== true || !Array.isArray(file[key])) throw new Error('Invalid tractor demo fixtures');
    const images = await readDemoImageManifest(this.imageManifestPath);
    return file[key].map(listing => {
      validateTractorListing(listing);
      if (new URL(listing.url).hostname !== 'example.invalid') throw new Error('Demo listing must have a synthetic URL');
      return attachDemoImages({ ...listing, ...tractorIdentity(listing) }, 'tractors', images);
    });
  }
  async searchLocal() { return { listings: await this.listings('local'), mode: 'DEMO' as const,
    warnings: ['Mod demonstrație: toate tractoarele sunt sintetice, nu anunțuri disponibile.'] }; }
  async searchComparables() { return this.listings('market'); }
}
