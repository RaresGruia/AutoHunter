import type { FastifyInstance } from 'fastify';
import type { Category } from '../../categories/category.js';
import type { DiscoveryService } from '../../discovery/service.js';

export function registerDiscovery(app:FastifyInstance,service:DiscoveryService):void {
  app.get('/api/sources',async()=>({sources:service.registry.list(),externalConnectionsEnabled:false}));
  app.post<{Body:{category:Category;mode?:'DEMO'|'IMPORTED'|'LIVE'}}>('/api/discovery/search',{
    schema:{body:{type:'object',additionalProperties:false,required:['category'],properties:{category:{enum:['cars','tractors','tools','equipment']},mode:{enum:['DEMO','IMPORTED','LIVE']}}}},
  },async request=>service.search(request.body.category,request.body.mode??'DEMO'));
}
