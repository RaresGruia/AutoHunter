import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {analyzeTool} from '../../src/tools/analysis';
import {validateToolListing} from '../../src/tools/validation';
import {mapToolResponse} from '../src/tools/api';
import {DEFAULT_TOOL_SETTINGS as defaults,TOOL_SETTINGS_KEY,TOOL_SEARCH_KEY,saveToolSettings,loadToolSettings,toolJobStorage} from '../src/tools/settings';
import {toolFacts,toolPackageLabel,toolCategoryLabels,toolScoreLabels,isDemoTool} from '../src/tools/display';
import {createCategoryApiClient,mapCategoryJobResponse,ApiClientError,apiErrorMessage} from '../src/apiClient';
import {CURRENT_SEARCH_KEY,saveCurrentSearchId,loadCurrentSearchId,clearCurrentSearchId,type JobStorage} from '../src/searchStorage';
import {TRACTOR_SEARCH_KEY} from '../src/tractors/settings';
import {SearchSession,type JobApi} from '../src/searchSession';
import type {ToolSearchResponse,ToolSearchSettings} from '../src/tools/types';
import type {CategoryJobResponse} from '../src/types';
const fixture=JSON.parse(readFileSync(new URL('../../fixtures/tools.json',import.meta.url),'utf8'));
validateToolListing(fixture.local[0]);
const response:ToolSearchResponse={meta:{mode:'DEMO',category:'tools',location:'Deva',radiusKm:100,localFetched:84,eligible:1,returnedResults:1,limit:30,warnings:[]},results:[analyzeTool(fixture.local[0],fixture.market,0)]};
const ticket={searchId:'tool-job',status:'RUNNING' as const,startedAt:'2026-09-15T12:00:00.000Z'};
const completed={...ticket,status:'COMPLETED' as const,completedAt:'2026-09-15T12:01:00.000Z',response};
function storage(){const values=new Map<string,string>();const adapter:JobStorage={getItem:async k=>values.get(k)??null,setItem:async(k,v)=>{values.set(k,v);},removeItem:async k=>{values.delete(k);}};return {values,adapter};}
test('Tools default settings keep the search simple',()=>{
  assert.deepEqual(defaults,{location:'Deva',radiusKm:100,minPriceEur:20,maxPriceEur:3000,condition:'ALL',categories:'ALL',excludeBroken:true,limit:30});
});
test('Tools settings persistence survives reload and keeps Cars/Tractors values intact',async()=>{
  const {adapter,values}=storage();values.set('autohunter:settings:v1','cars');values.set('autohunter:tractor-settings:v1','tractors');
  const settings={...defaults,location:'Custom',origin:{latitude:45,longitude:23},categories:['DRILL'] as const};
  await saveToolSettings(adapter,{...settings,categories:[...settings.categories]});
  assert.deepEqual((await loadToolSettings(adapter)).settings,settings);assert.equal(values.get('autohunter:settings:v1'),'cars');assert.equal(values.get('autohunter:tractor-settings:v1'),'tractors');
});
test('Tools corrupt or invalid settings recover without silently saving a bad edit',async()=>{
  const {adapter,values}=storage();
  for(const raw of ['invalid','{}','null',JSON.stringify({...defaults,categories:['BAD']}),JSON.stringify({...defaults,origin:{latitude:91,longitude:0}})]){values.set(TOOL_SETTINGS_KEY,raw);assert.equal((await loadToolSettings(adapter)).recovered,true);}
  await saveToolSettings(adapter,defaults);
  for(const change of [{limit:1},{radiusKm:501},{minPriceEur:-1},{maxPriceEur:1},{location:'Unknown'}])await assert.rejects(saveToolSettings(adapter,{...defaults,...change}));
  assert.deepEqual((await loadToolSettings(adapter)).settings,defaults);
});
test('Tool response mapping includes specifications, kit, risks and scores, without rawData',()=>{
  assert.deepEqual(mapToolResponse(response),response);
  const input={...response,results:[{...response.results[0],listing:{...response.results[0]!.listing,rawData:'PRIVATE'}}]};
  const mapped=mapToolResponse(input);
  assert.equal(Object.hasOwn(mapped.results[0]!.listing,'rawData'),false);
  assert.deepEqual(mapped,response);
});
test('Tool mapping preserves unknown values and rejects wrong enums and categories',()=>{
  const input=structuredClone(response);input.results[0]!.listing.model=null;input.results[0]!.listing.voltageV=null;input.results[0]!.listing.chargerIncluded=null;
  assert.equal(mapToolResponse(input).results[0]!.listing.voltageV,null);
  for(const value of [null,{}, {...response,meta:{...response.meta,category:'cars'}}, {...response,results:[{...response.results[0],classification:'CERTIFIED'}]},
    {...response,results:[{...response.results[0],package:{...response.results[0]!.package,type:'CAR'}}]}])assert.throws(()=>mapToolResponse(value),ApiClientError);
});
test('Tool facts show available fields, Romanian categories and preserve zero batteries/false charger',()=>{
  const row=structuredClone(response.results[0]!);row.listing.engineCc=null;row.listing.batteryAh=null;row.listing.chargerIncluded=false;row.listing.batteriesIncluded=0;
  const facts=toolFacts(row);assert.ok(!facts.some(([label])=>label==='Cilindree'||label==='Capacitate'));
  assert.ok(facts.some(([label,value])=>label==='Acumulatori'&&value==='0'));assert.ok(facts.some(([label,value])=>label==='Încărcător'&&value==='Neinclus'));
  assert.equal(toolCategoryLabels.ANGLE_GRINDER,'Polizor unghiular');assert.match(toolPackageLabel(row),/fără acumulator/);
});
test('Tool kit description and Deal/Quality/Flip labels stay separate',()=>{
  const row=structuredClone(response.results[0]!);row.package={...row.package,type:'KIT',batteries:2,batteryAh:5,charger:true};
  assert.match(toolPackageLabel(row),/2 acumulatori.*5 Ah.*încărcător/);
  const labels=toolScoreLabels(row);assert.equal(labels.length,3);assert.match(labels[0]!,/Deal/);assert.match(labels[1]!,/Quality/);assert.match(labels[2]!,/Flip/);
});
test('DEMO result mode and synthetic flags suppress external actions',()=>{
  const row=response.results[0]!;assert.equal(mapToolResponse(response).meta.mode,'DEMO');assert.equal(isDemoTool(row,'DEMO'),true);assert.equal(isDemoTool(row,null),true);
  const live={...row,listing:{...row.listing,synthetic:false,url:'https://example.com/tool'}};assert.equal(isDemoTool(live,'LIVE'),false);
});
test('Tools job persistence and cleanup do not overwrite Cars or Tractors IDs',async()=>{
  const {adapter,values}=storage(),tools=toolJobStorage(adapter);await saveCurrentSearchId(adapter,'cars-job');values.set(TRACTOR_SEARCH_KEY,'tractor-job');
  await saveCurrentSearchId(tools,ticket.searchId);assert.equal(await loadCurrentSearchId(tools),ticket.searchId);assert.equal(values.get(TOOL_SEARCH_KEY),ticket.searchId);
  await clearCurrentSearchId(tools);assert.equal(values.get(CURRENT_SEARCH_KEY),'cars-job');assert.equal(values.get(TRACTOR_SEARCH_KEY),'tractor-job');
});
test('Tools RUNNING/COMPLETED mapping uses the shared job protocol',()=>{
  assert.deepEqual(mapCategoryJobResponse(ticket,mapToolResponse),ticket);assert.deepEqual(mapCategoryJobResponse(completed,mapToolResponse),completed);
});
test('Tools session survives background/remount and recovers completed job without a duplicate POST',async()=>{
  const {adapter}=storage();let posts=0,current:CategoryJobResponse<ToolSearchResponse>|null=null;
  const api:JobApi<ToolSearchSettings,ToolSearchResponse>={current:async()=>current,search:async()=>{posts++;current=ticket;return ticket;},getJob:async id=>{assert.equal(id,ticket.searchId);return current!;}};
  const options={now:()=>10000,schedule:()=>()=>{}};
  const session=new SearchSession(api,toolJobStorage(adapter),()=>{},options);await session.resume();await session.start(defaults);assert.equal(session.state.phase,'RUNNING');session.pause();session.dispose();
  current=completed;const recovered=new SearchSession(api,toolJobStorage(adapter),()=>{},options);
  try{await recovered.resume();assert.equal(recovered.state.phase,'COMPLETED');assert.deepEqual(recovered.state.response,response);assert.equal(posts,1);assert.equal(await loadCurrentSearchId(toolJobStorage(adapter)),null);}finally{recovered.dispose();}
});
test('Tools LIVE unavailable is a terminal error with a category-neutral explanation',async()=>{
  const error=new ApiClientError('CATEGORY_NOT_AVAILABLE_IN_LIVE_MODE'),message=apiErrorMessage(error);
  assert.match(message.title,/\bDEMO\b/);assert.match(message.detail,/\bAUTOHUNTER_MODE=demo\b/);assert.doesNotMatch(message.title,/Tractoare/);
  const {adapter}=storage();const api:JobApi<ToolSearchSettings,ToolSearchResponse>={current:async()=>{throw error;},search:async()=>ticket,getJob:async()=>ticket};
  const session=new SearchSession(api,toolJobStorage(adapter),()=>{});try{await session.resume();assert.equal(session.state.phase,'ERROR');}finally{session.dispose();}
});
test('Tool HTTP client sends settings to the tools path and decodes health/jobs with a fake transport',async()=>{
  const calls:{url:string;body:unknown}[]=[];
  const fetcher:typeof fetch=async(input,options)=>{const url=String(input);calls.push({url,body:options?.body?JSON.parse(String(options.body)):null});
    return new Response(JSON.stringify(url.endsWith('/health')?{mode:'DEMO'}:url.endsWith('/current')?null:options?.method==='POST'?ticket:completed));};
  const client=createCategoryApiClient<ToolSearchSettings,ToolSearchResponse>('http://192.168.1.2:3000','/api/tools/search',mapToolResponse,{fetcher});
  assert.equal(await client.getMode(),'DEMO');assert.equal(await client.current(),null);assert.equal((await client.search(defaults)).status,'RUNNING');assert.equal((await client.getJob(ticket.searchId)).status,'COMPLETED');
  assert.deepEqual(calls.find(c=>c.url.endsWith('/api/tools/search'))!.body,defaults);assert.ok(calls.every(c=>!c.url.includes('/cars/')&&!c.url.includes('/tractors/')));
});

test('tools image mapping preserves main, gallery and thumbnail, with legacy compatibility',()=>{
  const input=structuredClone(response);const listing=input.results[0]!.listing;
  listing.imageUrl='/demo-images/tools/'+listing.id+'/01.jpg';
  listing.imageUrls=[listing.imageUrl,'/demo-images/tools/'+listing.id+'/02.jpg'];
  listing.thumbnailUrl='/demo-images/tools/'+listing.id+'/thumbnail.jpg';
  assert.deepEqual(mapToolResponse(input).results[0]!.listing,listing);
  delete listing.imageUrl;delete listing.thumbnailUrl;assert.deepEqual(mapToolResponse(input).results[0]!.listing,listing);
  assert.throws(()=>mapToolResponse({...input,results:[{...input.results[0],listing:{...listing,imageUrl:42}}]}),ApiClientError);
});
