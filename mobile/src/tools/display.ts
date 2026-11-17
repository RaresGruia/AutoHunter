import type {ToolCategory,ToolResult} from './types';
export const toolCategoryLabels:Record<ToolCategory,string>={DRILL:'Bormașină',IMPACT_DRIVER:'Mașină de înșurubat cu impact',ANGLE_GRINDER:'Polizor unghiular',
  CIRCULAR_SAW:'Fierăstrău circular',CHAINSAW:'Drujbă',DEMOLITION_HAMMER:'Ciocan demolator',WELDER:'Aparat de sudură',COMPRESSOR:'Compresor',
  PRESSURE_WASHER:'Aparat de spălat cu presiune',GENERATOR:'Generator',MOWER:'Mașină de tuns iarba',BRUSHCUTTER:'Motocoasă',OTHER:'Alte scule'};
export const toolConditionLabels={NEW:'Nouă',LIKE_NEW:'Aproape nouă',USED:'Folosită',FOR_PARTS:'Pentru piese',UNKNOWN:'Stare necunoscută'};
export const powerLabels={BATTERY:'Acumulator',CORDED:'La priză',PETROL:'Benzină',MANUAL:'Manuală',PNEUMATIC:'Pneumatică',UNKNOWN:'Necunoscută'};
export const toolClassificationLabels={GREAT_DEAL:'🔥 Chilipir',GOOD_DEAL:'✅ Ofertă bună',INTERESTING:'👀 Sculă interesantă',FAIR:'Preț de evaluat',POOR_VALUE:'Preț ridicat',NEEDS_VERIFICATION:'Necesită verificare'};
export const toolRiskLabels={mechanicalRisk:'Mecanic',electricalRisk:'Electric',batteryRisk:'Acumulator',cosmeticRisk:'Cosmetic',authenticityRisk:'Autenticitate',dataRisk:'Date'};
export function toolPackageLabel(row:ToolResult):string {
  if(row.package.conflict)return 'Pachet de clarificat';
  if(row.package.type==='BODY_ONLY')return row.listing.powerSource==='BATTERY'?'Doar scula, fără acumulator':'Sculă + accesoriile declarate';
  if(row.package.type==='UNKNOWN')return 'Pachet necunoscut';
  return `${row.package.batteries??'?'} acumulator${row.package.batteries===1?'':'i'}${row.package.batteryAh===null?'':` · ${row.package.batteryAh} Ah`}${row.package.charger===true?' + încărcător':''}`;
}
export function toolScoreLabels(row:ToolResult):string[]{return [`🔥 Deal: ${row.scores.deal}`,`🔧 Quality: ${row.scores.toolQuality}`,`💰 Flip: ${row.scores.flipPotential}`];}
export function toolFacts(row:ToolResult):[string,string][]{const c=row.listing;return [
  ['Marcă / model',[c.brand,c.model].filter(Boolean).join(' ')||null],['Categorie',toolCategoryLabels[c.category]],['Subcategorie',c.subcategory],
  ['Stare',c.condition==='UNKNOWN'?null:toolConditionLabels[c.condition]],['Alimentare',c.powerSource==='UNKNOWN'?null:powerLabels[c.powerSource]],
  ['Putere',c.powerWatts===null?null:`${c.powerWatts} W`],['Tensiune',c.voltageV===null?null:`${c.voltageV} V`],['Capacitate',c.batteryAh===null?null:`${c.batteryAh} Ah`],
  ['Acumulatori',c.batteriesIncluded===null?null:String(c.batteriesIncluded)],['Încărcător',c.chargerIncluded===null?null:c.chargerIncluded?'Inclus':'Neinclus'],
  ['Cilindree',c.engineCc===null?null:`${c.engineCc} cm³`],['Putere motor',c.horsepower===null?null:`${c.horsepower} CP`],
  ['An fabricație',c.manufacturingYear===null?null:String(c.manufacturingYear)],['Accesorii',c.accessories.length?c.accessories.join(', '):null],['Pachet',toolPackageLabel(row)],
].filter((pair):pair is [string,string]=>typeof pair[1]==='string'&&pair[1].length>0);}
export function isDemoTool(row:ToolResult,mode:'DEMO'|'LIVE'|null):boolean{return mode==='DEMO'||row.listing.synthetic||row.listing.url.includes('example.invalid');}
