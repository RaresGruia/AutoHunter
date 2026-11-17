import type { CarListing } from './CarListing.js';

export type ComparableCriteria = Pick<CarListing, 'make' | 'model' | 'year' | 'mileageKm' | 'fuel' | 'engine' | 'drivetrain'>;
