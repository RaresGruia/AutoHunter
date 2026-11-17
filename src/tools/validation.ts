import {TOOL_CATEGORIES,TOOL_CONDITIONS,POWER_SOURCES,type ToolListing} from './types.js';
export function validateToolListing(value:unknown):asserts value is ToolListing {
  if(!value||typeof value!=='object')throw Error('Invalid tool listing');
  const r=value as Record<string,unknown>,fail=()=>{throw Error('Invalid tool listing');};
  for(const k of ['id','source','url','title','locationText','description'])if(typeof r[k]!=='string')fail();
  if(!r.id||!r.title||!r.source)fail();
  try{if(!['http:','https:'].includes(new URL(String(r.url)).protocol))fail();}catch{fail();}
  for(const k of ['brand','model','subcategory','sellerType','publishedAt'])if(r[k]!==null&&typeof r[k]!=='string')fail();
  if(!TOOL_CATEGORIES.some(v=>v===r.category)||!TOOL_CONDITIONS.some(v=>v===r.condition)||!POWER_SOURCES.some(v=>v===r.powerSource))fail();
  for(const [k,min,max] of [['priceEur',0.01,1000000],['identityConfidence',0,100]] as const){const n=r[k];if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)fail();}
  for(const [k,min,max] of [['powerWatts',0,1000000],['voltageV',0,1000],['batteryAh',0,1000],['engineCc',0,10000],['horsepower',0,1000],
    ['batteriesIncluded',0,100],['manufacturingYear',1900,new Date().getFullYear()+1],['latitude',-90,90],['longitude',-180,180]] as const){
    const n=r[k];if(n!==null&&(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max))fail();
  }
  for(const k of ['batteriesIncluded','manufacturingYear'])if(r[k]!==null&&!Number.isInteger(r[k]))fail();
  if(r.chargerIncluded!==null&&typeof r.chargerIncluded!=='boolean')fail();
  if(typeof r.synthetic!=='boolean')fail();
  for(const k of ['accessories','imageUrls'])if(!Array.isArray(r[k])||!r[k].every(v=>typeof v==='string'))fail();
  for (const key of ['imageUrl','thumbnailUrl']) {
    const value = r[key];
    if (value !== undefined && value !== null && typeof value !== 'string') throw new Error('Invalid listing image');
  }
}
