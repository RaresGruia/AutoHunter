import {clamp,normalizeText} from '../analysis/text.js';
import {toolPackage} from './package.js';
import {toolRisk} from './risk.js';
import type {ToolListing,ToolEstimate,ToolResult,ToolClassification} from './types.js';
export function toolMedian(values:readonly number[]):number|null {
  const s=values.filter(Number.isFinite).sort((a,b)=>a-b),n=s.length;
  return n?n%2?s[Math.floor(n/2)]!:(s[n/2-1]!+s[n/2]!)/2:null;
}
const identityKey=(s:string)=>normalizeText(s).replace(/[^a-z0-9]/g,'');
export function toolSimilarity(a:ToolListing,b:ToolListing):{score:number;level:ToolEstimate['matchQuality']} {
  const none={score:0,level:'UNAVAILABLE' as const};
  if(!a.brand||!b.brand||!a.model||!b.model||a.identityConfidence<70||b.identityConfidence<70
    ||identityKey(a.brand)!==identityKey(b.brand)||identityKey(a.model)!==identityKey(b.model)||a.category!==b.category
    ||a.powerSource==='UNKNOWN'||a.powerSource!==b.powerSource||a.condition==='FOR_PARTS'||b.condition==='FOR_PARTS')return none;
  const pa=toolPackage(a),pb=toolPackage(b);
  if(pa.conflict||pb.conflict)return none;
  const comparableNumber=(x:number|null,y:number|null,tolerance:number)=>x!==null&&y!==null&&Math.abs(x-y)<=Math.max(0.1,x*tolerance);
  const samePackage=pa.type!=='UNKNOWN'&&pa.type===pb.type;
  const batteryMatch=a.powerSource!=='BATTERY'||(pa.batteries!==null&&pa.batteries===pb.batteries&&pa.charger===pb.charger
    &&(pa.batteries===0||comparableNumber(pa.batteryAh,pb.batteryAh,0.2)));
  const similarCondition=a.condition===b.condition&&a.condition!=='UNKNOWN';
  let score=40+(similarCondition?15:a.condition!=='UNKNOWN'&&b.condition!=='UNKNOWN'?5:0)+(samePackage?15:0)+(batteryMatch?10:0);
  for(const field of ['powerWatts','voltageV','engineCc','horsepower'] as const){
    if(a[field]!==null&&b[field]!==null){if(comparableNumber(a[field],b[field],0.2))score+=2;else score-=12;}
  }
  const accessoriesA=new Set(a.accessories.map(normalizeText)), accessoriesB=new Set(b.accessories.map(normalizeText));
  const union=new Set([...accessoriesA,...accessoriesB]);
  score+=union.size?10*[...accessoriesA].filter(v=>accessoriesB.has(v)).length/union.size:10;
  const level:ToolEstimate['matchQuality']=samePackage&&batteryMatch&&similarCondition?'EXACT':samePackage&&pa.type!=='UNKNOWN'?'GOOD':'RELAXED';
  return {score:Math.round(clamp(score)),level};
}
export function estimateTool(listing:ToolListing,pool:readonly ToolListing[]):ToolEstimate {
  const seen=new Set<string>(),urls=new Set<string>();
  const candidates=pool.flatMap(c=>{
    const id=`${c.source}:${c.id}`,similarity=toolSimilarity(listing,c),risk=toolRisk(c);
    if(id===`${listing.source}:${listing.id}`||c.url===listing.url||seen.has(id)||urls.has(c.url)||!Number.isFinite(c.priceEur)||c.priceEur<=0)return [];
    seen.add(id);urls.add(c.url);
    if(similarity.score<40||Math.max(risk.mechanicalRisk,risk.electricalRisk,risk.batteryRisk,risk.authenticityRisk,risk.dataRisk)>=35||risk.cosmeticRisk>=40)return [];
    return [{listing:c,...similarity}];
  });
  const exact=candidates.filter(c=>c.level==='EXACT'),good=candidates.filter(c=>c.level!=='RELAXED');
  const selected=(exact.length>=3?exact:good.length>=3?good:candidates).sort((a,b)=>b.score-a.score).slice(0,20);
  const center=toolMedian(selected.map(c=>c.listing.priceEur));
  const mad=center===null?0:toolMedian(selected.map(c=>Math.abs(c.listing.priceEur-center)))!;
  const retained=center===null?[]:selected.filter(c=>Math.abs(c.listing.priceEur-center)<=Math.max(center*0.3,3*1.4826*mad));
  const empty:ToolEstimate={estimatedMarketPrice:null,discountPercent:null,potentialSavingEur:null,comparableCount:retained.length,confidence:0,similarityAverage:null,matchQuality:'UNAVAILABLE'};
  if(retained.length<3)return empty;
  const price=toolMedian(retained.map(c=>c.listing.priceEur))!;
  const similarityAverage=Math.round(retained.reduce((sum,c)=>sum+c.score,0)/retained.length);
  const matchQuality=retained.some(c=>c.level==='RELAXED')?'RELAXED':retained.some(c=>c.level==='GOOD')?'GOOD':'EXACT';
  const dispersion=toolMedian(retained.map(c=>Math.abs(c.listing.priceEur-price)))!/price;
  const confidence=Math.round((retained.length>=6?90:retained.length>=4?75:60)*similarityAverage/100
    *Math.max(0.3,1-2*dispersion)*(matchQuality==='EXACT'?1:matchQuality==='GOOD'?0.7:0.25));
  return {estimatedMarketPrice:Math.round(price),discountPercent:Math.round((price-listing.priceEur)/price*1000)/10,
    potentialSavingEur:Math.round(price-listing.priceEur),comparableCount:retained.length,confidence,similarityAverage,matchQuality};
}
export function analyzeTool(listing:ToolListing,pool:readonly ToolListing[],distanceKm:number|null):ToolResult {
  const risks=toolRisk(listing),pack=toolPackage(listing),price=estimateTool(listing,pool);
  price.confidence=Math.round(price.confidence*risks.dataQuality/100*(distanceKm===null?0.8:1));
  const severe=Math.max(risks.mechanicalRisk,risks.electricalRisk,risks.batteryRisk,risks.authenticityRisk);
  const unsafe=severe>=50||risks.dataRisk>=50||risks.cosmeticRisk>=50||listing.condition==='FOR_PARTS';
  const confidence=price.confidence/100,discount=clamp((price.discountPercent??0)/30,0,1),saving=clamp((price.potentialSavingEur??0)/200,0,1);
  const deal=Math.round(clamp((60*discount+20*saving+20)*confidence*(0.75+pack.completeness/400)-severe-risks.dataRisk*0.3-risks.cosmeticRisk*0.15,0,
    unsafe?20:(price.discountPercent??0)<0?Math.max(0,25+(price.discountPercent??0)):100));
  const conditionPoints={NEW:50,LIKE_NEW:44,USED:32,FOR_PARTS:0,UNKNOWN:10}[listing.condition];
  const toolQuality=Math.round(clamp(conditionPoints+risks.dataQuality*0.2+pack.completeness*0.1
    +(listing.model&&listing.identityConfidence>=70?10:0)+Math.min(5,listing.accessories.length*2)+(listing.sellerType?3:0)+(listing.publishedAt?2:0)
    -severe*0.65-risks.cosmeticRisk*0.3,0,unsafe?35:100));
  const flipPotential=discount===0?0:Math.round(clamp((50*discount+25*saving+15*clamp(price.comparableCount/8,0,1)
    +(risks.cosmeticRisk>0&&risks.cosmeticRisk<=20?5:0)+(pack.type==='KIT'?5:0))*confidence*risks.dataQuality/100-severe-risks.cosmeticRisk*0.15,0,unsafe?10:100));
  let classification:ToolClassification='FAIR';
  if(unsafe)classification='NEEDS_VERIFICATION';
  else if((price.discountPercent??0)>=15&&price.confidence>=45)classification='GREAT_DEAL';
  else if((price.discountPercent??0)>=7&&price.confidence>=40)classification='GOOD_DEAL';
  else if((price.discountPercent??0)<=-15&&price.confidence>=30)classification='POOR_VALUE';
  else if(toolQuality>=75)classification='INTERESTING';
  const opportunity=Math.round(clamp(deal*0.5+toolQuality*0.3+flipPotential*0.2-severe*0.2,0,unsafe?20:classification==='POOR_VALUE'?30:100));
  const qualityReasons=[`Stare declarată: ${listing.condition}; nu este o inspecție fizică.`,
    listing.model&&listing.identityConfidence>=70?'Model identificat clar; fără puncte pentru prestigiul mărcii.':'Identitate insuficient documentată.',
    `Completitudinea pachetului declarat: ${pack.completeness}/100.`,`${listing.accessories.length} accesorii declarate.`];
  const positiveReasons:string[]=[];
  if((price.discountPercent??0)>0)positiveReasons.push(`${price.discountPercent}% sub piața estimată, înainte de costuri.`);
  if(price.comparableCount>=3)positiveReasons.push(`${price.comparableCount} comparabile pentru același model; potrivire ${price.matchQuality}.`);
  const warnings=[...risks.warnings,...pack.warnings,'Starea și accesoriile trebuie verificate; economia nu este profit net.'];
  if(price.estimatedMarketPrice===null)warnings.push('Piață insuficientă: minimum trei comparabile sigure necesare.');
  if(price.matchQuality==='RELAXED')warnings.push('Configurații de pachet diferite: estimare cu încredere puternic redusă.');
  if((price.discountPercent??0)<0)warnings.push('Preț peste piața estimată.');
  if(distanceKm===null)warnings.push('Coordonate lipsă: raza nu poate fi confirmată.');
  const {rawData:_raw,...safe}=listing;
  return {listing:safe,package:pack,price,scores:{deal,toolQuality,flipPotential,opportunity},classification,risks,positiveReasons,qualityReasons,warnings,distanceKm};
}
