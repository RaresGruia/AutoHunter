import type {FastifyInstance} from 'fastify';
import type {RuntimeMode} from '../../config/runtimeMode.js';
import {TOOL_CATEGORIES,TOOL_CONDITIONS,type ToolSearchSettings,type ToolSearchResponse} from '../../tools/types.js';
import {defaultToolSettings,validateToolSettings} from '../../tools/settings.js';
import {CategoryJobs} from '../categoryJobs.js';
export type ToolEngine=(settings:ToolSearchSettings)=>Promise<ToolSearchResponse>;
export function registerToolSearch(app:FastifyInstance,mode:RuntimeMode,search:ToolEngine):void {
  const jobs=new CategoryJobs<ToolSearchSettings,ToolSearchSettings,ToolSearchResponse>(settings=>search(settings),error=>app.log.error({err:error},'Tool job failed'));
  app.get('/api/tools/search/current',async(_request,reply)=>{reply.header('Cache-Control','no-store');return jobs.current();});
  app.get<{Params:{searchId:string}}>('/api/tools/search/:searchId',async(request,reply)=>{
    reply.header('Cache-Control','no-store');return jobs.get(request.params.searchId)??reply.code(404).send({error:{code:'SEARCH_NOT_FOUND',message:'Tool job not found.'}});
  });
  app.post<{Body:ToolSearchSettings}>('/api/tools/search',{schema:{body:{type:'object',additionalProperties:false,
    required:['location','radiusKm','minPriceEur','maxPriceEur','excludeBroken','limit'],properties:{
      location:{type:'string',minLength:1,maxLength:120,pattern:'\\S'},radiusKm:{type:'number',minimum:10,maximum:500},
      minPriceEur:{type:'number',minimum:0},maxPriceEur:{type:'number',minimum:0},condition:{type:'string',enum:['ALL',...TOOL_CONDITIONS]},
      categories:{anyOf:[{const:'ALL'},{type:'array',minItems:1,maxItems:TOOL_CATEGORIES.length,uniqueItems:true,items:{type:'string',enum:TOOL_CATEGORIES}}]},
      excludeBroken:{type:'boolean'},limit:{type:'integer',enum:[10,20,30]},origin:{type:'object',additionalProperties:false,required:['latitude','longitude'],
        properties:{latitude:{type:'number',minimum:-90,maximum:90},longitude:{type:'number',minimum:-180,maximum:180}}},
    }}}},async(request,reply)=>{
    if(mode!=='DEMO')return reply.code(501).send({error:{code:'CATEGORY_NOT_AVAILABLE_IN_LIVE_MODE',message:'Sculele sunt disponibile numai în DEMO.'}});
    const settings={...defaultToolSettings,...request.body,location:request.body.location.trim()};
    try{validateToolSettings(settings);}catch(error){return reply.code(400).send({error:{code:'INVALID_REQUEST',message:error instanceof Error?error.message:'Invalid tool settings'}});}
    const started=jobs.start(settings,settings);
    if(!started.created)return reply.code(409).send({error:{code:'SEARCH_IN_PROGRESS',message:'A tool search is already running.'},searchId:started.job.searchId});
    return reply.code(202).send(started.job);
  });
}
