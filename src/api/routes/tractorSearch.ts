import type { FastifyInstance } from 'fastify';
import type { RuntimeMode } from '../../config/runtimeMode.js';
import type { TractorSearchSettings, TractorSearchResponse } from '../../tractors/types.js';
import { defaultTractorSettings, validateTractorSettings } from '../../tractors/settings.js';
import { CategoryJobs } from '../categoryJobs.js';

export type TractorEngine = (settings: TractorSearchSettings) => Promise<TractorSearchResponse>;
export function registerTractorSearch(app: FastifyInstance, mode: RuntimeMode, search: TractorEngine): void {
  const jobs = new CategoryJobs<TractorSearchSettings, TractorSearchSettings, TractorSearchResponse>(
    async settings => search(settings), error => app.log.error({ err: error }, 'Tractor job failed'));
  app.get('/api/tractors/search/current', async (_request, reply) => {
    reply.header('Cache-Control','no-store'); return jobs.current();
  });
  app.get<{Params:{searchId:string}}>('/api/tractors/search/:searchId', async (request,reply) => {
    reply.header('Cache-Control','no-store'); const job = jobs.get(request.params.searchId);
    return job ?? reply.code(404).send({error:{code:'SEARCH_NOT_FOUND',message:'Tractor job not found or no longer retained.'}});
  });
  app.post<{Body:TractorSearchSettings}>('/api/tractors/search', { schema: { body: {
    type:'object',additionalProperties:false,
    required:['location','radiusKm','minPriceEur','maxPriceEur','require4x4','excludeBroken','limit'],
    properties: {
      location:{type:'string',minLength:1,maxLength:120,pattern:'\\S'}, radiusKm:{type:'number',minimum:10,maximum:500},
      minPriceEur:{type:'number',minimum:0},maxPriceEur:{type:'number',minimum:0},
      minYear:{type:['integer','null'],minimum:1900},minHorsepower:{type:['number','null'],minimum:0,maximum:1000},
      maxOperatingHours:{type:['number','null'],minimum:0},require4x4:{type:'boolean'},excludeBroken:{type:'boolean'},
      limit:{type:'integer',enum:[10,20,30]},origin:{type:'object',additionalProperties:false,required:['latitude','longitude'],
        properties:{latitude:{type:'number',minimum:-90,maximum:90},longitude:{type:'number',minimum:-180,maximum:180}}},
    },
  } } }, async (request,reply)=>{
    if (mode !== 'DEMO') return reply.code(501).send({error:{code:'CATEGORY_NOT_AVAILABLE_IN_LIVE_MODE',message:'Tractoare LIVE nu este implementat. Folosește AUTOHUNTER_MODE=demo.'}});
    const settings = {...defaultTractorSettings,...request.body,location:request.body.location.trim()};
    try { validateTractorSettings(settings); } catch { return reply.code(400).send({error:{code:'INVALID_REQUEST',message:'Setări tractor invalide. Pentru localități necunoscute sunt necesare coordonate origin.'}}); }
    const started = jobs.start(settings,settings);
    if (!started.created) return reply.code(409).send({error:{code:'SEARCH_IN_PROGRESS',message:'A tractor search is already running.'},searchId:started.job.searchId});
    return reply.code(202).send(started.job);
  });
}
