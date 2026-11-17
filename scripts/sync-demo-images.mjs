import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOlxHtml } from '../src/sources/olx/olxParser.ts';
import { scanDemoImages } from '../src/services/demoImageCatalog.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const check = process.argv.includes('--check');
if (process.argv.slice(2).some(arg => arg !== '--check')) throw Error('Usage: npm run demo:images -- [--check]');
const imageRoot = resolve(root, 'fixtures/images');
const cars = parseOlxHtml(await readFile(resolve(root,'fixtures/olx-search.html'),'utf8'),{fixture:true}).listings;
const categories = { cars: { local: cars, market: [] } };
for (const category of ['tractors','tools']) categories[category] = JSON.parse(await readFile(resolve(root,`fixtures/${category}.json`),'utf8'));
const listings = Object.entries(categories).flatMap(([category,data]) =>
  Object.entries({local:data.local,market:data.market}).flatMap(([kind,rows]) => rows.map(row => ({category,kind,id:row.id,title:row.title}))));
const starter = JSON.parse(await readFile(resolve(imageRoot,'starter-set.json'),'utf8'));
for (const item of starter) {
  if (!listings.some(row => row.category === item.category && row.id === item.id)) throw Error('Unknown starter listing: '+item.id);
}
if (!check) {
  for (const row of listings) await mkdir(resolve(imageRoot,row.category,row.id),{recursive:true});
  for (const item of starter) {
    const folder = resolve(imageRoot,item.category,item.id);
    // Never overwrite an existing declaration or silently grant rights.
    try { await writeFile(resolve(folder,'rights.json'),JSON.stringify({status:'UNKNOWN',evidence:null},null,2)+'\n',{flag:'wx'}); }
    catch(error) { if (error.code !== 'EEXIST') throw error; }
  }
}
const {manifest, diagnostics} = await scanDemoImages(imageRoot,listings);
const manifestFile = resolve(root,'fixtures/demo-images.json');
let previous;
try { previous = JSON.parse(await readFile(manifestFile,'utf8')); } catch(error) { if (error.code !== 'ENOENT') throw error; }
const stale = JSON.stringify(previous) !== JSON.stringify(manifest);
const selected = starter.map(item => diagnostics.find(row => row.category === item.category && row.id === item.id));
const report = {
  listings:diagnostics.length, photos:diagnostics.reduce((sum,row) => sum+row.photos,0),
  displayableListings:diagnostics.filter(row => row.displayable).length,
  starterReady:selected.filter(row => row.displayable && !row.issues.length).length,
  starterTotal:selected.length, manifestWasStale:stale, starter:selected,
};
if (!check) {
  const catalog = ['# Catalog fotografii DEMO','', 'Generat cu `npm run demo:images`. Vezi README.md și STARTER.md pentru pașii exacți.', '',
    '| Categorie | ID | Anunț | Rol | Director în fixtures/images | Poze | Diagnostic |', '| --- | --- | --- | --- | --- | --- | --- |',
    ...diagnostics.map(row => `| ${row.category} | ${row.id} | ${row.title.replaceAll('|','/')} | ${row.kind} | ${row.directory}/ | ${row.photos} | ${row.issues.join(', ') || 'READY'} |`)];
  await writeFile(manifestFile,JSON.stringify(manifest,null,2)+'\n');
  await writeFile(resolve(imageRoot,'CATALOG.md'),catalog.join('\n')+'\n');
  await writeFile(resolve(imageRoot,'STATUS.json'),JSON.stringify(report,null,2)+'\n');
}
console.table(selected.map(({id,photos,displayable,issues}) => ({id,photos,displayable,diagnostic:issues.join(', ') || 'READY'})));
console.log(JSON.stringify({...report,starter:undefined}));
if (check && (stale || report.starterReady !== report.starterTotal)) process.exitCode=1;
