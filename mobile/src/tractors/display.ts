import type { TractorResult } from './types';
import { numberText } from '../display';
export const tractorLabels:Record<string,string>={GREAT_DEAL:'🔥 Chilipir',GOOD_DEAL:'✅ Ofertă bună',INTERESTING:'👀 Tractor interesant',FAIR:'Preț de evaluat',POOR_VALUE:'⚠️ Preț ridicat',NEEDS_VERIFICATION:'🔎 Necesită verificare'};
export function tractorFacts(row:TractorResult):[string,string][]{const c=row.listing;return [
  ['Marcă / model',[c.make,c.model].filter(Boolean).join(' ')||null],['An',c.year===null?null:String(c.year)],
  ['Putere',c.horsepower===null?null:`${numberText(c.horsepower)} CP`],['Ore',c.operatingHours===null?null:`${numberText(c.operatingHours)} ore`],
  ['Motor',c.engine],['Combustibil',c.fuel],['Transmisie',c.transmission],['Tracțiune',c.drivetrain==='UNKNOWN'?null:c.drivetrain],
  ['Cabină',c.cabin],['Încărcător frontal',c.frontLoader===null?null:c.frontLoader?'Da':'Nu'],['Documente',c.documents],['Înmatriculare',c.registrationStatus],
].filter((pair):pair is [string,string]=>typeof pair[1]==='string'&&pair[1].length>0);}
export const demoLabel=(mode:string|undefined)=>mode==='DEMO'?'MOD DEMONSTRAȚIE — date sintetice':null;
