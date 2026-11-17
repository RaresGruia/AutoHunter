import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SourceRegistry } from '../src/discovery/registry.js';
import { normalizeListing, deduplicate } from '../src/discovery/normalize.js';
import { DiscoveryService } from '../src/discovery/service.js';
import { createDiscoveryService } from '../src/discovery/config.js';
import type { ListingInput, SourceDescriptor } from '../src/discovery/SourceAdapter.js';
import { buildServer } from '../src/api/server.js';

const date='2026-10-25T10:00:00Z';
const descriptor=(id='manual-one'):SourceDescriptor=>({id,name:id,kind:'MANUAL_IMPORT',status:'AVAILABLE',categories:['cars','tractors','tools','equipment'],transport:'LOCAL',configured:true,
  permission:{dataUse:true,imageDisplay:true,reference:'Simulated written permission'},note:'TEST ONLY'});
const row=(changes:Partial<ListingInput>={}):ListingInput=>({id:'one',category:'cars',title:'Test car',originalUrl:'https://dealer.example/item/one',make:' DACIA ',model:' Duster ',
  price:{amount:5000,currency:'EUR'},location:{country:'RO',text:'Deva',latitude:null,longitude:null},imageUrls:['https://dealer.example/photo.jpg'],
  imageRights:{status:'UNKNOWN',evidence:null},...changes});
