import type { Category } from '../categories/category.js';
import type { CommonListing } from './SourceAdapter.js';
import { SourceRegistry, sourceBlockReason } from './registry.js';
import { deduplicate, normalizeListing } from './normalize.js';

export class DiscoveryService {
  constructor(readonly registry: SourceRegistry, private readonly options: {allowExternal?:boolean;eurPerRon?:number} = {}) {}
  async search(category: Category, mode: 'DEMO'|'IMPORTED'|'LIVE' = 'DEMO') {
    const listings:CommonListing[]=[],comparables:CommonListing[]=[],sources:{id:string;status:string;accepted:number;rejected:number}[]=[];
    for(const {descriptor,adapter}of this.registry.entries()) {
      if(!descriptor.categories.includes(category))continue;
      const sourceMode=descriptor.kind==='DEMO'?'DEMO':descriptor.transport==='LOCAL'?'IMPORTED':'LIVE';
      if(sourceMode!==mode)continue;
      const blocked=sourceBlockReason(descriptor,this.options.allowExternal===true);
      if(blocked||!adapter){sources.push({id:descriptor.id,status:blocked??'ADAPTER_NOT_IMPLEMENTED',accepted:0,rejected:0});continue;}
      try {
        const batch=await adapter.load(category);let accepted=0,rejected=0;
        for(const [rows,target]of [[batch.listings,listings],[batch.comparables,comparables]] as const)for(const row of rows){
          if(!row||typeof row!=='object'){rejected++;continue;}
          if(row.category!==category)continue;
          try{target.push(normalizeListing(row,descriptor,batch.fetchedAt,this.options.eurPerRon));accepted++;}catch{rejected++;}
        }
        sources.push({id:descriptor.id,status:rejected?'PARTIAL':'OK',accepted,rejected});
      }catch{sources.push({id:descriptor.id,status:'SOURCE_FAILED',accepted:0,rejected:0});}
    }
    const results=deduplicate(listings),pool=deduplicate([...listings,...comparables]);
    return {meta:{category,mode,sources,fetched:listings.length,duplicatesRemoved:listings.length-results.length,
      analysis:'DISCOVERY_ONLY' as const,warning:'Colecție normalizată; nu este un clasament Deal Score. Motorul existent de analiză nu a fost modificat.'},results,comparables:pool.filter(group=>!group.priceConflict)};
  }
}
