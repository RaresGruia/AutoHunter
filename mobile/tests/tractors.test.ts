import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mapTractorResponse} from '../src/tractors/api';
import {DEFAULT_TRACTOR_SETTINGS as defaults,TRACTOR_SETTINGS_KEY,TRACTOR_SEARCH_KEY,loadTractorSettings,saveTractorSettings,tractorSettingsError,tractorJobStorage} from '../src/tractors/settings';
import {tractorFacts,demoLabel} from '../src/tractors/display';
import {SearchSession,type JobApi} from '../src/searchSession';
import {CURRENT_SEARCH_KEY,saveCurrentSearchId,loadCurrentSearchId,clearCurrentSearchId,type JobStorage} from '../src/searchStorage';
import {createCategoryApiClient,mapCategoryJobResponse,mapMode,ApiClientError,apiErrorMessage} from '../src/apiClient';
import type {TractorSearchSettings,TractorSearchResponse} from '../src/tractors/types';
import type {CategoryJobResponse} from '../src/types';
import {analyzeTractor} from '../../src/tractors/analysis';
import {validateTractorListing} from '../../src/tractors/validation';

// Real backend projection from synthetic files, never a server or external source.
const fixture=JSON.parse(readFileSync(new URL('../../fixtures/tractors.json',import.meta.url),'utf8'));
validateTractorListing(fixture.local[0]);
const response:TractorSearchResponse={meta:{mode:'DEMO',category:'tractors',location:'Deva',radiusKm:150,localFetched:44,eligible:1,returnedResults:1,limit:30,warnings:[]},
  results:[analyzeTractor(fixture.local[0],fixture.market,0)]};
const ticket={searchId:'tractor-job',status:'RUNNING' as const,startedAt:'2026-09-15T12:00:00.000Z'};
const completed={...ticket,status:'COMPLETED' as const,completedAt:'2026-09-15T12:01:00.000Z',response};
function storage(){const values=new Map<string,string>();const adapter:JobStorage={getItem:async k=>values.get(k)??null,setItem:async(k,v)=>{values.set(k,v);},removeItem:async k=>{values.delete(k);}};return {values,adapter};}