test('Common model normalizes units and identity without invented location, image rights or LIVE mode',()=>{
  const result=normalizeListing(row(),descriptor(),date);
  assert.equal(result.make,'dacia');assert.equal(result.model,'duster');assert.equal(result.priceEur,5000);
  assert.equal(result.location.latitude,null);assert.equal(result.metadata.mode,'IMPORTED');assert.deepEqual(result.imageUrls,[]);
  assert.throws(()=>normalizeListing(row({price:{amount:25000,currency:'RON'}}),descriptor(),date),/EXPLICIT_EXCHANGE_RATE/);
  const ron=normalizeListing(row({price:{amount:25000,currency:'RON'}}),descriptor(),date,0.2);
  assert.equal(ron.priceEur,5000);assert.equal(ron.metadata.eurPerRon,0.2);
});
test('Image display requires both source permission and documented per-listing rights',()=>{
  const owned=row({imageRights:{status:'OWNED',evidence:'Photographed by supplier'}});
  assert.equal(normalizeListing(owned,descriptor(),date).imageUrls.length,1);
  const blocked=descriptor();blocked.permission.imageDisplay=false;
  assert.deepEqual(normalizeListing(owned,blocked,date).imageUrls,[]);
  assert.deepEqual(normalizeListing(row({imageRights:{status:'LICENSED',evidence:''}}),descriptor(),date).imageUrls,[]);
});
test('Exact cross-source duplicates retain original URLs, provenance and conflicting prices',()=>{
  const a=normalizeListing(row({originalUrl:'https://dealer.example/item/one?utm_source=a'}),descriptor(),date);
  const b=normalizeListing(row({id:'two',originalUrl:'https://dealer.example/item/one?utm_source=b',price:{amount:5500,currency:'EUR'}}),descriptor('manual-two'),date);
  const result=deduplicate([a,b]);assert.equal(result.length,1);assert.equal(result[0]!.origins.length,2);assert.equal(result[0]!.priceConflict,true);
  assert.equal(result[0]!.listing.originalUrl,'https://dealer.example/item/one?utm_source=a');
});
test('Similar products are not collapsed without an exact URL or authoritative identifier',()=>{
  const a=normalizeListing(row(),descriptor(),date);
  const b=normalizeListing(row({id:'two',originalUrl:'https://other.example/item/two'}),descriptor('manual-two'),date);
  assert.equal(deduplicate([a,b]).length,2);
  const identity={namespace:'dealer-stock',value:'stock-123'};
  a.metadata.identity=identity;b.metadata.identity=identity;
  assert.equal(deduplicate([a,b]).length,1);
  b.metadata.mode='DEMO';assert.equal(deduplicate([a,b]).length,2);
});
test('Unapproved or unconfigured external source never calls its transport',async()=>{
  for(const status of ['APPROVAL_REQUIRED','UNAVAILABLE','AVAILABLE'] as const){
    let calls=0;const registry=new SourceRegistry(),source={...descriptor(),kind:'AUTHORIZED_API' as const,status,transport:'NETWORK' as const};
    registry.register(source,{descriptor:source,load:async()=>{calls++;return {listings:[row()],comparables:[],fetchedAt:date};}});
    const result=await new DiscoveryService(registry).search('cars','LIVE');assert.equal(calls,0);assert.equal(result.results.length,0);
  }
});
test('Even an enabled simulated transport needs explicit data permission',async()=>{
  let calls=0;const registry=new SourceRegistry(),source={...descriptor(),kind:'AUTHORIZED_API' as const,transport:'NETWORK' as const,permission:{dataUse:false,imageDisplay:false,reference:null}};
  registry.register(source,{descriptor:source,load:async()=>{calls++;return {listings:[],comparables:[],fetchedAt:date};}});
  await new DiscoveryService(registry,{allowExternal:true}).search('cars','LIVE');assert.equal(calls,0);
});
test('Partial sources report failures and normalize comparables without counting duplicates twice',async()=>{
  const registry=new SourceRegistry(),a=descriptor(),b=descriptor('manual-two'),bad=descriptor('manual-broken');
  registry.register(a,{descriptor:a,load:async()=>({listings:[row()],comparables:[row(),row({id:'bad',price:{amount:NaN,currency:'EUR'}}),null as unknown as ListingInput],fetchedAt:date})});
  registry.register(b,{descriptor:b,load:async()=>({listings:[row({id:'different-source-id'})],comparables:[],fetchedAt:date})});
  registry.register(bad,{descriptor:bad,load:async()=>{throw Error('Do not expose provider internals');}});
  const result=await new DiscoveryService(registry).search('cars','IMPORTED');
  assert.equal(result.results.length,1);assert.equal(result.comparables.length,1);assert.equal(result.meta.duplicatesRemoved,1);
  assert.equal(result.meta.sources[0]!.rejected,2);assert.equal(result.meta.sources[2]!.status,'SOURCE_FAILED');
  assert.doesNotMatch(JSON.stringify(result),/provider internals/);
});
test('DEMO registry uses real local adapters for all existing categories, without activating external providers',async()=>{
  const service=await createDiscoveryService();
  for(const [category,count]of [['cars',34],['tractors',44],['tools',84]] as const){
    const result=await service.search(category);assert.equal(result.results.length,count);assert.equal(result.meta.mode,'DEMO');
    assert.ok(result.results.every(row=>row.listing.metadata.mode==='DEMO'));
  }
  assert.equal((await service.search('cars','LIVE')).results.length,0);
  assert.equal(service.registry.list().find(source=>source.id==='olx-api')!.status,'APPROVAL_REQUIRED');
});
test('Explicit local manual/feed configuration works end to end through discovery API',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'autohunter-sources-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  await writeFile(join(dir,'manual.json'),JSON.stringify({listings:[row()],comparables:[row()]}));
  const config={sources:[{id:'manual-one',name:'Manual sample',kind:'MANUAL_IMPORT',categories:['cars'],file:'manual.json',enabled:true,
    permission:{dataUse:true,imageDisplay:false,reference:'Local simulated agreement'}},
    {id:'feed-one',name:'Delivered feed',kind:'AUTHORIZED_FEED',categories:['cars'],file:'manual.json',enabled:true,
      permission:{dataUse:true,imageDisplay:false,reference:'Local simulated feed agreement'}}]};
  const file=join(dir,'sources.json');await writeFile(file,JSON.stringify(config));
  const app=await buildServer({mode:'DEMO',sourcesConfigFile:file});t.after(()=>app.close());
  const response=await app.inject({method:'POST',url:'/api/discovery/search',payload:{category:'cars',mode:'IMPORTED'}});
  assert.equal(response.statusCode,200);const result=response.json();assert.equal(result.results.length,1);assert.equal(result.results[0].origins.length,2);
  assert.equal(result.results[0].listing.metadata.mode,'IMPORTED');assert.equal(result.meta.analysis,'DISCOVERY_ONLY');
  assert.equal((await app.inject('/api/sources')).json().externalConnectionsEnabled,false);
  assert.equal((await app.inject({method:'POST',url:'/api/discovery/search',payload:{category:'cars',file:'secret.json'}})).statusCode,400);
});
test('Disabled import is not read, and network paths are rejected as local configuration',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'autohunter-source-block-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=join(dir,'config.json');const source={id:'manual-one',name:'Blocked',kind:'MANUAL_IMPORT',categories:['cars'],file:'does-not-exist.json',enabled:false};
  await writeFile(file,JSON.stringify({sources:[source]}));
  const service=await createDiscoveryService(file);assert.equal((await service.search('cars','IMPORTED')).meta.sources[0]!.status,'APPROVAL_REQUIRED');
  await writeFile(file,JSON.stringify({sources:[{...source,file:'https://example.org/feed.json'}]}));
  await assert.rejects(createDiscoveryService(file),/INVALID_LOCAL_SOURCE/);
});
