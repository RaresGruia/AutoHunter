import type { CarListing } from '../models/CarListing.js';
import { normalizeText } from './text.js';

interface Brand { make: string; aliases: string[]; models: Record<string, string[]> }
const models = (names: string): Record<string, string[]> => Object.fromEntries(names.split('|').map(name => [name, [name]]));

export const CAR_CATALOG: readonly Brand[] = [
  { make: 'Volkswagen', aliases: ['Volkswagen', 'VW'], models: { ...models('Tiguan|Passat|Polo|Touareg|Touran|Sharan|Caddy|Scirocco|Arteon|T-Roc|T-Cross|Transporter|Jetta|Golf'), 'Golf Plus': ['golf plus', 'golf 5 plus', 'golf 6 plus', 'golf v plus', 'golf vi plus'], 'Golf Sportsvan': ['golf sportsvan', 'sportsvan'] } },
  { make: 'Dacia', aliases: ['Dacia'], models: { ...models('Duster|Sandero|Logan|Dokker|Lodgy|Spring|Jogger'), 'Logan MCV': ['logan mcv'] } },
  { make: 'Skoda', aliases: ['Skoda'], models: models('Octavia|Fabia|Superb|Kodiaq|Karoq|Kamiq|Rapid|Roomster|Yeti|Scala|Citigo') },
  { make: 'Renault', aliases: ['Renault'], models: models('Megane|Clio|Scenic|Grand Scenic|Laguna|Captur|Kadjar|Koleos|Espace|Talisman|Twingo|Fluence|Zoe|Austral') },
  { make: 'Opel', aliases: ['Opel'], models: models('Astra|Insignia|Corsa|Zafira|Meriva|Mokka|Vectra|Antara|Agila|Crossland|Grandland|Combo') },
  { make: 'Ford', aliases: ['Ford'], models: { ...models('Focus|Mondeo|Fiesta|Kuga|Puma|Ka|Fusion|Ranger|Transit|Galaxy|Mustang|EcoSport|Edge'), 'C-Max': ['c max', 'cmax'], 'Grand C-Max': ['grand c max', 'grand cmax'], 'S-Max': ['s max', 'smax'] } },
  { make: 'Toyota', aliases: ['Toyota'], models: models('Yaris|Corolla|Auris|Avensis|RAV4|Land Cruiser|Aygo|Prius|C-HR|Hilux|Verso|Camry') },
  { make: 'Audi', aliases: ['Audi'], models: models('A1|A2|A3|A4|A5|A6|A7|A8|Q2|Q3|Q5|Q7|Q8|TT') },
  { make: 'BMW', aliases: ['BMW'], models: { ...models('X1|X2|X3|X4|X5|X6|X7|i3|i4'),
    'Seria 1': ['seria 1', '1 series', '116d', '118d', '120d', '118i'],
    'Seria 2': ['seria 2', '2 series', '218d', '220d'],
    'Seria 3': ['seria 3', '3 series', '318d', '320d', '320i', '330d', 'e90', 'e91', 'f30', 'f31'],
    'Seria 4': ['seria 4', '4 series', '420d', '430d'],
    'Seria 5': ['seria 5', '5 series', '520d', '525d', '530d', 'f10', 'f11'],
    'Seria 6': ['seria 6', '6 series', '640d'], 'Seria 7': ['seria 7', '7 series', '730d'] } },
  { make: 'Mercedes-Benz', aliases: ['Mercedes-Benz', 'Mercedes', 'Mercedes Benz'], models: {
    ...models('GLA|GLB|GLC|GLE|GLK|GLS|CLS|Vito|Sprinter'),
    'Clasa A': ['clasa a', 'a class', 'a 160', 'a 180', 'a 200'], 'Clasa B': ['clasa b', 'b class', 'b 180', 'b 200'],
    'Clasa C': ['clasa c', 'c class', 'c 180', 'c 200', 'c 220', 'c 250', 'c220', 'c200'],
    'Clasa E': ['clasa e', 'e class', 'e 200', 'e 220', 'e 250', 'e 320', 'e220'],
    'Clasa S': ['clasa s', 's class', 's 320', 's 350', 's 500'],
  } },
  { make: 'Seat', aliases: ['Seat'], models: models('Leon|Ibiza|Altea|Alhambra|Toledo|Ateca|Arona|Tarraco') },
  { make: 'Nissan', aliases: ['Nissan'], models: models('Qashqai|X-Trail|Juke|Micra|Note|Navara|Pathfinder|Patrol|Primera|Almera|Leaf') },
  { make: 'Hyundai', aliases: ['Hyundai'], models: models('i10|i20|i30|i40|ix20|ix35|Tucson|Santa Fe|Getz|Accent|Elantra|Kona') },
  { make: 'Kia', aliases: ['Kia'], models: { ...models('Sportage|Sorento|Rio|Picanto|Optima|Stonic|Niro|Venga|Carens'), Ceed: ['ceed', "cee'd"] } },
  { make: 'Suzuki', aliases: ['Suzuki'], models: models('Grand Vitara|Vitara|Swift|SX4|Jimny|Ignis|Splash|Alto|S-Cross') },
  { make: 'Peugeot', aliases: ['Peugeot'], models: models('106|107|108|206|207|208|306|307|308|406|407|408|508|2008|3008|5008|Partner|Rifter') },
  { make: 'Citroen', aliases: ['Citroen'], models: models('C1|C2|C3|C4|C5|C6|C3 Picasso|C4 Picasso|C4 Cactus|Berlingo|Xsara|Saxo') },
  { make: 'Fiat', aliases: ['Fiat'], models: models('Panda|Punto|Grande Punto|Tipo|Bravo|Stilo|500|500L|500X|Doblo|Ducato|Freemont') },
  { make: 'Volvo', aliases: ['Volvo'], models: models('S40|S60|S80|S90|V40|V50|V60|V70|V90|XC40|XC60|XC70|XC90|C30') },
  { make: 'Honda', aliases: ['Honda'], models: models('Civic|Accord|Jazz|CR-V|HR-V|Insight') },
  { make: 'Mazda', aliases: ['Mazda'], models: { ...models('2|3|5|6|CX-3|CX-5|CX-7|CX-30|MX-5'), '3': ['3', 'mazda3'], '6': ['6', 'mazda6'] } },
  { make: 'Chevrolet', aliases: ['Chevrolet'], models: models('Spark|Aveo|Cruze|Captiva|Orlando|Lacetti') },
];

