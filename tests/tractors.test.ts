import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DemoTractorSourceAdapter } from '../src/tractors/demoSource.js';
import { validateTractorListing } from '../src/tractors/validation.js';
import { tractorIdentity } from '../src/tractors/identity.js';
import { tractorRisk } from '../src/tractors/risk.js';
import { tractorMedian, tractorSimilarity, estimateTractor, analyzeTractor } from '../src/tractors/analysis.js';
import { searchTractors } from '../src/tractors/search.js';
import { defaultTractorSettings as defaults, validateTractorSettings } from '../src/tractors/settings.js';
import type { TractorListing, TractorSourceAdapter } from '../src/tractors/types.js';
import { buildServer } from '../src/api/server.js';
import { runtimeMode } from '../src/config/runtimeMode.js';

const adapter = new DemoTractorSourceAdapter();
const local = (await adapter.searchLocal()).listings;
const market = await adapter.searchComparables();
const base = local[0]!;
const row = (changes: Partial<TractorListing> = {}): TractorListing => ({...base,...changes});
const source = (listings: TractorListing[]): TractorSourceAdapter => ({name:'test',category:'tractors',
  searchLocal:async()=>({mode:'DEMO',listings,warnings:[]}),searchComparables:async()=>market});

test('tractor DEMO fixture has 44 local and 72 national synthetic listings, with only local listing-owned images', () => {
  assert.equal(local.length,44); assert.equal(market.length,72);
  for(const listing of [...local,...market]) { validateTractorListing(listing); assert.equal(new URL(listing.url).hostname,'example.invalid'); assert.ok(listing.imageUrls.every(url=>url.startsWith('/demo-images/tractors/'+listing.id+'/'))); }
});
test('TractorListing validation preserves nullable data and rejects malformed specifications', () => {
  validateTractorListing(row({year:null,operatingHours:null,horsepower:null,drivetrain:'UNKNOWN'}));
  for(const change of [{year:1800},{year:2000.5},{operatingHours:-1},{horsepower:NaN},{latitude:100},{priceEur:0},
    {url:'javascript:alert(1)'},{drivetrain:'AWD'},{frontLoader:'yes'},{documents:3}]) assert.throws(()=>validateTractorListing({...base,...change}));
});
test('UTB and Universal aliases normalize to UTB 650', () => {
  for(const title of ['Universal 650','UTB U650','Tractor U650']) {
    const identity=tractorIdentity(row({title,make:null,model:null}));
    assert.equal(identity.make,'UTB');assert.equal(identity.model,'650');assert.ok(identity.identityConfidence>=70);
  }
});
test('unknown and contradictory tractor identities do not get strong comparable matches', () => {
  const unknown={...row({title:'Tractor agricol',make:null,model:null}),...tractorIdentity(row({title:'Tractor agricol',make:null,model:null}))};
  assert.equal(unknown.model,null); assert.equal(tractorSimilarity(unknown,base),0);
  assert.ok(tractorIdentity(row({title:'John Deere Zetor',make:null,model:null})).identityConfidence<70);
});
for(const [description,category] of [['motor defect','mechanical'],['hidraulica defecta','hydraulic'],['cutie defecta','transmission'],['fara acte','legal']] as const) {
  test(`tractor risk: ${description}`,()=>{const risk=tractorRisk(row({description}));assert.ok(risk[category]>=70);assert.ok(risk.warnings.length>0);});
}
test('cosmetic wear and unregistered status remain distinct from severe legal/mechanical risks',()=>{
  const risk=tractorRisk(row({description:'Zgarieturi, anvelope uzate. Neinmatriculat.',registrationStatus:null}));
  assert.equal(risk.cosmetic,25);assert.equal(risk.legal,15);assert.equal(risk.mechanical,0);
});
test('negated tractor defects are not warnings',()=>{
  const risk=tractorRisk(row({description:'Nu consuma ulei. Fara rugina. Nu are motor defect.'}));
  assert.equal(risk.mechanical,0);assert.equal(risk.cosmetic,0);
});
test('year and operating-hours contradictions cap scores and require verification',()=>{
  for(const description of ['An 2004','95000 ore']) {
    const result=analyzeTractor(row({description}),market,0);
    assert.equal(result.risks.seriousConflict,true); assert.equal(result.classification,'NEEDS_VERIFICATION');
    assert.ok(result.scores.deal<=20);assert.ok(result.scores.tractorQuality<=30);assert.ok(result.scores.opportunity<=20);
  }
});
test('robust median handles even, odd, empty and non-finite input',()=>{
  assert.equal(tractorMedian([4,1,2]),2);assert.equal(tractorMedian([4,1,3,2]),2.5);
  assert.equal(tractorMedian([NaN,Infinity]),null);assert.equal(tractorMedian([]),null);
});
test('tractor similarity uses identity, horsepower, drivetrain, hours and equipment',()=>{
  assert.equal(tractorSimilarity(base,base),100);
  assert.ok(tractorSimilarity(base,row({horsepower:200}))<100);
  assert.ok(tractorSimilarity(base,row({drivetrain:base.drivetrain==='4X4'?'4X2':'4X4'}))<100);
  assert.equal(tractorSimilarity(base,row({model:'other'})),0);
});
test('market estimator needs three distinct comparables, rejects outliers and incompatible drivetrains',()=>{
  const candidates=[6000,6500,7000,100000].map((priceEur,i)=>row({id:`comp-${i}`,url:`https://example.invalid/comp-${i}`,priceEur}));
  assert.equal(estimateTractor(base,candidates.slice(0,2)).estimatedMarketEur,null);
  const estimate=estimateTractor(base,candidates);
  assert.equal(estimate.estimatedMarketEur,6500);assert.equal(estimate.comparableCount,3);assert.ok(estimate.confidence>0);
  assert.equal(estimateTractor(base,[...candidates.slice(0,2),candidates[0]!]).estimatedMarketEur,null);
  assert.equal(estimateTractor(base,candidates.map(c=>({...c,drivetrain:base.drivetrain==='4X4'?'4X2':'4X4'}))).estimatedMarketEur,null);
});
test('Deal and Flip prefer safe discounts; Tractor Quality is independent of price or arbitrary 4x4 bonus',()=>{
  const cheap=analyzeTractor(base,market,0), expensive=analyzeTractor(row({priceEur:20000}),market,0);
  assert.ok(cheap.scores.deal>expensive.scores.deal);assert.ok(cheap.scores.flipPotential>expensive.scores.flipPotential);
  assert.equal(cheap.scores.tractorQuality,expensive.scores.tractorQuality);
  assert.equal(cheap.scores.tractorQuality,analyzeTractor(row({drivetrain:'4X4'}),market,0).scores.tractorQuality);
  assert.equal(cheap.classification,'GREAT_DEAL');assert.equal(expensive.classification,'POOR_VALUE');
  const broken=analyzeTractor(row({description:'Motor defect',priceEur:1000}),market,0);
  assert.equal(broken.classification,'NEEDS_VERIFICATION');assert.ok(broken.scores.flipPotential<=10);assert.ok(broken.scores.opportunity<=20);
});
test('tractor search returns 30 ranked results by default without rawData',async()=>{
  const result=await searchTractors(defaults,adapter);
  assert.equal(result.meta.mode,'DEMO');assert.equal(result.results.length,30);
  assert.ok(result.results.every((r,i)=>i===0||result.results[i-1]!.scores.opportunity>=r.scores.opportunity));
  assert.doesNotMatch(JSON.stringify(result),/rawData/);
});
test('tractor radius filter excludes distant listings; unknown coordinates get a warning and lower confidence',async()=>{
  const distant=row({id:'far',url:'https://example.invalid/far',latitude:44.4,longitude:26.1});
  const unknown=row({id:'unknown',url:'https://example.invalid/unknown',latitude:null,longitude:null});
  const result=await searchTractors(defaults,source([base,distant,unknown]));
  assert.equal(result.results.length,2);const missing=result.results.find(r=>r.listing.id==='unknown')!;
  assert.equal(missing.distanceKm,null);assert.ok(missing.warnings.some(w=>w.includes('raza')));
  assert.ok(missing.price.confidence<result.results.find(r=>r.listing.id===base.id)!.price.confidence);
});
test('tractor settings filters budget, year, CP, hours and 4x4 with unknown values excluded',async()=>{
  const settings={...defaults,minPriceEur:9000,maxPriceEur:19000,minYear:1990,minHorsepower:70,maxOperatingHours:10000,require4x4:true};
  const result=await searchTractors(settings,adapter);assert.ok(result.results.length>0);
  for(const {listing:c} of result.results){assert.ok(c.priceEur>=9000&&c.priceEur<=19000);assert.ok(c.year!>=1990);assert.ok(c.horsepower!>=70);assert.ok(c.operatingHours!<=10000);assert.equal(c.drivetrain,'4X4');}
  assert.equal((await searchTractors({...defaults,minYear:1900},source([row({year:null})]))).results.length,0);
  assert.equal((await searchTractors({...defaults,minHorsepower:1},source([row({horsepower:null})]))).results.length,0);
  assert.equal((await searchTractors({...defaults,maxOperatingHours:10000},source([row({operatingHours:null})]))).results.length,0);
});
test('excludeBroken removes engine, hydraulic and transmission defects; legal warnings stay visible',async()=>{
  const listings=['motor defect','hidraulica defecta','cutie defecta','fara acte'].map((description,i)=>row({id:`risk-${i}`,url:`https://example.invalid/risk-${i}`,description}));
  assert.equal((await searchTractors(defaults,source(listings))).results.length,1);
  assert.equal((await searchTractors({...defaults,excludeBroken:false},source(listings))).results.length,4);
});
test('tractor settings enforce 10/20/30 and require explicit coordinates for unknown locations',async()=>{
  for(const limit of [10,20,30]) assert.equal((await searchTractors({...defaults,limit},adapter)).results.length,limit);
  for(const change of [{limit:15},{radiusKm:0},{maxPriceEur:1000},{minHorsepower:-1},{maxOperatingHours:-1},{minYear:1800},{location:'Unknown'},{origin:{latitude:91,longitude:0}}]) assert.throws(()=>validateTractorSettings({...defaults,...change}));
  validateTractorSettings({...defaults,location:'Unknown',origin:{latitude:45,longitude:23}});
});
test('tractor API jobs: 202, RUNNING, conflict, COMPLETED, current, category isolation',async t=>{
  let release!:()=>void;const gate=new Promise<void>(resolve=>{release=resolve;});
  const app=await buildServer({mode:'DEMO',tractorSearch:async settings=>{await gate;return searchTractors(settings,adapter);}});
  t.after(async()=>{release();await app.close();});
  assert.equal((await app.inject('/api/tractors/search/current')).json(),null);
  const post=await app.inject({method:'POST',url:'/api/tractors/search',payload:defaults});assert.equal(post.statusCode,202);
  const {searchId}=post.json();assert.equal(post.json().status,'RUNNING');
  assert.equal((await app.inject(`/api/tractors/search/${searchId}`)).json().status,'RUNNING');
  const conflict=await app.inject({method:'POST',url:'/api/tractors/search',payload:defaults});assert.equal(conflict.statusCode,409);assert.equal(conflict.json().searchId,searchId);
  assert.equal((await app.inject('/api/cars/search/current')).json(),null);
  release();
  for(let i=0;i<200;i++){const job=(await app.inject(`/api/tractors/search/${searchId}`)).json();if(job.status!=='RUNNING'){assert.equal(job.status,'COMPLETED');assert.equal(job.response.results.length,30);break;}if(i===199)assert.fail('job timeout');await new Promise(r=>setTimeout(r,5));}
  assert.equal((await app.inject('/api/tractors/search/current')).json().status,'COMPLETED');
  assert.equal((await app.inject('/api/tractors/search/missing')).statusCode,404);
});
test('tractor API rejects invalid settings and LIVE requests without invoking engine',async t=>{
  let calls=0;const engine=async()=>{calls++;throw Error('must not search');};
  const demo=await buildServer({mode:'DEMO',tractorSearch:engine}),live=await buildServer({mode:'LIVE',tractorSearch:engine});
  t.after(async()=>{await demo.close();await live.close();});
  for(const change of [{limit:12},{location:'Unknown'},{require4x4:'yes'},{extra:1},{minYear:3000},{maxPriceEur:100}])assert.equal((await demo.inject({method:'POST',url:'/api/tractors/search',payload:{...defaults,...change}})).statusCode,400);
  const response=await live.inject({method:'POST',url:'/api/tractors/search',payload:defaults});assert.equal(response.statusCode,501);assert.equal(response.json().error.code,'CATEGORY_NOT_AVAILABLE_IN_LIVE_MODE');assert.equal(calls,0);
});
test('tractor API failed job returns safe error and permits another job',async t=>{
  const app=await buildServer({mode:'DEMO',tractorSearch:async()=>{throw Error('PRIVATE');}});t.after(()=>app.close());
  const accepted=await app.inject({method:'POST',url:'/api/tractors/search',payload:defaults});
  await new Promise(r=>setImmediate(r));const job=await app.inject(`/api/tractors/search/${accepted.json().searchId}`);
  assert.equal(job.json().status,'FAILED');assert.doesNotMatch(job.body,/PRIVATE/);
  assert.equal((await app.inject({method:'POST',url:'/api/tractors/search',payload:defaults})).statusCode,202);
});
test('AUTOHUNTER_MODE=demo uses actual fixture engines for both job categories with ZERO external fetch',async t=>{
  const old=process.env.AUTOHUNTER_MODE;process.env.AUTOHUNTER_MODE='demo';
  let networkCalls=0;t.mock.method(globalThis,'fetch',async()=>{networkCalls++;throw Error('External network forbidden');});
  const app=await buildServer();t.after(async()=>{await app.close();if(old===undefined)delete process.env.AUTOHUNTER_MODE;else process.env.AUTOHUNTER_MODE=old;});
  assert.equal(runtimeMode(),'DEMO');const health=(await app.inject('/health')).json();assert.equal(health.mode,'DEMO');assert.deepEqual(health.categories.tractors,{demo:true,live:false});
  for(const category of ['cars','tractors']){
    const payload=category==='tractors'?defaults:{location:'Deva',radiusKm:150,minPriceEur:2000,maxPriceEur:10000,minYear:2008,maxMileageKm:250000,excludeDamaged:true,limit:30};
    const accepted=await app.inject({method:'POST',url:`/api/${category}/search`,payload});assert.equal(accepted.statusCode,202);
    for(let i=0;i<400;i++){const job=(await app.inject(`/api/${category}/search/${accepted.json().searchId}`)).json();if(job.status!=='RUNNING'){assert.equal(job.status,'COMPLETED');assert.equal(job.response.meta.mode,'DEMO');assert.ok(job.response.results.length>0);break;}if(i===399)assert.fail('demo timeout');await new Promise(r=>setTimeout(r,5));}
  }
  assert.equal(networkCalls,0);
});

test('tractors image metadata does not change analysis or scores',()=>{
  const before=analyzeTractor(base,market,0);
  const after=analyzeTractor({...base,imageUrl:'/demo-images/tractors/'+base.id+'/01.jpg',imageUrls:['/demo-images/tractors/'+base.id+'/02.jpg'],thumbnailUrl:'/demo-images/tractors/'+base.id+'/thumbnail.jpg'},market,0);
  const {listing:_before,...a}=before;const {listing:_after,...b}=after;assert.deepEqual(a,b);
});
