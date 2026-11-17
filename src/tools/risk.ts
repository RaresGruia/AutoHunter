import { clamp,normalizeText } from '../analysis/text.js';
import { toolPackage } from './package.js';
import type { ToolListing,ToolRisk } from './types.js';
export function toolRisk(tool:ToolListing):ToolRisk {
  const risk:ToolRisk={mechanicalRisk:0,electricalRisk:0,batteryRisk:0,cosmeticRisk:0,authenticityRisk:0,dataRisk:0,overall:0,dataQuality:100,warnings:[]};
  const text=normalizeText(`${tool.title}. ${tool.description}`), pack=toolPackage(tool);
  const rules:[keyof Pick<ToolRisk,'mechanicalRisk'|'electricalRisk'|'batteryRisk'|'cosmeticRisk'|'authenticityRisk'>,RegExp,number,string][]=[
    ['mechanicalRisk',/motor defect|rulmenti? (?:uzati?|defecti?)|reductor defect|angrenaj defect|nu porneste|carburator (?:defect|infundat)|compresie slaba|pierde ulei|vibreaza excesiv/g,85,'Posibil defect mecanic; necesită probă de funcționare.'],
    ['electricalRisk',/intrerupator defect|cablu taiat|scantei|motor electric defect|perii uzate|nu se alimenteaza/g,85,'Posibil defect electric; necesită verificare.'],
    ['batteryRisk',/acumulator defect|baterie moarta|nu tine bateria/g,80,'Acumulator posibil defect; verifică pachetul și autonomia.'],
    ['cosmeticRisk',/zgarieturi|uzura estetica/g,20,'Urme de uzură cosmetică.'],
    ['cosmeticRisk',/carcasa sparta|maner crapat/g,55,'Carcasă/mâner deteriorat: verifică integritatea și siguranța.'],
    ['authenticityRisk',/replica|copie|compatibil|nu este original|aftermarket/g,55,'Autenticitatea necesită verificare; indiciile pot privi și accesoriile.'],
  ];
  for(const [category,pattern,score,message] of rules) for(const match of text.matchAll(pattern)){
    const before=text.slice(Math.max(0,match.index!-25),match.index);
    if(/(?:fara|nu are|nu prezinta|nu este|nu)\s*$/.test(before))continue;
    risk[category]=Math.max(risk[category],score);if(!risk.warnings.includes(message))risk.warnings.push(message);
  }
  if(tool.condition==='FOR_PARTS'){risk.mechanicalRisk=Math.max(85,risk.mechanicalRisk);risk.warnings.push('Produs declarat pentru piese.');}
  if(tool.identityConfidence<70)risk.dataRisk+=35;
  if(!tool.brand||!tool.model)risk.dataRisk+=15;
  if(tool.condition==='UNKNOWN')risk.dataRisk+=12;
  if(tool.powerSource==='UNKNOWN')risk.dataRisk+=12;
  if(!tool.description.trim())risk.dataRisk+=10;
  if(pack.type==='UNKNOWN')risk.dataRisk+=15;
  if(pack.conflict)risk.dataRisk=Math.max(risk.dataRisk,75);
  risk.dataRisk=clamp(risk.dataRisk);risk.dataQuality=100-risk.dataRisk;
  risk.overall=Math.max(risk.mechanicalRisk,risk.electricalRisk,risk.batteryRisk,risk.cosmeticRisk,risk.authenticityRisk,risk.dataRisk);
  if(risk.dataRisk)risk.warnings.push('Date incomplete sau contradictorii; nu confirma starea doar din scor.');
  return risk;
}