const tokens = (value: string): string => normalizeText(value).replace(/[^a-z0-9]+/g, ' ').trim();
function contains(text: string, alias: string): boolean {
  return ` ${tokens(text)} `.includes(` ${tokens(alias)} `);
}

export interface CarIdentity { make: string | null; model: string | null; identityConfidence: number }

export function identifyCar(input: { title: string; make?: string | null; model?: string | null }): CarIdentity {
  const explicit = CAR_CATALOG.filter(brand => brand.aliases.some(alias => tokens(alias) === tokens(input.make ?? '')));
  const titled = CAR_CATALOG.filter(brand => brand.aliases.some(alias => contains(input.title, alias)));
  const brand = explicit[0] ?? (titled.length === 1 ? titled[0] : undefined);
  if (explicit.length > 1 || titled.length > 1 || (brand && titled.some(other => other !== brand))) {
    return { make: null, model: null, identityConfidence: 15 };
  }
  const candidates: { make: string; model: string; strength: number }[] = [];
  for (const entry of brand ? [brand] : CAR_CATALOG) {
    for (const [model, aliases] of Object.entries(entry.models)) {
      for (const alias of [model, ...aliases]) {
        // Modelele numerice (2008, 3...) sunt ambigue fără o marcă explicită.
        if (!brand && /^\d+$/.test(alias)) continue;
        const structured = tokens(input.model ?? '') === tokens(alias);
        const numeric = /^\d+$/.test(alias);
        const inTitle = numeric
          ? entry.aliases.some(make => contains(input.title, `${make} ${alias}`))
          : contains(input.title, alias);
        if (structured || inTitle) candidates.push({ make: entry.make, model, strength: tokens(alias).length });
      }
    }
  }
  const unique = [...new Map(candidates.map(candidate => [`${candidate.make}:${candidate.model}`, candidate])).values()];
  // Golf Plus / Grand Vitara / Logan MCV sunt modele distincte de denumirea lor scurtă.
  const specific = unique.filter(candidate => !unique.some(other => other !== candidate && other.make === candidate.make
    && contains(other.model, candidate.model) && other.model.length > candidate.model.length));
  if (specific.length !== 1) return { make: brand?.make ?? null, model: null, identityConfidence: brand ? 35 : 10 };
  const match = specific[0]!;
  return { make: match.make, model: match.model, identityConfidence: brand ? (input.model ? 98 : 95) : 85 };
}

export function normalizeCarIdentity(listing: CarListing): CarListing {
  const identity = identifyCar(listing);
  return { ...listing, ...identity, identityConfidence: Math.min(listing.identityConfidence ?? 100, identity.identityConfidence) };
}

export function identityKey(identity: Pick<CarListing, 'make' | 'model'>): string | null {
  return identity.make && identity.model ? `${tokens(identity.make === 'VW' ? 'Volkswagen' : identity.make)}:${tokens(identity.model)}` : null;
}
