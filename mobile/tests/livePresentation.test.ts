import {test} from 'node:test';
import assert from 'node:assert/strict';
import type {LiveOffer} from '../../src/live/types';
import {emptyFilters,selectOffers,priceOf,exactPhotoUrls,filtersError,availabilityText,splitAvailability} from '../src/live/presentation';
import {readBookmarks,toggleBookmark} from '../src/live/bookmarks';
const row=(extra:Partial<LiveOffer>={}):LiveOffer=>({id:'test-only',category:'cars',title:'Utilizat Dacia Duster 2023 - 8000 EUR, 50000 km',originalUrl:'https://dealer.example.org/ad/1',publisher:'www.autovit.ro',snippet:'',discoveredAt:'2026-10-26T12:00:00Z',
  origin:'WEB_INDEX',availability:'UNVERIFIED',lastVerifiedAt:null,priceEur:null,make:null,model:null,attributes:{},imageUrls:[],imageRights:{status:'UNKNOWN',evidence:null},normalized:null,
  analysis:{status:'INSUFFICIENT_DATA',dealScore:null,estimatedMarketEur:null,savingEur:null,discountPercent:null,confidence:null,comparableCount:0,reasons:[],risks:[],comparableUrls:[]},...extra});
test('Cards use index hints for display and local filtering without modifying confirmed data',()=>{
  const offer=row();assert.deepEqual(priceOf(offer),{amount:8000,currency:'EUR',origin:'INDEX'});
  assert.equal(selectOffers([offer],{...emptyFilters,minPrice:'7000',maxPrice:'9000',minYear:'2020',maxMileage:'60000'},'relevance',new Set()).length,1);
  assert.equal(offer.priceEur,null);assert.deepEqual(offer.attributes,{});assert.equal(offer.analysis.dealScore,null);
  assert.equal(selectOffers([offer],{...emptyFilters,minPrice:'9000'},'relevance',new Set()).length,0);
  assert.equal(selectOffers([row({title:'Price unknown'})],{...emptyFilters,minPrice:'1'},'relevance',new Set()).length,0);
});
test('Discovery links are a separate group from confirmed offers, excluding expired rows in both',()=>{
  const buckets=splitAvailability([row(),row({id:'stale',availability:'STALE'}),row({id:'expired',availability:'EXPIRED'}),row({id:'confirmed',availability:'USER_CONFIRMED',lastVerifiedAt:'2026-10-26T12:00:00Z'})]);
  assert.deepEqual(buckets.confirmed.map(item=>item.id),['confirmed']);assert.deepEqual(buckets.unverified.map(item=>item.id),['test-only','stale']);
});
test('Exact image gate rejects unlicensed, mismatched and representative photos',()=>{
  const imageUrl='https://dealer.example.org/photo.jpg';const allowed=row({imagePresentation:'ACTUAL_ITEM',imageUrls:[imageUrl],imageRights:{status:'LICENSED',evidence:'Test license'},photoProvenance:[{imageUrl,listingId:'test-only',originalUrl:'https://dealer.example.org/ad/1',method:'MANUAL_PERMISSION',evidence:'Test license'}]});
  assert.deepEqual(exactPhotoUrls(allowed),[imageUrl]);
  assert.deepEqual(exactPhotoUrls({...allowed,imageRights:{status:'UNKNOWN',evidence:null}}),[]);
  assert.deepEqual(exactPhotoUrls({...allowed,id:'another-listing'}),[]);
  assert.deepEqual(exactPhotoUrls({...allowed,originalUrl:'https://dealer.example.org/ad/other'}),[]);
  assert.deepEqual(exactPhotoUrls({...allowed,photoProvenance:[]}),[]);
  assert.deepEqual(exactPhotoUrls({...allowed,imagePresentation:'REPRESENTATIVE_MODEL'}),[]);
  assert.equal(selectOffers([allowed,row()],{...emptyFilters,onlyPhotos:true},'relevance',new Set()).length,1);
});
test('Confirmed, unavailable, location, brand, favorites and invalid ranges are handled explicitly',()=>{
  const offer=row({make:'Dacia',attributes:{location:'Brașov'}});
  assert.equal(selectOffers([offer],{...emptyFilters,brand:'DACIA',location:'brasov'},'relevance',new Set()).length,1);
  assert.equal(selectOffers([offer],{...emptyFilters,onlyVerified:true},'relevance',new Set()).length,0);
  assert.equal(selectOffers([row({availability:'USER_CONFIRMED',lastVerifiedAt:'2026-10-26T12:00:00Z'})],{...emptyFilters,onlyVerified:true},'relevance',new Set()).length,1);
  assert.equal(selectOffers([row({availability:'UNAVAILABLE'})],emptyFilters,'relevance',new Set()).length,0);
  assert.equal(selectOffers([offer],{...emptyFilters,favoritesOnly:true},'relevance',new Set([offer.originalUrl])).length,1);
  assert.ok(filtersError({...emptyFilters,minPrice:'900',maxPrice:'100'}));assert.ok(filtersError({...emptyFilters,maxHours:'bad'}));
  assert.equal(selectOffers([offer],{...emptyFilters,minPrice:'bad'},'relevance',new Set()).length,0);
  assert.equal(availabilityText(offer),'Disponibilitate neconfirmată');
});
test('Price sort keeps currencies distinct, unknowns last and no-score offers never gain opportunity ranks',()=>{
  const values=[row({id:'expensive',priceEur:10000}),row({id:'unknown',title:'Price unknown'}),row({id:'cheap',priceEur:3000}),row({id:'ron',title:'TEST 100 RON'})];
  assert.deepEqual(selectOffers(values,emptyFilters,'price-asc',new Set()).map(value=>value.id),['cheap','expensive','ron','unknown']);
  assert.equal(selectOffers(values,{...emptyFilters,currency:'RON'},'relevance',new Set())[0]!.id,'ron');
  assert.ok(selectOffers(values,emptyFilters,'opportunity',new Set()).every(value=>value.analysis.dealScore===null));
});
test('Favorites persist user-chosen canonical links only, survive malformed data and toggle off',()=>{
  const links=toggleBookmark([],row().originalUrl+'?utm_source=TEST','cars','2026-10-26T12:00:00Z');
  assert.deepEqual(Object.keys(links[0]!).sort(),['category','savedAt','url']);assert.deepEqual(readBookmarks(JSON.stringify(links)),links);
  assert.deepEqual(readBookmarks('bad'),[]);assert.deepEqual(readBookmarks(JSON.stringify([{url:'javascript:alert(1)',category:'cars',savedAt:'2026-10-26'}])),[]);
  assert.deepEqual(toggleBookmark(links,row().originalUrl,'cars'),[]);assert.equal(readBookmarks(JSON.stringify([...links,...links])).length,1);
});
