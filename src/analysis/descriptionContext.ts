import { normalizeText } from './text.js';

// Un dealer poate include o listă de alte vehicule după descrierea anunțului curent.
// Păstrăm textul original în model; limităm numai extragerea afirmațiilor despre această mașină.
export function primaryDescription(description: string): { text: string; otherVehiclesMentioned: boolean } {
  const normalized = normalizeText(description);
  const marker = /\b(?:cautati alt model|alte (?:masini|modele|autoturisme) disponibile|modele disponibile acum|mai avem (?:in stoc|disponibil)|alte oferte auto)\b/.exec(normalized);
  return { text: marker ? normalized.slice(0, marker.index) : normalized, otherVehiclesMentioned: marker !== null };
}
