import type { CarListing } from '../models/CarListing.js';
import { normalizeText } from './text.js';
import { primaryDescription } from './descriptionContext.js';

export type RegistrationStatus = NonNullable<CarListing['registrationStatus']>;
export function registrationStatus(listing: Pick<CarListing, 'title' | 'description' | 'registrationText'>): RegistrationStatus {
  const text = normalizeText(`${listing.title}. ${primaryDescription(listing.description).text}. ${listing.registrationText ?? ''}`);
  if (/\b(?:neinmatriculat\w*|neimatriculat\w*|unregistered|nu este inmatriculat\w*)\b/.test(text)) return 'UNREGISTERED';
  if (/\b(?:inmatriculat\w* (?:in )?romania|numere (?:de )?romania|numere romanesti)\b/.test(text)) return 'REGISTERED_RO';
  if (/\b(?:import(?:at\w*)?|adus[ae]? (?:recent |pe roti|din)|recent adus\w*|proprietar in strainatate)\b/.test(text)) return 'IMPORT';
  return 'UNKNOWN';
}

export function sellerClaims(listing: Pick<CarListing, 'title' | 'description'>): string[] {
  const text = normalizeText(`${listing.title}. ${listing.description}`);
  const claims: string[] = [];
  if (/\b(?:km|kilometri) reali\b/.test(text)) claims.push('km reali');
  if (/\bstare (?:tehnica (?:si optica )?)?(?:impecabila|perfecta)\b/.test(text)) claims.push('stare impecabilă/perfectă');
  if (/\bfara probleme\b/.test(text)) claims.push('fără probleme');
  if (/\bmasina foarte buna\b/.test(text)) claims.push('mașină foarte bună');
  return claims;
}
