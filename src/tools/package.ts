import { normalizeText } from '../analysis/text.js';
import type { ToolListing,ToolPackage } from './types.js';
export function toolPackage(tool:ToolListing):ToolPackage {
  const text=normalizeText(`${tool.title}. ${tool.description}`);
  const body=/body[ -]?only|doar corpul|fara acumulator|fara baterie/.test(text);
  const conflict=tool.powerSource==='BATTERY' && body && (tool.batteriesIncluded??0)>0;
  const batteries=tool.batteriesIncluded, charger=tool.chargerIncluded;
  const warnings=conflict?['Pachet contradictoriu: textul indică body-only, dar sunt declarați acumulatori incluși.']:[];
  let type:ToolPackage['type']='UNKNOWN';
  if(!conflict && tool.powerSource==='BATTERY') {
    if(batteries===0 || (body && batteries===null)) type='BODY_ONLY';
    else if(batteries!==null && batteries>0) type=charger===true?'KIT':'TOOL_PLUS_BATTERY';
  } else if(!conflict && tool.powerSource!=='UNKNOWN') type='BODY_ONLY';
  if(tool.powerSource==='BATTERY' && type==='BODY_ONLY') warnings.push('Body-only: acumulatorul nu este inclus; acest lucru nu indică un defect.');
  if(type==='TOOL_PLUS_BATTERY' && charger!==true) warnings.push('Încărcătorul nu este confirmat în pachet.');
  const completeness=conflict?0:type==='KIT'?100:type==='BODY_ONLY'?90:type==='TOOL_PLUS_BATTERY'?65:30;
  return {type,batteries,batteryAh:tool.batteryAh,charger,caseIncluded:tool.accessories.some(a=>/valiza|cutie de transport|case/.test(normalizeText(a))),completeness,conflict,warnings};
}
