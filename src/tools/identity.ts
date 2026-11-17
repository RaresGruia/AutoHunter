import { normalizeText } from '../analysis/text.js';
import type { ToolCategory } from './types.js';
export const toolBrands = ['Bosch Professional','Black+Decker','Makita','Bosch','DeWalt','Milwaukee','Hilti','Metabo','Festool','Einhell','Parkside','Ryobi','Stihl','Husqvarna','Karcher','Honda','Stanley','Dremel','Ruris','Hecht'];
const key = (s:string) => normalizeText(s).replace(/[^a-z0-9]/g,'');
export function canonicalToolBrand(s:string):string|null { return toolBrands.find(b=>key(b)===key(s)) ?? (key(s)==='blackanddecker'?'Black+Decker':null); }
// Only recognized model designations are inferred from titles. Unknown models stay unknown.
export const toolModels: readonly [string,string,ToolCategory][] = [
  ['Makita','DGA504','ANGLE_GRINDER'],['Makita','DDF484','DRILL'],['Bosch Professional','GSR 18V-55','DRILL'],
  ['Bosch','UniversalImpact 800','DRILL'],['DeWalt','DCD796','DRILL'],['Milwaukee','M18 FID2','IMPACT_DRIVER'],
  ['Hilti','TE 30','DEMOLITION_HAMMER'],['Einhell','TC-CS 1410','CIRCULAR_SAW'],['Parkside','PWS 125','ANGLE_GRINDER'],
  ['Stihl','MS 261','CHAINSAW'],['Husqvarna','135 Mark II','CHAINSAW'],['Karcher','K5','PRESSURE_WASHER'],
  ['Ruris','DAC 150XL','BRUSHCUTTER'],['Honda','EU22i','GENERATOR'],['Stanley','DN200','COMPRESSOR'],
  ['Hecht','1802','MOWER'],['Ruris','AS 200','WELDER'],['Metabo','W 850-125','ANGLE_GRINDER'],
];
export function toolIdentity(input:{title:string;brand?:string|null;model?:string|null;category?:ToolCategory}) {
  const titleKey=key(input.title), detected=toolBrands.filter(b=>titleKey.includes(key(b)));
  if(detected.includes('Bosch Professional')) detected.splice(detected.indexOf('Bosch'),1);
  const explicit=input.brand?canonicalToolBrand(input.brand):null;
  const brands=[...new Set([...detected,...(explicit?[explicit]:[])])];
  if(brands.length!==1) return {brand:null,model:null,category:input.category??'OTHER',identityConfidence:brands.length?15:0};
  const brand=brands[0]!;
  const matches=toolModels.filter(([b,m])=>b===brand && titleKey.includes(key(m)));
  const known=input.model?toolModels.find(([b,m])=>b===brand && key(m)===key(input.model!)):undefined;
  const model=input.model?.trim()?known?.[1]??input.model.trim():matches.length===1?matches[0]![1]:null;
  const modelConflict=matches.length>1 || !!(model && matches.length===1 && key(model)!==key(matches[0]![1]));
  const category=known?.[2]??matches[0]?.[2]??input.category??'OTHER';
  const categoryConflict=input.category && input.category!=='OTHER' && input.category!==category;
  if(modelConflict || categoryConflict) return {brand,model:null,category:input.category??category,identityConfidence:25};
  return {brand,model,category,identityConfidence:model?(known||matches.length===1?95:75):35};
}
