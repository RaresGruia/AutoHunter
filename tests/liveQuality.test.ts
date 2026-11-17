import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {indexFacts} from '../src/live/indexFacts.js';
import {AvailabilityReports} from '../src/live/availability.js';
import {ManualOfferStore,validateManual} from '../src/live/manual.js';
import {manualLiveOffer,analyzeLiveOffers} from '../src/live/analyze.js';
import {BraveSearchAdapter,isListingPage,type BraveConfig} from '../src/live/brave.js';
import {LiveService} from '../src/live/service.js';
import {buildServer} from '../src/api/server.js';
const hit=(title:string,snippet='',category:'cars'|'tractors'|'tools'='cars')=>({title,snippet,category,publisher:'www.autovit.ro'});
test('Index facts preserve evidence and Romanian number formats without claiming verified data',()=>{
  const facts=indexFacts(hit('Utilizat Dacia Duster 2023 - 8 000 EUR, 50 667 km - Autovit.ro'));
  assert.deepEqual(facts.price,{value:{amount:8000,currency:'EUR'},field:'title',evidence:'8 000 EUR'});
  assert.equal(facts.year?.value,2023);assert.equal(facts.mileageKm?.value,50667);
  assert.equal(indexFacts(hit('Preț 1.299,50 RON','','tools')).price?.value.amount,1299.5);
  assert.equal(indexFacts(hit('Tractor UTB 650','An fabricație: 1998; 4.200 ore de funcționare','tractors')).operatingHours?.value,4200);
  assert.equal(indexFacts(hit('Tractor UTB 650','An fabricație: 1998','tractors')).year?.value,1998);
});
test('Index facts reject ambiguous prices and numeric model names masquerading as years',()=>{
  for(const title of ['1 000 EUR sau 5 000 lei','Rate de la 100 EUR lunar','Preț la cerere','0 EUR'])assert.equal(indexFacts(hit(title)).price,undefined);
  for(const title of ['Utilizat Peugeot 2008 - 9000 EUR','John Deere 2020','UTB 650'])assert.equal(indexFacts(hit(title)).year,undefined);
  assert.equal(indexFacts(hit('Duster 80 000 km și 90 000 km')).mileageKm,undefined);
  assert.equal(indexFacts(hit('Duster an 2099')).year,undefined);
  assert.equal(indexFacts(hit('Utilizat Dacia Duster 2023 - 8000 EUR','Predare leasing, mai sunt 28 rate a câte 1700 lei.')).price,undefined);
});
test('Agricultural category and model directories are not individual listings',()=>{
  assert.equal(isListingPage(new URL('https://www.agriaffaires.ro/second-hand/tractoare-agricole/1/22004/utb/650.html'),'tractors'),false);
  assert.equal(isListingPage(new URL('https://www.agriaffaires.ro/second-hand/tractoare-agricole/12345678/utb-650.html'),'tractors'),true);
  assert.equal(isListingPage(new URL('https://www.mascus.ro/agricultura/tractoare/utb.html'),'tractors'),false);
});
test('Availability reports are user evidence, persist canonical URLs, reject active claims and allow undo',async t=>{
  const root=await mkdtemp(join(tmpdir(),'autohunter-quality-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const reports=new AvailabilityReports(join(root,'reports.json'));
  const url='https://www.autovit.ro/autoturisme/anunt/test-ID1.html?utm_source=test';
  await reports.save({originalUrl:url,status:'UNAVAILABLE',note:'Page says unavailable'},'2026-10-26T10:00:00Z');
  const rows=await reports.list();assert.equal(rows.length,1);assert.equal(rows[0]!.method,'USER_REPORT');assert.equal(new URL(rows[0]!.originalUrl).search,'');
  await assert.rejects(()=>reports.save({originalUrl:url,status:'ACTIVE_VERIFIED'}),/INVALID_AVAILABILITY_REPORT/);
  await assert.rejects(()=>reports.save({originalUrl:'http://localhost/secret',status:'EXPIRED'}),/INVALID_AVAILABILITY_REPORT/);
  await reports.save({originalUrl:url,status:'UNVERIFIED'});assert.equal((await reports.list()).length,1);assert.equal((await reports.list())[0]!.status,'UNVERIFIED');
});
test('Cached LIVE hits honor new expiry reports without fetching publisher pages or paying again',async t=>{
  const root=await mkdtemp(join(tmpdir(),'autohunter-reports-'));t.after(()=>rm(root,{recursive:true,force:true}));
  const config:BraveConfig={enabled:true,key:'TEST ONLY',count:20};let calls=0;
  const url='https://www.autovit.ro/autoturisme/anunt/dacia-test-ID1.html';
  const adapter=new BraveSearchAdapter(config,async(input)=>{calls++;assert.equal(new URL(String(input)).hostname,'api.search.brave.com');return new Response(JSON.stringify({web:{results:[{url,title:'Utilizat Dacia Duster 2023 - 8000 EUR, 50667 km'}]}}));});
  const service=new LiveService({config:async()=>config,adapter,reports:new AvailabilityReports(join(root,'reports.json')),store:new ManualOfferStore(join(root,'offers.json'))});
  const initial=await service.search('cars','Dacia Duster');assert.equal(initial.results.length,1);const row=initial.results[0]!;
  assert.equal(row.priceEur,null);assert.equal(row.normalized,null);assert.equal(row.indexFacts?.price?.value.amount,8000);assert.equal(row.availability,'UNVERIFIED');assert.equal(row.analysis.dealScore,null);
  await service.reportAvailability({originalUrl:url,status:'UNAVAILABLE'});
  const hidden=await service.search('cars','Dacia Duster');assert.equal(hidden.results.length,0);assert.equal(hidden.meta.excludedUnavailable,1);
  const archive=await service.search('cars','Dacia Duster',true);assert.equal(archive.results[0]!.availability,'UNAVAILABLE');assert.equal(archive.results[0]!.analysis.dealScore,null);
  await service.reportAvailability({originalUrl:url,status:'UNVERIFIED'});assert.equal((await service.search('cars','Dacia Duster')).results.length,1);assert.equal(calls,1);
  const app=await buildServer({liveService:service});t.after(()=>app.close());
  assert.equal((await app.inject({method:'POST',url:'/api/live/availability-report',payload:{originalUrl:url,status:'ACTIVE_VERIFIED'}})).statusCode,400);
  assert.equal((await app.inject({method:'POST',url:'/api/live/availability-report',headers:{origin:'https://attacker.example.org'},payload:{originalUrl:url,status:'EXPIRED'}})).statusCode,403);
  assert.equal((await app.inject({method:'POST',url:'/api/live/availability-report',payload:{originalUrl:url,status:'EXPIRED'}})).statusCode,201);
});
test('Exact authorized photographs retain listing identity and original URL independently of score',()=>{
  const row=validateManual({category:'tools',country:'RO',originalUrl:'https://dealer.example.org/tools/item',title:'TEST ONLY',dataUseAllowed:true,permissionEvidence:'Simulated rights for tests only',
    imageUrls:['https://dealer.example.org/1.jpg','https://dealer.example.org/2.jpg'],imageRights:{status:'LICENSED',evidence:'Simulated image agreement'},imagePresentation:'ACTUAL_ITEM',imageDisplayAllowed:true});
  const offer=manualLiveOffer(row);assert.equal(offer.photoProvenance?.length,2);
  for(const photo of offer.photoProvenance!){assert.equal(photo.listingId,offer.id);assert.equal(photo.originalUrl,offer.originalUrl);assert.equal(photo.method,'MANUAL_PERMISSION');}
  assert.equal(analyzeLiveOffers([offer])[0]!.analysis.dealScore,null);
});
