export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface SearchSettings {
  location: string;
  origin: Coordinates;
  radiusKm: number;
  minPriceEur: number;
  maxPriceEur: number;
  minYear: number;
  maxMileageKm: number;
  excludeDamaged: boolean;
  registrationPenalty?: number;
}
