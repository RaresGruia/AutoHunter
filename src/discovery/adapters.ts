import { imageMetadata } from '../models/ListingImages.js';
import { readFile, stat } from 'node:fs/promises';
import type { Category } from '../categories/category.js';
import type { CarListing } from '../models/CarListing.js';
import type { TractorListing } from '../tractors/types.js';
import type { ToolListing } from '../tools/types.js';
import { OlxSourceAdapter } from '../sources/olx/OlxSourceAdapter.js';
import { DemoTractorSourceAdapter } from '../tractors/demoSource.js';
import { DemoToolSourceAdapter } from '../tools/demoSource.js';
import { defaultSearchSettings } from '../config/searchSettings.js';
import type { DiscoverySourceAdapter, ListingInput, SourceDescriptor, SourceBatch } from './SourceAdapter.js';

function demoListing(listing:CarListing|TractorListing|ToolListing,category:Category):ListingInput {
  return {id:listing.id,category,title:listing.title,originalUrl:listing.url,
    make:'brand' in listing?listing.brand:listing.make,model:listing.model,price:{amount:listing.priceEur,currency:'EUR'},
    location:{country:'RO',text:listing.locationText,latitude:listing.latitude??null,longitude:listing.longitude??null},
    imageUrl:listing.imageUrl??null,imageUrls:listing.imageUrls,thumbnailUrl:listing.thumbnailUrl??null,
    ...imageMetadata(listing),
    imageRights:listing.imageRights??{status:'UNKNOWN',evidence:null},attributes:{
      ...('year'in listing?{year:listing.year}:{}),...('mileageKm'in listing?{mileageKm:listing.mileageKm}:{}),
      ...('horsepower'in listing?{horsepower:listing.horsepower??null}:{}),...('operatingHours'in listing?{operatingHours:listing.operatingHours}:{}),
      ...('category'in listing?{subcategory:listing.category,condition:listing.condition}:{}),
    }};
}
export class DemoDiscoveryAdapter implements DiscoverySourceAdapter {
  readonly descriptor:SourceDescriptor;
  constructor(private readonly category:Exclude<Category,'equipment'>) {
    this.descriptor={id:'demo-'+category,name:'AutoHunter DEMO '+category,kind:'DEMO',status:'DEMO',categories:[category],
      transport:'LOCAL',configured:true,permission:{dataUse:true,imageDisplay:true,reference:'Synthetic project fixtures; per-photo rights required'},note:'Date sintetice locale, nu anunțuri LIVE.'};
  }
  async load(category:Category):Promise<SourceBatch> {
    if(category!==this.category)throw Error('CATEGORY_NOT_SUPPORTED');
    let listings:ListingInput[],comparables:ListingInput[];
    if(category==='cars'){
      const rows=(await new OlxSourceAdapter({mode:'fixture'}).searchLocal(defaultSearchSettings)).listings;
      listings=rows.map(row=>demoListing(row,category));comparables=[];
    }else if(category==='tractors'){
      const adapter=new DemoTractorSourceAdapter();listings=(await adapter.searchLocal()).listings.map(row=>demoListing(row,category));comparables=(await adapter.searchComparables()).map(row=>demoListing(row,category));
    }else{
      const adapter=new DemoToolSourceAdapter();listings=(await adapter.searchLocal()).listings.map(row=>demoListing(row,category));comparables=(await adapter.searchComparables()).map(row=>demoListing(row,category));
    }
    return {listings,comparables,fetchedAt:new Date().toISOString()};
  }
}

/** An authorized manual file or a feed file delivered by the provider. Never fetches its URL. */
export class LocalJsonSourceAdapter implements DiscoverySourceAdapter {
  constructor(readonly descriptor:SourceDescriptor,private readonly file:string) {
    if(descriptor.transport!=='LOCAL'||!['MANUAL_IMPORT','AUTHORIZED_FEED'].includes(descriptor.kind)||/^(?:https?:|\\\\|\/\/)/i.test(file))throw Error('LOCAL_FILE_REQUIRED');
  }
  async load(_category:Category):Promise<SourceBatch> {
    if((await stat(this.file)).size>10*1024*1024)throw Error('IMPORT_TOO_LARGE');
    const data:unknown=JSON.parse(await readFile(this.file,'utf8'));
    if(!data||typeof data!=='object')throw Error('INVALID_IMPORT');
    const batch=data as Record<string,unknown>;
    if(!Array.isArray(batch.listings)||!Array.isArray(batch.comparables)||batch.listings.length+batch.comparables.length>5000)throw Error('INVALID_IMPORT');
    return {listings:batch.listings,comparables:batch.comparables,fetchedAt:new Date().toISOString()};
  }
}
