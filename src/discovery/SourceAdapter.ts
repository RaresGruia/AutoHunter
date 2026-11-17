import type { Category } from '../categories/category.js';
import type { ListingImages } from '../models/ListingImages.js';

export type SourceKind = 'DEMO' | 'AUTHORIZED_API' | 'AUTHORIZED_FEED' | 'MANUAL_IMPORT';
export type SourceStatus = 'DEMO' | 'AVAILABLE' | 'APPROVAL_REQUIRED' | 'UNAVAILABLE';
import type { ImageRights } from '../models/ListingImages.js';
export type { ImageRights } from '../models/ListingImages.js';
export interface SourceDescriptor {
  id: string; name: string; kind: SourceKind; status: SourceStatus; categories: Category[];
  transport: 'LOCAL' | 'NETWORK'; configured: boolean;
  permission: { dataUse: boolean; imageDisplay: boolean; reference: string | null };
  note: string;
}
export interface ListingInput extends ListingImages {
  id: string; category: Category; title: string; originalUrl: string | null;
  make: string | null; model: string | null;
  price: { amount: number; currency: 'EUR' | 'RON' };
  location: { country: string; text: string | null; latitude: number | null; longitude: number | null };
  imageRights: ImageRights;
  /** Only an authoritative cross-source identifier; never a make/model fingerprint. */
  identity?: { namespace: string; value: string };
  attributes?: Record<string, string | number | boolean | null>;
}
export interface CommonListing extends ListingImages {
  id: string; sourceId: string; sourceListingId: string; sourceKind: SourceKind;
  category: Category; title: string; originalUrl: string | null;
  make: string | null; model: string | null; priceEur: number;
  location: ListingInput['location']; imageRights: ImageRights;
  metadata: { mode: 'DEMO' | 'IMPORTED' | 'LIVE'; fetchedAt: string; originalPrice: ListingInput['price'];
    eurPerRon: number | null; identity?: ListingInput['identity']; attributes: NonNullable<ListingInput['attributes']> };
}
export interface DiscoveryHit {
  id:string; category:Category; title:string; originalUrl:string; publisher:string;
  snippet:string; discoveredAt:string;
}
export interface SourceBatch { listings: ListingInput[]; comparables: ListingInput[]; fetchedAt: string; hits?:DiscoveryHit[] }
export interface DiscoverySourceAdapter {
  readonly descriptor: SourceDescriptor;
  load(category: Category, context?:{query:string}): Promise<SourceBatch>;
}
