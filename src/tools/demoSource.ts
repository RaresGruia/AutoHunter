import { attachDemoImages, readDemoImageManifest } from '../services/demoImages.js';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {validateToolListing} from './validation.js';
import {toolIdentity} from './identity.js';
import type {ToolListing,ToolSourceAdapter} from './types.js';
export class DemoToolSourceAdapter implements ToolSourceAdapter {
  readonly name='tool-demo';readonly category='tools' as const;
  constructor(private readonly imageManifestPath?: string) {}
  private async read(key:'local'|'market'):Promise<ToolListing[]> {
    const file:unknown=JSON.parse(await readFile(resolve('fixtures/tools.json'),'utf8'));
    if(!file||typeof file!=='object'||!('synthetic' in file)||file.synthetic!==true||!(key in file))throw Error('Invalid tool fixtures');
    const listings=(file as Record<string,unknown>)[key];if(!Array.isArray(listings))throw Error('Invalid tool fixtures');
    const images = await readDemoImageManifest(this.imageManifestPath);
    return listings.map(listing=>{
      validateToolListing(listing);
      if(!listing.synthetic||new URL(listing.url).hostname!=='example.invalid')throw Error('Tool demo requires synthetic listings');
      return attachDemoImages({...listing,...toolIdentity(listing)}, 'tools', images);
    });
  }
  async searchLocal(){return {listings:await this.read('local'),mode:'DEMO' as const,warnings:[]};}
  async searchComparables(){return this.read('market');}
}
