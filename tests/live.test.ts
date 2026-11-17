import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {BraveSearchAdapter,publicListingUrl,isListingPage,type BraveConfig} from '../src/live/brave.js';
import {LiveService} from '../src/live/service.js';
import {ManualOfferStore,validateManual} from '../src/live/manual.js';
import {analyzeLiveOffers,manualLiveOffer} from '../src/live/analyze.js';
import {buildServer} from '../src/api/server.js';

const config:BraveConfig={enabled:true,key:'TEST-ONLY-NOT-A-CREDENTIAL',count:20};
const now=Date.parse('2026-10-26T12:00:00Z');
const fakeRows={web:{results:[{title:'Dacia <b>Duster</b>',url:'https://www.olx.ro/d/oferta/test-ID1.html',description:'Index snippet only; 9500 EUR, not verified',thumbnail:{src:'https://third-party.invalid/photo.jpg'}},
  {title:'Category',url:'https://www.olx.ro/auto-masini-moto-ambarcatiuni/'},{title:'Article',url:'https://unknown.example.org/news.html'}]}};
const manual=(i=0,extra:Record<string,unknown>={})=>({category:'cars',country:'RO',originalUrl:`https://authorized.example.org/listing/${i}`,title:'Dacia Duster 1.5 dCi',make:'Dacia',model:'Duster',priceEur:9500+i*100,
  dataUseAllowed:true,permissionEvidence:'TEST ONLY; simulated permission; no real imported listing',availability:'USER_CONFIRMED',
  attributes:{year:2021,mileageKm:123000,fuel:'Diesel',engineCapacityCc:1461,engine:'1.5 dCi',transmission:'Manuala',drivetrain:'4x4',location:'Deva',description:'Date de test, nu ofertă reală.'},...extra});

