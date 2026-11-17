import assert from 'node:assert/strict';
import http from 'node:http';
import https from 'node:https';
import {syncBuiltinESMExports} from 'node:module';
import {mkdir,writeFile,readFile} from 'node:fs/promises';

// No injected search engine: exercise the real startup mode and both real jobs.
process.env.AUTOHUNTER_MODE='demo';
let externalCalls=0,localCalls=0;
const originals={fetch:globalThis.fetch,httpRequest:http.request,httpGet:http.get,httpsRequest:https.request,httpsGet:https.get};
function forbid(){externalCalls++;throw new Error('External request forbidden in DEMO validation');}
globalThis.fetch=async()=>forbid();
function guard(fn){return function(input,...args){
  const host=typeof input==='string'||input instanceof URL?new URL(input).hostname:input.hostname??input.host;
  if(!['127.0.0.1','localhost','::1','[::1]'].includes(host))return forbid();
  localCalls++;return fn.call(this,input,...args);
};}
http.request=guard(originals.httpRequest);http.get=guard(originals.httpGet);
https.request=guard(originals.httpsRequest);https.get=guard(originals.httpsGet);syncBuiltinESMExports();
const {buildServer}=await import('../dist/src/api/server.js');
const {defaultTractorSettings}=await import('../dist/src/tractors/settings.js');
const {defaultToolSettings}=await import('../dist/src/tools/settings.js');
const app=await buildServer();
const watchdog=setTimeout(()=>{app.server.closeAllConnections();void app.close();console.error('DEMO smoke exceeded 25s');process.exitCode=124;setTimeout(()=>process.exit(124),1000).unref();},25000);
let report;
async function request(base,path,body){return new Promise((resolve,reject)=>{
  const client=http.request(`${base}${path}`,{method:body?'POST':'GET',agent:false,headers:{'Content-Type':'application/json',Connection:'close'}},response=>{
    let data='';response.on('data',chunk=>{data+=chunk;});response.on('error',reject);
    response.on('end',()=>{try{resolve({status:response.statusCode,json:JSON.parse(data)});}catch(error){reject(error);}});
  });
  client.setTimeout(3000,()=>client.destroy(new Error('Local HTTP timeout')));client.on('error',reject);client.end(body?JSON.stringify(body):undefined);
});}
try{
  const base=await app.listen({host:'127.0.0.1',port:0});
  const health=await request(base,'/health');assert.equal(health.status,200);assert.equal(health.json.mode,'DEMO');
  assert.deepEqual(health.json.categories,{cars:{demo:true,live:true},tractors:{demo:true,live:false},tools:{demo:true,live:false},equipment:{demo:false,live:false}});
  const cars={location:'Deva',radiusKm:150,minPriceEur:2000,maxPriceEur:10000,minYear:2008,maxMileageKm:250000,excludeDamaged:true,limit:30};
  const settings={cars,tractors:defaultTractorSettings,tools:defaultToolSettings};
  const jobs={};
  // Start both categories concurrently, proving their managers do not conflict.
  for(const category of ['cars','tractors','tools']){
    const accepted=await request(base,`/api/${category}/search`,settings[category]);assert.equal(accepted.status,202);assert.equal(accepted.json.status,'RUNNING');jobs[category]=accepted.json;
  }
  const deadline=Date.now()+10000;
  for(const category of ['cars','tractors','tools']){
    let job;
    do{
      assert.ok(Date.now()<deadline,'Job completion exceeded 10s');
      const result=await request(base,`/api/${category}/search/${jobs[category].searchId}`);assert.equal(result.status,200);job=result.json;
      if(job.status==='RUNNING')await new Promise(resolve=>setTimeout(resolve,20));
    }while(job.status==='RUNNING');
    assert.equal(job.status,'COMPLETED');assert.equal(job.response.meta.mode,'DEMO');assert.ok(job.response.results.length>0);
    const current=await request(base,`/api/${category}/search/current`);assert.equal(current.json.searchId,job.searchId);assert.equal(current.json.status,'COMPLETED');
    jobs[category]={status:job.status,searchId:job.searchId,meta:job.response.meta,top5:job.response.results.slice(0,5).map(r=>({title:r.title??r.listing.title,classification:r.classification,scores:r.scores}))};
    if(category==='tractors'||category==='tools'){
      assert.equal(job.response.results.length,30);
      await mkdir('validation',{recursive:true});await writeFile(`validation/demo-${category}-response.json`,JSON.stringify(job.response,null,2));
    }
  }
  assert.equal(externalCalls,0);
  const fixtures=JSON.parse(await readFile('fixtures/tractors.json','utf8'));
  const toolFixtures=JSON.parse(await readFile('fixtures/tools.json','utf8'));
  report={toolFixtures:{local:toolFixtures.local.length,comparables:toolFixtures.market.length},checkedAt:new Date().toISOString(),health:health.json,jobs,tractorFixtures:{local:fixtures.local.length,comparables:fixtures.market.length},externalCalls,localCalls};
}finally{
  app.server.closeAllConnections();await app.close();assert.equal(app.server.listening,false);clearTimeout(watchdog);
  globalThis.fetch=originals.fetch;http.request=originals.httpRequest;http.get=originals.httpGet;https.request=originals.httpsRequest;https.get=originals.httpsGet;syncBuiltinESMExports();
  console.log('Temporary DEMO server closed.');
}
await writeFile('validation/demo-api.json',JSON.stringify({...report,serverClosed:true},null,2));
console.log(JSON.stringify({mode:report.health.mode,cars:report.jobs.cars.status,carsResults:report.jobs.cars.meta.returnedResults,
  tractors:report.jobs.tractors.status,tractorResults:report.jobs.tractors.meta.returnedResults,tools:report.jobs.tools.status,toolResults:report.jobs.tools.meta.returnedResults,externalCalls,serverClosed:true}));
