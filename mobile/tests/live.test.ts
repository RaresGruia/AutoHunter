import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readLiveResponse} from '../src/live/api';
const result=()=>({meta:{mode:'LIVE',warnings:[]},results:[{id:'test-only',origin:'WEB_INDEX',originalUrl:'https://www.olx.ro/d/oferta/test-only-ID1.html',
  title:'TEST ONLY: simulated search hit',imageUrls:[],analysis:{status:'INSUFFICIENT_DATA',dealScore:null}}]});
test('LIVE client accepts explicit unscored real-source response shape and rejects DEMO mode',()=>{
  assert.equal(readLiveResponse(result()).results[0]!.analysis.dealScore,null);
  assert.throws(()=>readLiveResponse({...result(),meta:{mode:'DEMO',warnings:[]}}),/INVALID_LIVE_RESPONSE/);
});
test('LIVE client refuses fabricated score with insufficient data and unsafe original links',()=>{
  const value=result();value.results[0]!.analysis.dealScore=50 as never;
  assert.throws(()=>readLiveResponse(value),/INVALID_LIVE_SCORE/);
  const unsafe=result();unsafe.results[0]!.originalUrl='javascript:alert(1)';assert.throws(()=>readLiveResponse(unsafe),/INVALID_LIVE_RESPONSE/);
});
