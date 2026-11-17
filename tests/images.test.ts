import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildServer } from '../src/api/server.js';
import { normalizeListingImages } from '../src/models/ListingImages.js';
import { attachDemoImages, readDemoImageManifest, type DemoImageCategory } from '../src/services/demoImages.js';
import { DemoTractorSourceAdapter } from '../src/tractors/demoSource.js';
import { DemoToolSourceAdapter } from '../src/tools/demoSource.js';
import { OlxSourceAdapter } from '../src/sources/olx/OlxSourceAdapter.js';
import { defaultSearchSettings } from '../src/config/searchSettings.js';

test('Image contract keeps primary first, deduplicates the gallery and preserves thumbnail', () => {
  assert.deepEqual(normalizeListingImages({imageUrl:'primary',imageUrls:['secondary','primary',''],thumbnailUrl:'thumb'}),
    {imageUrl:'primary',imageUrls:['primary','secondary'],thumbnailUrl:'thumb'});
  assert.deepEqual(normalizeListingImages({imageUrls:[]}),{imageUrl:null,imageUrls:[],thumbnailUrl:null});
});
for (const category of ['cars','tractors','tools'] as const) {
  test(`${category} DEMO preserves per-listing photos and rejects external/cross-listing paths`, () => {
    const prefix=`/demo-images/${category}/listing-1/`;
    const imageRights={status:'OWNED' as const,evidence:'Test-only fixture'};
    const images={imageRights,imageUrl:prefix+'02.jpg',imageUrls:[prefix+'01.jpg','https://external.invalid/a.jpg',`/demo-images/${category}/other/01.jpg`,prefix+'../../secret.png'],thumbnailUrl:prefix+'thumbnail.jpg'};
    const listing={id:'listing-1',imageUrls:[],priceEur:123};
    const result=attachDemoImages(listing,category,{[category]:{'listing-1':images}});
    assert.deepEqual(result,{...listing,imageRights,imageUrl:prefix+'02.jpg',imageUrls:[prefix+'02.jpg',prefix+'01.jpg'],thumbnailUrl:prefix+'thumbnail.jpg'});
    assert.deepEqual(listing,{id:'listing-1',imageUrls:[],priceEur:123});
  });
}
test('Absent image manifest gives an empty optional image overlay', async () => {
  assert.deepEqual(await readDemoImageManifest(join(tmpdir(),'autohunter-no-manifest-'+Date.now()+'.json')),{});
});
test('DEMO images without documented display rights stay hidden',()=>{
  for(const imageRights of [{status:'UNKNOWN' as const,evidence:null},{status:'OWNED' as const,evidence:''}]){
    const result=attachDemoImages({id:'one',imageUrls:[]},'cars',{cars:{one:{imageUrl:'/demo-images/cars/one/01.jpg',imageUrls:[],imageRights}}});
    assert.deepEqual(result.imageUrls,[]);
  }
});
test('All real DEMO adapters preserve manifest galleries, including car detail verification', async t => {
  const directory=await mkdtemp(join(tmpdir(),'autohunter-image-manifest-'));
  t.after(()=>rm(directory,{recursive:true,force:true}));
  const file=join(directory,'images.json');
  const cars=new OlxSourceAdapter({mode:'fixture',demoImageManifestPath:file});
  const tractors=new DemoTractorSourceAdapter(file), tools=new DemoToolSourceAdapter(file);
  const car=(await cars.searchLocal(defaultSearchSettings)).listings[0]!;
  const tractor=(await tractors.searchLocal()).listings[0]!;
  const tool=(await tools.searchLocal()).listings[0]!;
  const manifest=Object.fromEntries(([['cars',car],['tractors',tractor],['tools',tool]] as const).map(([category,listing])=>{
    const prefix=`/demo-images/${category}/${listing.id}/`;
    return [category,{[listing.id]:{imageRights:{status:'OWNED',evidence:'Test-only fixture'},imageUrl:prefix+'01.jpg',imageUrls:[prefix+'01.jpg',prefix+'02.jpg'],thumbnailUrl:prefix+'thumbnail.jpg'}}];
  }));
  await writeFile(file,JSON.stringify(manifest));
  const received=[(await cars.searchLocal(defaultSearchSettings)).listings[0]!, (await tractors.searchLocal()).listings[0]!, (await tools.searchLocal()).listings[0]!] as const;
  for(const listing of received){assert.equal(listing.imageUrls.length,2);assert.equal(listing.imageUrl,listing.imageUrls[0]);assert.ok(listing.thumbnailUrl?.endsWith('/thumbnail.jpg'));}
  const detail=await cars.getListingDetails(received[0]!);
  assert.deepEqual(detail.imageUrls,received[0]!.imageUrls);
});
test('Local DEMO image route serves bytes, blocks traversal and is unavailable in LIVE', async t => {
  const directory=await mkdtemp(join(tmpdir(),'autohunter-images-'));
  const manifestFile=join(directory,'manifest.json');
  const app=await buildServer({mode:'DEMO',demoImageDirectory:directory,demoImageManifestPath:manifestFile});
  const live=await buildServer({mode:'LIVE',demoImageDirectory:directory});
  t.after(async()=>{await app.close();await live.close();await rm(directory,{recursive:true,force:true});});
  // Small test-only PNG signature. It is not shipped as a listing photograph.
  const bytes=Buffer.from([137,80,78,71,13,10,26,10]);
  const manifest=Object.fromEntries(['cars','tractors','tools'].map(category=>[category,{'listing-1':{imageUrls:['/demo-images/'+category+'/listing-1/01.png'],imageRights:{status:'OWNED',evidence:'Test-only bytes'}}}]));
  await writeFile(manifestFile,JSON.stringify(manifest));
  for(const category of ['cars','tractors','tools'] as DemoImageCategory[]){
    await mkdir(join(directory,category,'listing-1'),{recursive:true});
    await writeFile(join(directory,category,'listing-1','01.png'),bytes);
    const url=`/demo-images/${category}/listing-1/01.png`;
    const response=await app.inject(url);
    assert.equal(response.statusCode,200);assert.equal(response.headers['content-type'],'image/png');
    assert.deepEqual(response.rawPayload,bytes);assert.equal((await live.inject(url)).statusCode,404);
  }
  for(const url of ['/demo-images/cars/listing-1/02.png','/demo-images/cars/listing-1/source.txt',
    '/demo-images/other/listing-1/01.png','/demo-images/cars/listing-1/..%2F..%2Fsecret.png',
    '/demo-images/cars/%2e%2e/01.png']) assert.equal((await app.inject(url)).statusCode,404,url);
  await writeFile(manifestFile,'{}');
  assert.equal((await app.inject('/demo-images/cars/listing-1/01.png')).statusCode,404,'Revoked rights must also block direct asset access');
});
test('DEMO images cannot escape the allowed directory through a directory link', async t => {
  const temp=await mkdtemp(join(tmpdir(),'autohunter-image-link-'));
  const root=join(temp,'images'),outside=join(temp,'outside');
  await mkdir(join(root,'cars'),{recursive:true});await mkdir(outside);
  await writeFile(join(outside,'01.png'),'outside');
  await symlink(outside,join(root,'cars','escape'),process.platform==='win32'?'junction':'dir');
  const manifestFile=join(temp,'manifest.json');
  await writeFile(manifestFile,JSON.stringify({cars:{escape:{imageUrls:['/demo-images/cars/escape/01.png'],imageRights:{status:'OWNED',evidence:'Test-only'}}}}));
  const app=await buildServer({mode:'DEMO',demoImageDirectory:root,demoImageManifestPath:manifestFile});
  t.after(async()=>{await app.close();await rm(temp,{recursive:true,force:true});});
  assert.equal((await app.inject('/demo-images/cars/escape/01.png')).statusCode,404);
});