test('tractor mobile defaults match Deva 150km, 2000-20000 EUR and 30 results',()=>{
  assert.deepEqual(defaults,{location:'Deva',radiusKm:150,minPriceEur:2000,maxPriceEur:20000,minYear:null,minHorsepower:null,maxOperatingHours:null,require4x4:false,excludeBroken:true,limit:30});
  assert.equal(tractorSettingsError(defaults),null);
});
test('tractor settings persist independently and preserve explicit coordinates',async()=>{
  const {adapter,values}=storage();values.set('autohunter:settings:v1','cars-settings');
  const changed={...defaults,location:'Custom',origin:{latitude:45,longitude:23},require4x4:true,minHorsepower:65,limit:20};
  await saveTractorSettings(adapter,changed);assert.deepEqual((await loadTractorSettings(adapter)).settings,changed);
  assert.equal(values.get('autohunter:settings:v1'),'cars-settings');assert.ok(values.has(TRACTOR_SETTINGS_KEY));
});
test('tractor corrupt settings recover; invalid edits cannot replace saved settings',async()=>{
  const {adapter,values}=storage();
  for(const raw of ['bad','null','{}',JSON.stringify({...defaults,require4x4:'yes'})]){values.set(TRACTOR_SETTINGS_KEY,raw);assert.equal((await loadTractorSettings(adapter)).recovered,true);}
  await saveTractorSettings(adapter,defaults);
  for(const change of [{limit:15},{location:'Unknown'},{location:''},{maxPriceEur:1},{minYear:1800},{minHorsepower:-1},{maxOperatingHours:-1},{origin:{latitude:100,longitude:0}}])await assert.rejects(saveTractorSettings(adapter,{...defaults,...change}));
  assert.deepEqual((await loadTractorSettings(adapter)).settings,defaults);
});
test('tractor API mapper matches real backend fields and removes raw payloads',()=>{
  assert.deepEqual(mapTractorResponse(response),response);
  const input=structuredClone(response);const listing=input.results[0]!.listing;
  listing.year=null;listing.horsepower=null;listing.operatingHours=null;listing.drivetrain='UNKNOWN';
  const mapped=mapTractorResponse({...input,rawData:'PRIVATE',results:[{...input.results[0],listing:{...listing,rawData:'PRIVATE'}}]});
  assert.equal(mapped.results[0]!.listing.year,null);assert.doesNotMatch(JSON.stringify(mapped),/PRIVATE|rawData/);
});
test('tractor mapper rejects wrong categories, malformed data and invented classifications',()=>{
  for(const input of [null,{}, {...response,meta:{...response.meta,category:'cars'}}, {...response,results:[{...response.results[0],classification:'GUARANTEED'}]}, {...response,results:[{...response.results[0],listing:{...response.results[0]!.listing,horsepower:'65'}}]}])assert.throws(()=>mapTractorResponse(input),ApiClientError);
});
test('tractor facts omit unavailable values, preserve false loader and show known specifications',()=>{
  const row=structuredClone(response.results[0]!);row.listing.year=null;row.listing.engine=null;row.listing.drivetrain='UNKNOWN';row.listing.frontLoader=false;
  const facts=tractorFacts(row);assert.ok(!facts.some(([k])=>['An','Motor','Tracțiune'].includes(k)));
  assert.ok(facts.some(([k,v])=>k==='Putere'&&v.includes('CP')));assert.ok(facts.some(([k,v])=>k==='Încărcător frontal'&&v==='Nu'));
});
test('DEMO mode maps from health/results and has an explicit synthetic-data label',()=>{
  assert.equal(mapMode('DEMO'),'DEMO');assert.match(demoLabel(mapTractorResponse(response).meta.mode)!,/MOD DEMONSTRAȚIE.*sintetice/);
  assert.equal(demoLabel('LIVE'),null);assert.throws(()=>mapMode('demo'),ApiClientError);
});
test('tractor job IDs are persisted, recovered and cleared without touching cars',async()=>{
  const {adapter,values}=storage(),tractors=tractorJobStorage(adapter);
  await saveCurrentSearchId(adapter,'car-job');await saveCurrentSearchId(tractors,ticket.searchId);
  assert.equal(await loadCurrentSearchId(tractors),ticket.searchId);assert.equal(values.get(CURRENT_SEARCH_KEY),'car-job');
  assert.equal(values.get(TRACTOR_SEARCH_KEY),ticket.searchId);await clearCurrentSearchId(tractors);assert.equal(await loadCurrentSearchId(adapter),'car-job');
});
test('tractor RUNNING/COMPLETED mapping uses shared job contract',()=>{
  assert.deepEqual(mapCategoryJobResponse(ticket,mapTractorResponse),ticket);
  assert.deepEqual(mapCategoryJobResponse(completed,mapTractorResponse),completed);
});
test('tractor session survives background and remount, resumes ID without duplicate POST',async()=>{
  const {adapter,values}=storage();values.set(CURRENT_SEARCH_KEY,'car-job');let posts=0;
  let current:CategoryJobResponse<TractorSearchResponse>|null=null;
  const api:JobApi<TractorSearchSettings,TractorSearchResponse>={current:async()=>current,search:async()=>{posts++;current=ticket;return ticket;},getJob:async id=>{assert.equal(id,ticket.searchId);return current!;}};
  const options={now:()=>10000,schedule:()=>()=>{}};
  const session=new SearchSession(api,tractorJobStorage(adapter),()=>{},options);
  await session.resume();await session.start(defaults);assert.equal(session.state.phase,'RUNNING');assert.equal(values.get(TRACTOR_SEARCH_KEY),ticket.searchId);
  session.pause();session.dispose();current=completed;
  const recovered=new SearchSession(api,tractorJobStorage(adapter),()=>{},options);
  try{await recovered.resume();assert.equal(recovered.state.phase,'COMPLETED');assert.deepEqual(recovered.state.response,response);assert.equal(posts,1);assert.equal(values.get(CURRENT_SEARCH_KEY),'car-job');assert.equal(values.has(TRACTOR_SEARCH_KEY),false);}finally{recovered.dispose();}
});
test('tractor FAILED and LIVE unavailable errors are explicit and do not poll forever',async()=>{
  const {adapter}=storage();const failed={...ticket,status:'FAILED' as const,completedAt:completed.completedAt,error:{code:'SEARCH_FAILED',message:'Failed'}};
  const api:JobApi<TractorSearchSettings,TractorSearchResponse>={current:async()=>failed,search:async()=>ticket,getJob:async()=>failed};
  const session=new SearchSession(api,tractorJobStorage(adapter),()=>{});
  try{await session.resume();assert.equal(session.state.phase,'FAILED');assert.equal(session.state.error?.code,'SEARCH_FAILED');}finally{session.dispose();}
  const live=new SearchSession({...api,current:async()=>{throw new ApiClientError('CATEGORY_NOT_AVAILABLE_IN_LIVE_MODE');}},tractorJobStorage(adapter),()=>{});
  try{await live.resume();assert.equal(live.state.phase,'ERROR');assert.match(apiErrorMessage(live.state.error).detail,/DEMO/i);}finally{live.dispose();}
});
test('tractor HTTP client uses tractor endpoints and health mode with an injected transport',async()=>{
  const calls:string[]=[];
  const fetcher:typeof fetch=async(input,options)=>{const url=String(input);calls.push(`${options?.method} ${url}`);const body=url.endsWith('/health')?{mode:'DEMO'}:url.endsWith('/current')?null:options?.method==='POST'?ticket:completed;return new Response(JSON.stringify(body));};
  const client=createCategoryApiClient<TractorSearchSettings,TractorSearchResponse>('http://192.168.1.2:3000','/api/tractors/search',mapTractorResponse,{fetcher});
  assert.equal(await client.getMode(),'DEMO');assert.equal(await client.current(),null);assert.equal((await client.search(defaults)).status,'RUNNING');assert.equal((await client.getJob(ticket.searchId)).status,'COMPLETED');
  assert.ok(calls.some(c=>c.endsWith('/api/tractors/search/tractor-job')));assert.ok(calls.every(c=>!c.includes('/cars/')));
});

test('tractors image mapping preserves main, gallery and thumbnail, with legacy compatibility',()=>{
  const input=structuredClone(response);const listing=input.results[0]!.listing;
  listing.imageUrl='/demo-images/tractors/'+listing.id+'/01.jpg';
  listing.imageUrls=[listing.imageUrl,'/demo-images/tractors/'+listing.id+'/02.jpg'];
  listing.thumbnailUrl='/demo-images/tractors/'+listing.id+'/thumbnail.jpg';
  assert.deepEqual(mapTractorResponse(input).results[0]!.listing,listing);
  delete listing.imageUrl;delete listing.thumbnailUrl;assert.deepEqual(mapTractorResponse(input).results[0]!.listing,listing);
  assert.throws(()=>mapTractorResponse({...input,results:[{...input.results[0],listing:{...listing,imageUrl:42}}]}),ApiClientError);
});
