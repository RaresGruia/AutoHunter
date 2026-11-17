import {test} from 'node:test';
import assert from 'node:assert/strict';
import {DemoToolSourceAdapter} from '../src/tools/demoSource.js';
import {toolIdentity,canonicalToolBrand} from '../src/tools/identity.js';
import {toolPackage} from '../src/tools/package.js';
import {toolRisk} from '../src/tools/risk.js';
import {toolMedian,toolSimilarity,estimateTool,analyzeTool} from '../src/tools/analysis.js';
import {validateToolListing} from '../src/tools/validation.js';
import {defaultToolSettings as defaults,validateToolSettings} from '../src/tools/settings.js';
import {searchTools} from '../src/tools/search.js';
import {TOOL_CATEGORIES,type ToolListing,type ToolSourceAdapter} from '../src/tools/types.js';
import {buildServer} from '../src/api/server.js';

const adapter=new DemoToolSourceAdapter(),local=(await adapter.searchLocal()).listings,market=await adapter.searchComparables(),base=local[0]!;
const row=(changes:Partial<ToolListing>={}):ToolListing=>({...base,description:'Funcționare normală declarată.',...changes});
const pool=(prices=[120,125,128,130,132,135,140,145],changes:Partial<ToolListing>={})=>prices.map((priceEur,i)=>row({id:`c-${i}`,url:`https://example.invalid/c-${i}`,priceEur,...changes}));
const source=(listings:ToolListing[]):ToolSourceAdapter=>({name:'test',category:'tools',searchLocal:async()=>({listings,mode:'DEMO',warnings:[]}),searchComparables:async()=>market});
test('Tool identity normalizes exact Makita and Stihl models and De Walt alias',()=>{
  for(const [title,brand,model,category] of [['Makita DGA504 body only','Makita','DGA504','ANGLE_GRINDER'],['Stihl MS 261','Stihl','MS 261','CHAINSAW'],['De Walt DCD796','DeWalt','DCD796','DRILL']]){
    const identity=toolIdentity({title:title!});assert.equal(identity.brand,brand);assert.equal(identity.model,model);assert.equal(identity.category,category);assert.ok(identity.identityConfidence>=90);
  }
  assert.equal(canonicalToolBrand('Kärcher'),'Karcher');assert.equal(canonicalToolBrand('Black & Decker'),'Black+Decker');
});
test('Bosch Professional stays distinct from Bosch consumer',()=>{
  assert.equal(toolIdentity({title:'Bosch Professional GSR 18V-55'}).brand,'Bosch Professional');
  assert.equal(toolIdentity({title:'Bosch UniversalImpact 800'}).brand,'Bosch');
});
test('Unknown models and contradictory identities are not guessed',()=>{
  assert.equal(toolIdentity({title:'Makita polizor 18V'}).model,null);
  assert.equal(toolIdentity({title:'Sculă de atelier'}).brand,null);
  assert.ok(toolIdentity({title:'Makita DGA504',brand:'DeWalt',model:'DCD796'}).identityConfidence<70);
  assert.ok(toolIdentity({title:'Makita DGA504',category:'CHAINSAW'}).identityConfidence<70);
});
test('Tool categories cover distinct families and validation rejects unknown enums or invented fields',()=>{
  assert.equal(TOOL_CATEGORIES.length,13);validateToolListing(base);
  validateToolListing(row({voltageV:null,batteryAh:null,manufacturingYear:null}));
  for(const change of [{category:'CAR'},{condition:'BROKEN'},{powerSource:'DIESEL'},{batteriesIncluded:1.5},{batteryAh:-1},{priceEur:NaN},{synthetic:'true'},{chargerIncluded:1}])assert.throws(()=>validateToolListing({...base,...change}));
});
for(const [description,field] of [['Motor defect, rulmenți uzați.','mechanicalRisk'],['Cablu tăiat, întrerupător defect.','electricalRisk'],['Acumulator defect, baterie moartă.','batteryRisk']] as const){
  test(`tool risk ${field}`,()=>assert.ok(toolRisk(row({description}))[field]>=70));
}
test('tool cosmetic damage is distinct from mechanical/electrical risk',()=>{
  const risk=toolRisk(row({description:'Zgârieturi și uzură estetică.'}));assert.equal(risk.cosmeticRisk,20);assert.equal(risk.mechanicalRisk,0);assert.equal(risk.electricalRisk,0);
  assert.equal(analyzeTool(row({description:'Carcasă spartă, mâner crăpat'}),pool(),0).classification,'NEEDS_VERIFICATION');
});
test('authenticity indicators ask for verification without asserting counterfeit',()=>{
  const risk=toolRisk(row({description:'Acumulator compatibil aftermarket, copie.'}));assert.ok(risk.authenticityRisk>0);
  assert.match(risk.warnings.join(' '),/Autenticitatea necesită verificare/);assert.doesNotMatch(risk.warnings.join(' '),/contrafăcut/);
});
test('negated defects and deliberate body-only packages are not broken batteries',()=>{
  const tool=row({description:'Body-only, fără acumulator. Nu are motor defect. Fără zgârieturi.'});
  const risk=toolRisk(tool);assert.equal(risk.mechanicalRisk,0);assert.equal(risk.cosmeticRisk,0);assert.equal(risk.batteryRisk,0);
  assert.equal(toolPackage(tool).type,'BODY_ONLY');assert.ok(toolPackage(tool).warnings.length>0);
});
test('kit normalization preserves battery count/capacity, charger, case and incomplete package',()=>{
  const kit=row({batteriesIncluded:2,batteryAh:5,chargerIncluded:true,accessories:['valiză','manual']});
  assert.equal(toolPackage(kit).type,'KIT');assert.equal(toolPackage(kit).caseIncluded,true);assert.equal(toolPackage(kit).batteries,2);
  assert.equal(toolPackage(row({batteriesIncluded:1,chargerIncluded:false})).type,'TOOL_PLUS_BATTERY');
  assert.equal(toolPackage(row({batteriesIncluded:null,chargerIncluded:null})).type,'UNKNOWN');
});
test('conflicting body-only and kit declarations require verification',()=>{
  const tool=row({batteriesIncluded:2,chargerIncluded:true,description:'Body only, fără acumulator.'});
  assert.equal(toolPackage(tool).conflict,true);assert.ok(toolRisk(tool).dataRisk>=70);assert.equal(analyzeTool(tool,pool(),0).classification,'NEEDS_VERIFICATION');
});
test('same exact model and package comparables beat other models and categories',()=>{
  assert.equal(toolSimilarity(base,base).level,'EXACT');
  assert.equal(toolSimilarity(base,row({model:'DGA999'})).score,0);
  assert.equal(toolSimilarity(base,row({category:'DRILL'})).score,0);
  const estimate=estimateTool(base,[...pool(),...pool([800,850,900],{model:'Other'})]);assert.equal(estimate.matchQuality,'EXACT');assert.ok(estimate.estimatedMarketPrice!<150);
});
test('body-only versus kit is RELAXED and reduces confidence strongly',()=>{
  const exact=estimateTool(base,pool()),relaxed=estimateTool(base,pool([220,230,240,245,250,255],{batteriesIncluded:2,batteryAh:5,chargerIncluded:true}));
  assert.equal(relaxed.matchQuality,'RELAXED');assert.ok(relaxed.confidence<exact.confidence*0.4);assert.ok(relaxed.confidence<30);
  const result=analyzeTool(base,pool([220,230,240,245,250,255],{batteriesIncluded:2,batteryAh:5,chargerIncluded:true}),0);
  assert.notEqual(result.classification,'GREAT_DEAL');assert.match(result.warnings.join(' '),/Configurații/);
});
test('battery capacity/count and condition reduce matching quality without mixing petrol and electric',()=>{
  const kit=row({batteriesIncluded:2,batteryAh:5,chargerIncluded:true});
  assert.equal(toolSimilarity(kit,{...kit,batteriesIncluded:1,batteryAh:2}).level,'GOOD');
  assert.equal(toolSimilarity(base,row({condition:'NEW'})).level,'GOOD');
  assert.equal(toolSimilarity(row({powerSource:'PETROL'}),row({powerSource:'CORDED'})).score,0);
});
test('tool median handles odd/even/empty input and prudent outlier removal',()=>{
  assert.equal(toolMedian([3,1,2]),2);assert.equal(toolMedian([4,1,3,2]),2.5);assert.equal(toolMedian([NaN,Infinity]),null);
  const estimate=estimateTool(base,pool([100,105,110,115,10000]));assert.equal(estimate.comparableCount,4);assert.equal(estimate.estimatedMarketPrice,108);
});
test('estimator requires three unique safe comparables, without inventing market price',()=>{
  assert.equal(estimateTool(base,pool([100,110])).estimatedMarketPrice,null);
  const two=pool([100,110]);assert.equal(estimateTool(base,[...two,two[0]!]).estimatedMarketPrice,null);
  assert.equal(estimateTool(base,pool(undefined,{description:'Motor defect'})).estimatedMarketPrice,null);
});
test('Tool Deal favors safe discounts and absolute savings',()=>{
  const cheap=analyzeTool(row({priceEur:80}),pool(),0),expensive=analyzeTool(row({priceEur:200}),pool(),0);
  assert.ok(cheap.scores.deal>expensive.scores.deal);assert.ok(cheap.price.potentialSavingEur!>0);
});
test('Tool Quality is independent of price and brand prestige',()=>{
  const result=analyzeTool(base,pool(),0);
  assert.equal(result.scores.toolQuality,analyzeTool(row({priceEur:900}),pool(),0).scores.toolQuality);
  assert.equal(result.scores.toolQuality,analyzeTool(row({brand:'Einhell'}),pool(),0).scores.toolQuality);
  assert.ok(result.qualityReasons.length>=3);
});
test('Flip favors safe discounts and penalizes electrical, battery and authenticity issues',()=>{
  const safe=analyzeTool(row({priceEur:70}),pool(),0);assert.ok(safe.scores.flipPotential>0);
  for(const description of ['Motor electric defect','Baterie moartă','Replică'])assert.ok(analyzeTool(row({priceEur:30,description}),pool(),0).scores.flipPotential<=10);
  assert.equal(analyzeTool(row({priceEur:200}),pool(),0).scores.flipPotential,0);
});
for(const [name,changes,classification] of [['discount',{priceEur:70},'GREAT_DEAL'],['expensive',{priceEur:250},'POOR_VALUE'],['broken',{priceEur:20,description:'Motor defect'},'NEEDS_VERIFICATION']] as const){
  test(`tool classification ${name}`,()=>assert.equal(analyzeTool(row(changes),pool(),0).classification,classification));
}
test('tool radius excludes distant listings and unknown coordinates have a warning',async()=>{
  const result=await searchTools(defaults,source([base,row({id:'far',url:'https://example.invalid/far',latitude:44.4,longitude:26.1}),row({id:'unknown',url:'https://example.invalid/unknown',latitude:null,longitude:null})]));
  assert.equal(result.results.length,2);const missing=result.results.find(r=>r.listing.id==='unknown')!;assert.equal(missing.distanceKm,null);assert.match(missing.warnings.join(' '),/raza nu poate fi confirmată/);
});
test('tool price, condition and category filters work together',async()=>{
  const result=await searchTools({...defaults,minPriceEur:100,maxPriceEur:200,categories:['DRILL'],condition:'USED'},adapter);assert.ok(result.results.length>0);
  assert.ok(result.results.every(r=>r.listing.priceEur>=100&&r.listing.priceEur<=200&&r.listing.category==='DRILL'&&r.listing.condition==='USED'));
});
test('excludeBroken removes defects but retains body-only and authenticity warnings',async()=>{
  const listings=['Motor defect','Cablu tăiat','Baterie moartă','Body only, fără acumulator','Replică'].map((description,i)=>row({id:`r-${i}`,url:`https://example.invalid/r-${i}`,description}));
  assert.equal((await searchTools(defaults,source(listings))).results.length,2);
  assert.equal((await searchTools({...defaults,excludeBroken:false},source(listings))).results.length,5);
});
test('tool DEMO source contains 84 locals and 144 synthetic comparables and returns ranked top 30',async()=>{
  assert.equal(local.length,84);assert.equal(market.length,144);
  for(const c of [...local,...market]){assert.equal(c.synthetic,true);assert.equal(new URL(c.url).hostname,'example.invalid');assert.ok(c.imageUrls.every(url=>url.startsWith('/demo-images/tools/'+c.id+'/')));}
  for(const limit of [10,20,30]){const result=await searchTools({...defaults,limit},adapter);assert.equal(result.results.length,limit);assert.equal(result.meta.mode,'DEMO');
    assert.ok(result.results.every((r,i)=>i===0||result.results[i-1]!.scores.opportunity>=r.scores.opportunity));assert.doesNotMatch(JSON.stringify(result),/rawData/);}
});
test('tool settings reject bad radii, budgets, enum lists and unknown coordinates',()=>{
  for(const change of [{radiusKm:9},{radiusKm:501},{maxPriceEur:10},{minPriceEur:-1},{limit:15},{location:'Unknown'},{categories:[]},{categories:['DRILL','DRILL']},{origin:{latitude:91,longitude:0}}])assert.throws(()=>validateToolSettings({...defaults,...change} as typeof defaults));
  validateToolSettings({...defaults,location:'Custom',origin:{latitude:45,longitude:23}});
});
test('Tools jobs return 202 RUNNING, reject duplicate POST and complete with current result',async t=>{
  let release!:()=>void;const gate=new Promise<void>(r=>{release=r;});
  const app=await buildServer({mode:'DEMO',toolSearch:async s=>{await gate;return searchTools(s,adapter);}});t.after(async()=>{release();await app.close();});
  assert.equal((await app.inject('/api/tools/search/current')).json(),null);
  const accepted=await app.inject({method:'POST',url:'/api/tools/search',payload:defaults});assert.equal(accepted.statusCode,202);const {searchId}=accepted.json();
  assert.equal((await app.inject(`/api/tools/search/${searchId}`)).json().status,'RUNNING');
  const duplicate=await app.inject({method:'POST',url:'/api/tools/search',payload:defaults});assert.equal(duplicate.statusCode,409);assert.equal(duplicate.json().searchId,searchId);
  for(const category of ['cars','tractors'])assert.equal((await app.inject(`/api/${category}/search/current`)).json(),null);
  release();for(let i=0;i<300;i++){const job=(await app.inject(`/api/tools/search/${searchId}`)).json();if(job.status!=='RUNNING'){assert.equal(job.status,'COMPLETED');assert.equal(job.response.results.length,30);break;}if(i===299)assert.fail('job timeout');await new Promise(r=>setTimeout(r,5));}
  assert.equal((await app.inject('/api/tools/search/current')).json().status,'COMPLETED');assert.equal((await app.inject('/api/tools/search/missing')).statusCode,404);
});
test('Tools LIVE unavailable and invalid settings never invoke the engine',async t=>{
  let calls=0;const engine=async()=>{calls++;throw Error();};const live=await buildServer({mode:'LIVE',toolSearch:engine}),demo=await buildServer({mode:'DEMO',toolSearch:engine});
  t.after(async()=>{await live.close();await demo.close();});
  const rejected=await live.inject({method:'POST',url:'/api/tools/search',payload:defaults});assert.equal(rejected.statusCode,501);assert.equal(rejected.json().error.code,'CATEGORY_NOT_AVAILABLE_IN_LIVE_MODE');
  for(const change of [{limit:1},{categories:['CAR']},{condition:'BAD'},{excludeBroken:'true'},{extra:1},{location:'Unknown'},{maxPriceEur:5}])assert.equal((await demo.inject({method:'POST',url:'/api/tools/search',payload:{...defaults,...change}})).statusCode,400);
  assert.equal(calls,0);
});
test('Tools failed jobs are safe and free the category slot',async t=>{
  const app=await buildServer({mode:'DEMO',toolSearch:async()=>{throw Error('PRIVATE');}});t.after(()=>app.close());
  const accepted=await app.inject({method:'POST',url:'/api/tools/search',payload:defaults});await new Promise(r=>setImmediate(r));
  const response=await app.inject(`/api/tools/search/${accepted.json().searchId}`);assert.equal(response.json().status,'FAILED');assert.doesNotMatch(response.body,/PRIVATE/);
  assert.equal((await app.inject({method:'POST',url:'/api/tools/search',payload:defaults})).statusCode,202);
});
test('Tools DEMO uses actual fixture engine and health capability with ZERO external network',async t=>{
  const old=process.env.AUTOHUNTER_MODE;process.env.AUTOHUNTER_MODE='demo';let calls=0;
  t.mock.method(globalThis,'fetch',async()=>{calls++;throw Error('Forbidden external request');});const app=await buildServer();
  t.after(async()=>{await app.close();if(old===undefined)delete process.env.AUTOHUNTER_MODE;else process.env.AUTOHUNTER_MODE=old;});
  const health=(await app.inject('/health')).json();assert.equal(health.mode,'DEMO');assert.deepEqual(health.categories.tools,{demo:true,live:false});assert.deepEqual(health.categories.equipment,{demo:false,live:false});
  const accepted=await app.inject({method:'POST',url:'/api/tools/search',payload:defaults});assert.equal(accepted.statusCode,202);
  for(let i=0;i<300;i++){const job=(await app.inject(`/api/tools/search/${accepted.json().searchId}`)).json();if(job.status!=='RUNNING'){assert.equal(job.status,'COMPLETED');assert.equal(job.response.meta.mode,'DEMO');assert.equal(job.response.results.length,30);break;}if(i===299)assert.fail('job timeout');await new Promise(r=>setTimeout(r,5));}
  assert.equal(calls,0);
});

test('tools image metadata does not change analysis or scores',()=>{
  const before=analyzeTool(base,market,0);
  const after=analyzeTool({...base,imageUrl:'/demo-images/tools/'+base.id+'/01.jpg',imageUrls:['/demo-images/tools/'+base.id+'/02.jpg'],thumbnailUrl:'/demo-images/tools/'+base.id+'/thumbnail.jpg'},market,0);
  const {listing:_before,...a}=before;const {listing:_after,...b}=after;assert.deepEqual(a,b);
});
