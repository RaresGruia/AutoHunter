import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {scanDemoImages, type ImageCatalogListing} from '../src/services/demoImageCatalog.js';
import {readDemoImageManifest, attachDemoImages} from '../src/services/demoImages.js';
import {imageMetadata} from '../src/models/ListingImages.js';
import {buildServer} from '../src/api/server.js';
import {defaultTractorSettings} from '../src/tractors/settings.js';
import {defaultToolSettings} from '../src/tools/settings.js';
import {defaultSearchSettings} from '../src/config/searchSettings.js';
import {OlxSourceAdapter} from '../src/sources/olx/OlxSourceAdapter.js';
import {calculateCarQuality} from '../src/analysis/carQuality.js';
import {analyzeDataConsistency} from '../src/analysis/dataConsistency.js';
import {analyzeListingRisk} from '../src/analysis/listingRisk.js';
import {car} from './helpers.js';

test('Catalog distinguishes missing files, names, rights, duplicate numbers and file size', async t => {
  const root=await mkdtemp(join(tmpdir(),'autohunter-image-catalog-'));
  t.after(()=>rm(root,{recursive:true,force:true}));
  const listing:ImageCatalogListing={category:'cars',id:'one',title:'Test',kind:'local'};
  const folder=join(root,'cars','one');await mkdir(folder,{recursive:true});
  const scan=async()=> (await scanDemoImages(root,[listing])).diagnostics[0]!;
  assert.deepEqual((await scan()).issues,['MISSING_PHOTOS','MISSING_RIGHTS']);
  await writeFile(join(folder,'photo.JPG'),'test bytes');
  await writeFile(join(folder,'rights.json'),'{bad json');
  assert.deepEqual((await scan()).issues,['INVALID_FILENAMES','MISSING_PHOTOS','INVALID_RIGHTS_JSON']);
  await writeFile(join(folder,'01.jpg'),'test bytes');
  await writeFile(join(folder,'rights.json'),JSON.stringify({status:'UNKNOWN',evidence:null}));
  assert.equal((await scan()).displayable,false);
  assert.ok((await scan()).issues.includes('UNCONFIRMED_RIGHTS'));
  await writeFile(join(folder,'rights.json'),JSON.stringify({status:'OWNED',evidence:'Test-only bytes'}));
  assert.equal((await scan()).displayable,true);
  await writeFile(join(folder,'01.png'),'another test file');
  assert.equal((await scan()).displayable,false);
  assert.ok((await scan()).issues.includes('DUPLICATE_IMAGE_NUMBER'));
  await writeFile(join(folder,'02.jpg'),'');
  assert.ok((await scan()).issues.includes('INVALID_IMAGE_SIZE'));
});

test('Shipped photographs match their checksums, listing-specific paths and attribution', async t => {
  const sources=JSON.parse(await readFile('fixtures/images/SOURCES.json','utf8')) as {
    category:'cars'|'tractors'|'tools';id:string;filename:string;sha256:string;author:string;license:string;sourceUrl:string
  }[];
  const manifest=await readDemoImageManifest();
  const app=await buildServer({mode:'DEMO'});t.after(()=>app.close());
  assert.equal(sources.length,16);
  assert.equal(new Set(sources.map(row=>row.category+'/'+row.id)).size,12);
  for(const asset of sources){
    const bytes=await readFile(resolve('fixtures/images',asset.category,asset.id,asset.filename));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256);
    const entry=manifest[asset.category]![asset.id]!;
    const url=`/demo-images/${asset.category}/${asset.id}/${asset.filename}`;
    assert.ok(entry.imageUrls.includes(url));assert.equal(entry.imagePresentation,'REPRESENTATIVE_MODEL');
    const credit=entry.imageAttributions!.find(row=>row.imageUrl===url)!;
    assert.equal(credit.author,asset.author);assert.equal(credit.license,asset.license);assert.equal(credit.sourceUrl,asset.sourceUrl);
    const response=await app.inject(url);assert.equal(response.statusCode,200);assert.deepEqual(response.rawPayload,bytes);
  }
  for(const id of ['tool-local-1-0','tool-local-9-0','tool-local-10-0']){
    const listing=attachDemoImages({id,imageUrls:[]},'tools',manifest);
    assert.deepEqual(listing.imageUrls,[]);
    assert.equal((await app.inject(`/demo-images/tools/${id}/01.jpg`)).statusCode,404);
  }
});

