import { Text, View } from 'react-native';
import { ListingImage } from '../components/ListingImage';
import { isDemoListing, type ListingMode } from '../listingImages';
import type { CarSearchResult } from '../types';
import { discountText, distance, money, numberText, verificationText } from '../display';
import { Button, Fact, openListing, Section, styles } from '../ui';

export function DetailsScreen({ car, mode }: { car: CarSearchResult; mode: ListingMode }) {
  return <View style={styles.page}>
    <Text accessibilityRole="header" style={styles.title}>{car.title}</Text>
    <View style={{ borderRadius: 18, overflow: 'hidden' }}><ListingImage category="cars" mode={mode} listingUrl={car.url} listingId={car.id} imageUrl={car.imageUrl} imageUrls={car.imageUrls} thumbnailUrl={car.thumbnailUrl} imagePresentation={car.imagePresentation} imageAttributions={car.imageAttributions} title={car.title} large /></View>
    <Section title="Mașina">
      <Fact label="Marcă / model" value={`${car.car.make ?? 'Necunoscută'} / ${car.car.model ?? 'Necunoscut'}`} />
      <Fact label="An / kilometri" value={`${numberText(car.car.year)} / ${car.car.mileageKm === null ? 'Necunoscuți' : `${numberText(car.car.mileageKm)} km`}`} />
      <Fact label="Motor" value={car.car.engine ?? 'Necunoscut'} />
      <Fact label="Combustibil / cutie" value={`${car.car.fuel ?? 'Necunoscut'} / ${car.car.transmission ?? 'Necunoscută'}`} />
      <Fact label="Tracțiune" value={car.car.drivetrain ?? 'Necunoscută'} />
    </Section>
    <Section title="Preț și comparație">
      <Text style={styles.price}>{money(car.price.askingEur)}</Text>
      <Fact label="Piață estimată" value={car.price.estimatedMarketEur === null ? 'Necunoscută' : `~${money(car.price.estimatedMarketEur)}`} />
      <Text style={styles.body}>{discountText(car.price.discountPercent)}</Text>
      <Fact label="Economie potențială" value={money(car.price.potentialSavingEur)} />
      <Text style={styles.muted}>Înainte de reparații, transport și acte. Nu reprezintă profit net.</Text>
      <Fact label="Mașini comparabile" value={numberText(car.price.comparableCount)} />
      <Fact label="Încrederea estimării" value={`${car.price.confidence}/100`} />
    </Section>
    <Section title="DEAL"><Fact label="🔥 Deal Score" value={`${car.scores.deal}/100`} /><Text style={styles.body}>Prețul față de piață, încrederea estimării și riscurile.</Text></Section>
    <Section title="QUALITY"><Fact label="🚗 Car Quality" value={`${car.scores.carQuality ?? '—'}/100`} />
      {(car.qualityReasons ?? []).map((reason, i) => <Text key={i} style={styles.body}>{reason}</Text>)}</Section>
    <Section title="FLIP"><Fact label="💰 Flip Potential" value={`${car.scores.flipPotential}/100`} />
      <Text style={styles.body}>Discount, economie și riscuri; nu reprezintă profit net.</Text></Section>
    <Section title="MARKET CONFIDENCE"><Fact label="Încredere" value={`${car.price.confidence}/100`} />
      <Fact label="Potrivire configurație" value={car.marketData?.matchQuality ?? 'Indisponibilă'} />
      <Fact label="Similaritate medie" value={`${car.marketData?.comparableSimilarityAverage ?? '—'}/100`} />
      <Fact label="Date piață" value={car.marketData?.freshness ?? 'Indisponibile'} />
      <Fact label="Colectate la" value={car.marketData?.fetchedAt ?? 'Dată necunoscută'} />
      {car.marketData?.freshness === 'STALE' && <Text style={styles.body}>Estimarea pieței folosește date salvate anterior.</Text>}
      {car.marketData?.matchQuality === 'RELAXED' && <Text style={styles.body}>Comparabile cu configurații posibil diferite; încredere redusă.</Text>}</Section>
    <Section title="De ce pare bună">{car.positiveReasons.length ? car.positiveReasons.map((reason, i) => <Text key={i} style={styles.body}>+ {reason}</Text>) : <Text style={styles.body}>Nu sunt suficiente date pentru avantaje clare.</Text>}</Section>
    <Section title="⚠️ Atenție">{[...new Set([...car.warnings, ...car.verification.dataConflicts, ...car.verification.dataWarnings])].map((warning, i) => <Text key={i} style={styles.body}>• {warning}</Text>)}
      {car.sellerClaims.map((claim, i) => <Text style={styles.muted} key={`claim-${i}`}>Afirmație neverificată a vânzătorului: {claim}</Text>)}
      <Text style={styles.muted}>Risc 0 înseamnă că nu au fost găsite indicii în text, nu că mașina a fost inspectată tehnic.</Text>
    </Section>
    <Section title="Riscuri pe categorii">{([
      ['Mecanic', car.risks.mechanical], ['Accident', car.risks.accident], ['Cosmetic', car.risks.cosmetic],
      ['Acte / înmatriculare', car.risks.legal], ['Preț', car.risks.price], ['Date', car.risks.data],
    ] as const).map(([label, risk]) => <Fact key={label} label={label} value={`${risk}/100`} />)}</Section>
    <Section title="Verificare"><Text style={styles.body}>{verificationText(car.verification.status)}</Text>
      <Fact label="Calitatea datelor" value={`${car.verification.dataQualityScore}/100`} />
      <Text style={styles.muted}>Verificarea confirmă citirea paginii. Starea tehnică și afirmațiile vânzătorului nu sunt confirmate.</Text></Section>
    <Section title="Locație"><Text style={styles.body}>📍 {car.location.text ?? 'Necunoscută'}</Text><Text style={styles.body}>{distance(car.location.distanceKm)}</Text></Section>
    {isDemoListing({category:'cars', mode, listingUrl:car.url})?<Text style={styles.muted}>ANUNȚ DEMO — date sintetice</Text>:<Button title="DESCHIDE ANUNȚUL PE OLX" onPress={() => { void openListing(car.url); }} />}
  </View>;
}