test('Brave uses only its official API; indexed values remain unverified and photos are discarded',async()=>{
  let calls=0;
  const fetcher:typeof fetch=async(input,init)=>{
    calls++;const url=new URL(String(input));assert.equal(url.origin,'https://api.search.brave.com');
    assert.equal(url.searchParams.get('country'),'ALL','Brave does not accept RO; avoid HTTP 422');assert.equal(url.searchParams.get('search_lang'),'ro');assert.ok(url.searchParams.get('q')!.includes('site:olx.ro'));
    assert.equal((init?.headers as Record<string,string>)['X-Subscription-Token'],config.key);
    return new Response(JSON.stringify(fakeRows));
  };
  const adapter=new BraveSearchAdapter(config,fetcher,()=>now),batch=await adapter.load('cars',{query:'Dacia Duster'});
  assert.equal(calls,1);assert.equal(batch.hits!.length,1);assert.equal(batch.hits![0]!.title,'Dacia Duster');
  assert.deepEqual(batch.listings,[]);assert.deepEqual(batch.comparables,[]);
  assert.ok(!JSON.stringify(batch).includes(config.key));assert.ok(!JSON.stringify(batch).includes('third-party'));
});
test('Unconfigured or disabled Brave never makes an external call',async()=>{
  for(const value of [{...config,key:''},{...config,enabled:false}]){
    const adapter=new BraveSearchAdapter(value,async()=>{throw Error('Should not fetch');});
    await assert.rejects(()=>adapter.load('cars',{query:'Duster'}),/BRAVE_NOT_CONFIGURED/);
  }
});
test('Brave respects 429 Retry-After without retries and redacts authentication failures',async()=>{
  let time=now,calls=0;
  const adapter=new BraveSearchAdapter(config,async()=>{calls++;return new Response('',{status:429,headers:{'Retry-After':'120'}});},()=>time);
  await assert.rejects(()=>adapter.load('cars',{query:'Duster'}),/BRAVE_RATE_LIMITED/);
  time+=61000;await assert.rejects(()=>adapter.load('cars',{query:'Duster'}),/BRAVE_RATE_LIMITED/);assert.equal(calls,1);
  const denied=new BraveSearchAdapter(config,async()=>new Response('secret '+config.key,{status:401}));
  await assert.rejects(()=>denied.load('cars',{query:'Duster'}),{message:'BRAVE_AUTH_FAILED'});
});
test('Only original public HTTPS listing pages are accepted; categories and credential URLs are excluded',()=>{
  for(const url of ['http://olx.ro/d/oferta/x.html','https://u:p@olx.ro/x','https://127.0.0.1/x','https://example.invalid/item','file:///secret'])assert.equal(publicListingUrl(url),null);
  assert.equal(isListingPage(new URL('https://www.autovit.ro/autoturisme/anunt/dacia-ID123.html'),'cars'),true);
  assert.equal(isListingPage(new URL('https://www.publi24.ro/anunturi/auto-moto/'),'cars'),false);
});
test('Manual URL/data import requires explicit rights and never accepts DEMO or substituted images',()=>{
  assert.throws(()=>validateManual(manual(0,{dataUseAllowed:false})),/DATA_PERMISSION/);
  assert.throws(()=>validateManual(manual(0,{country:'DE'})),/DATA_PERMISSION/);
  assert.throws(()=>validateManual(manual(0,{originalUrl:'https://example.invalid/demo'})),/DATA_PERMISSION/);
  assert.throws(()=>validateManual(manual(0,{imageUrls:['https://authorized.example.org/p.jpg']})),/IMAGE_PERMISSION/);
  assert.throws(()=>validateManual(manual(0,{imageUrls:['https://authorized.example.org/p.jpg'],imageDisplayAllowed:true,imageRights:{status:'LICENSED',evidence:'TEST'},imagePresentation:'REPRESENTATIVE_MODEL'})),/ACTUAL_ITEM/);
  const row=validateManual(manual(0,{priceEur:null,availability:'UNVERIFIED'}),new Date(now).toISOString());
  assert.equal(row.priceEur,null);assert.equal(row.lastVerifiedAt,null);assert.deepEqual(row.imageUrls,[]);
});
test('Manual persistence is separate from fixtures and preserves provenance and explicit verification',async t=>{
  const root=await mkdtemp(join(tmpdir(),'autohunter-live-test-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const file=join(root,'offers.json'),store=new ManualOfferStore(file),row=validateManual(manual(),new Date(now).toISOString());
  await store.save(row);await store.save({...row,priceEur:8000});
  const rows=await store.list();assert.equal(rows.length,1);assert.equal(rows[0]!.priceEur,8000);
  assert.equal(rows[0]!.permissionEvidence,row.permissionEvidence);assert.ok((await readFile(file,'utf8')).includes(row.originalUrl));
});
test('Expired, unverified and stale records never receive scores',()=>{
  for(const availability of ['UNVERIFIED','EXPIRED','USER_CONFIRMED']){
    const row=validateManual(manual(0,{availability}),new Date(now-49*3600000).toISOString());
    const analyzed=analyzeLiveOffers([manualLiveOffer(row,now)])[0]!;
    assert.equal(analyzed.analysis.status,'INSUFFICIENT_DATA');assert.equal(analyzed.analysis.dealScore,null);
    if(availability==='USER_CONFIRMED')assert.equal(analyzed.availability,'STALE');
  }
});
test('Real-data bridge reuses the car estimator, excludes self/duplicates and requires five comparables',()=>{
  const rows=Array.from({length:6},(_,i)=>manualLiveOffer(validateManual(manual(i),new Date(now).toISOString()),now));
  const insufficient=analyzeLiveOffers(rows.slice(0,3));assert.ok(insufficient.every(row=>row.analysis.dealScore===null));
  const enough=analyzeLiveOffers(rows);
  assert.equal(enough[0]!.analysis.status,'SCORED');assert.equal(enough[0]!.analysis.comparableCount,5);
  assert.ok(enough[0]!.analysis.dealScore!==null);assert.ok(!enough[0]!.analysis.comparableUrls.includes(rows[0]!.originalUrl));
  const duplicates=analyzeLiveOffers([...rows.slice(0,3),...rows.slice(0,3)]);assert.ok(duplicates.every(row=>row.analysis.dealScore===null));
});
for(const category of ['tractors','tools'] as const){
  test(category+': authorized normalized rows reach the existing category analysis, without DEMO comparables',()=>{
    const rows=Array.from({length:8},(_,i)=>{
      const values=category==='tractors'?{title:'UTB 650',make:'UTB',model:'650',priceEur:5000+i*100,
        attributes:{year:1995,horsepower:65,operatingHours:4000,drivetrain:'4X2',description:'TEST ONLY: date simulate pentru verificarea motorului.',location:'Deva'}}:
        {title:'Makita DGA504',make:'Makita',model:'DGA504',priceEur:100+i*5,
          attributes:{subcategory:'ANGLE_GRINDER',condition:'USED',powerSource:'BATTERY',voltageV:18,batteriesIncluded:0,chargerIncluded:false,description:'TEST ONLY: doar corpul, fara baterie.',location:'Deva'}};
      return manualLiveOffer(validateManual(manual(i,{category,...values}),new Date(now).toISOString()),now);
    });
    const analysis=analyzeLiveOffers(rows)[0]!.analysis;
    assert.equal(analysis.status,'SCORED');assert.ok(analysis.comparableCount>=3);assert.ok(analysis.confidence!>=40);
    assert.ok(analyzeLiveOffers(rows.slice(0,2)).every(row=>row.analysis.dealScore===null));
  });
}
test('Live service performs a connected search with no fixture fallback, deduplicates URLs and caches transiently',async t=>{
  const root=await mkdtemp(join(tmpdir(),'autohunter-live-service-'));t.after(()=>rm(root,{recursive:true,force:true}));
  let calls=0;const adapter=new BraveSearchAdapter(config,async()=>{calls++;return new Response(JSON.stringify({web:{results:[...fakeRows.web.results,fakeRows.web.results[0]]}}));},()=>now);
  const service=new LiveService({config:async()=>config,adapter,store:new ManualOfferStore(join(root,'rows.json')),now:()=>now});
  const first=await service.search('cars','Dacia Duster'),second=await service.search('cars','Dacia Duster');
  assert.equal(first.meta.mode,'LIVE');assert.equal(first.results.length,1);assert.equal(first.meta.scored,0);assert.equal(calls,1);assert.equal(second.meta.searchStatus,'CACHED');
  assert.equal(first.results[0]!.priceEur,null);assert.equal(first.results[0]!.lastVerifiedAt,null);assert.deepEqual(first.results[0]!.imageUrls,[]);
  assert.ok(!JSON.stringify(first).includes('TEST-ONLY-NOT-A-CREDENTIAL'));
});
test('LIVE HTTP endpoints validate query, protect paid calls from other origins and keep keys server-side',async t=>{
  const root=await mkdtemp(join(tmpdir(),'autohunter-live-http-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const service=new LiveService({config:async()=>({...config,key:''}),store:new ManualOfferStore(join(root,'rows.json'))});
  const app=await buildServer({mode:'DEMO',liveService:service});t.after(()=>app.close());
  const status=await app.inject('/api/live/status');assert.equal(status.json().configured,false);assert.ok(!status.body.includes(config.key));
  assert.equal((await app.inject({method:'POST',url:'/api/live/search',payload:{category:'cars',query:'Duster',extra:1}})).statusCode,400);
  assert.equal((await app.inject({method:'POST',url:'/api/live/search',payload:{category:'cars',query:'Duster'},headers:{origin:'https://attacker.example.org'}})).statusCode,403);
  const result=await app.inject({method:'POST',url:'/api/live/search',payload:{category:'cars',query:'Duster'}});
  assert.equal(result.json().meta.mode,'LIVE');assert.deepEqual(result.json().results,[]);
  assert.equal((await app.inject({method:'POST',url:'/api/live/import',payload:manual(0,{dataUseAllowed:false})})).statusCode,400);
});