test('Alternative image manifest reaches actual search jobs for all three categories', async t => {
  const root=await mkdtemp(join(tmpdir(),'autohunter-image-job-'));
  const file=join(root,'manifest.json');
  const firstCar=(await new OlxSourceAdapter({mode:'fixture'}).searchLocal(defaultSearchSettings)).listings[0]!;
  const tractor=JSON.parse(await readFile('fixtures/tractors.json','utf8')).local[0];
  const tool=JSON.parse(await readFile('fixtures/tools.json','utf8')).local[0];
  const listings=[['cars',firstCar],['tractors',tractor],['tools',tool]] as const;
  const manifest=Object.fromEntries(listings.map(([category,listing])=>{
    const imageUrl=`/demo-images/${category}/${listing.id}/09.jpg`;
    return [category,{[listing.id]:{imageUrl,imageUrls:[imageUrl],imageRights:{status:'OWNED',evidence:'Test only'}}}];
  }));
  await writeFile(file,JSON.stringify(manifest));
  const app=await buildServer({mode:'DEMO',demoImageManifestPath:file});
  t.after(async()=>{await app.close();await rm(root,{recursive:true,force:true});});
  const settings={cars:{location:'Deva',radiusKm:150,minPriceEur:2000,maxPriceEur:10000,minYear:2008,maxMileageKm:250000,excludeDamaged:true,limit:30},
    tractors:defaultTractorSettings,tools:defaultToolSettings};
  for(const [category,listing] of listings){
    const started=await app.inject({method:'POST',url:`/api/${category}/search`,payload:settings[category]});
    assert.equal(started.statusCode,202);
    type ImageRow={id:string;imageUrl:string|null;imageUrls:string[]};
    let job:{status:string;response:{results:(ImageRow|{listing:ImageRow})[]}}|undefined;
    for(let i=0;i<200;i++){
      const snapshot=(await app.inject(`/api/${category}/search/${started.json().searchId}`)).json<NonNullable<typeof job>>();
      job=snapshot;
      if(snapshot.status!=='RUNNING')break;
      await new Promise(resolve=>setTimeout(resolve,5));
    }
    assert.ok(job);assert.equal(job.status,'COMPLETED');
    const rows:ImageRow[]=job.response.results.map(result=>'listing' in result?result.listing:result);
    const row=rows.find(item=>item.id===listing.id);
    assert.ok(row,'Expected starter listing in actual job '+category);
    assert.deepEqual(row.imageUrls,[`/demo-images/${category}/${listing.id}/09.jpg`]);
    assert.equal(row.imageUrl,row.imageUrls[0]);
  }
});

test('Representative model photos preserve car quality; genuine item photos retain existing completeness behavior',()=>{
  const listing=car({imageUrls:[]});
  const data=analyzeDataConsistency(listing),risk=analyzeListingRisk(listing,data);
  const quality=(row:typeof listing)=>calculateCarQuality(row,risk,data,'VERIFIED',2026);
  const before=quality(listing);
  assert.deepEqual(quality({...listing,imageUrls:['/demo-images/cars/test/01.jpg'],imagePresentation:'REPRESENTATIVE_MODEL'}),before);
  assert.ok(quality({...listing,imageUrls:['https://authorized.invalid/item.jpg'],imagePresentation:'ACTUAL_ITEM'}).carQualityScore>before.carQualityScore);
});

test('Image attribution parser rejects unsafe links and preserves plain text provenance',()=>{
  const credit={imageUrl:'/demo-images/cars/one/01.jpg',title:'Photo',author:'Author',sourceUrl:'https://commons.wikimedia.org/wiki/File:One.jpg',license:'CC BY 4.0',licenseUrl:'https://creativecommons.org/licenses/by/4.0/',changes:'Resized'};
  assert.deepEqual(imageMetadata({imagePresentation:'REPRESENTATIVE_MODEL',imageAttributions:[credit]}),{imagePresentation:'REPRESENTATIVE_MODEL',imageAttributions:[credit]});
  assert.deepEqual(imageMetadata({imagePresentation:'WRONG',imageAttributions:[null,{...credit,sourceUrl:'javascript:alert(1)'},{...credit,licenseUrl:'https://name:password@example.invalid/'}]}),{});
});
