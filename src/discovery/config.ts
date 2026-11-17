import { readFile } from 'node:fs/promises';
import { dirname, resolve, isAbsolute } from 'node:path';
import type { Category } from '../categories/category.js';
import type { SourceDescriptor } from './SourceAdapter.js';
import { SourceRegistry } from './registry.js';
import { DemoDiscoveryAdapter, LocalJsonSourceAdapter } from './adapters.js';
import { DiscoveryService } from './service.js';

export async function createDiscoveryService(configFile?:string):Promise<DiscoveryService> {
  const registry=new SourceRegistry();
  for(const category of ['cars','tractors','tools'] as const){const adapter=new DemoDiscoveryAdapter(category);registry.register(adapter.descriptor,adapter);}
  for(const [id,name,categories]of [['olx-api','OLX — acces de confirmat',['cars','tractors','tools','equipment']],['autovit-api','Autovit — acces de confirmat',['cars']]] as const){
    registry.register({id,name,kind:'AUTHORIZED_API',status:'APPROVAL_REQUIRED',categories:[...categories],transport:'NETWORK',configured:false,
      permission:{dataUse:false,imageDisplay:false,reference:null},note:'Niciun acces la catalogul public presupus. Necesită confirmarea scopului API, contractului și drepturilor.'});
  }
  registry.register({id:'commercial-feed',name:'Feed comercial — furnizor neconfigurat',kind:'AUTHORIZED_FEED',status:'UNAVAILABLE',categories:['cars','tractors','tools','equipment'],
    transport:'NETWORK',configured:false,permission:{dataUse:false,imageDisplay:false,reference:null},note:'Necesită furnizor, schemă și acord de utilizare; niciun conector de rețea implementat.'});
  let eurPerRon:number|undefined;
  if(configFile){
    if(/^(?:https?:|\\\\|\/\/)/i.test(configFile))throw Error('Source configuration must be local');
    const config:unknown=JSON.parse(await readFile(configFile,'utf8'));
    if(!config||typeof config!=='object')throw Error('INVALID_SOURCE_CONFIGURATION');
    const settings=config as Record<string,unknown>;
    if(settings.eurPerRon!==undefined){if(typeof settings.eurPerRon!=='number'||!Number.isFinite(settings.eurPerRon)||settings.eurPerRon<=0)throw Error('INVALID_EXCHANGE_RATE');eurPerRon=settings.eurPerRon;}
    if(!Array.isArray(settings.sources))throw Error('INVALID_SOURCE_CONFIGURATION');
    for(const item of settings.sources){
      if(!item||typeof item!=='object')throw Error('INVALID_SOURCE_CONFIGURATION');
      const row=item as Record<string,unknown>,permission=row.permission as SourceDescriptor['permission']|undefined;
      if(typeof row.id!=='string'||typeof row.name!=='string'||!['MANUAL_IMPORT','AUTHORIZED_FEED'].includes(String(row.kind))
        ||typeof row.file!=='string'||/^(?:https?:|\\\\|\/\/)/i.test(row.file)||!Array.isArray(row.categories)
        ||row.categories.length===0||!row.categories.every(category=>['cars','tractors','tools','equipment'].includes(String(category))))throw Error('INVALID_LOCAL_SOURCE_CONFIGURATION');
      const approved=permission?.dataUse===true&&typeof permission.reference==='string'&&permission.reference.trim().length>0;
      const descriptor:SourceDescriptor={id:row.id,name:row.name,kind:row.kind as SourceDescriptor['kind'],categories:row.categories as Category[],
        status:row.enabled===true&&approved?'AVAILABLE':'APPROVAL_REQUIRED',transport:'LOCAL',configured:row.enabled===true,
        permission:{dataUse:approved,imageDisplay:permission?.imageDisplay===true,reference:approved?permission!.reference:null},note:'Import local explicit; nu este o conexiune LIVE.'};
      const file=isAbsolute(row.file)?row.file:resolve(dirname(configFile),row.file);
      registry.register(descriptor,new LocalJsonSourceAdapter(descriptor,file));
    }
  }
  return new DiscoveryService(registry,{allowExternal:false,...(eurPerRon!==undefined?{eurPerRon}:{})});
}
