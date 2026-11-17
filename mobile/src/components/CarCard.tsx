import { StyleSheet, Text, View } from 'react-native';
import { ListingImage } from '../components/ListingImage';
import { isDemoListing, type ListingMode } from '../listingImages';
import type { CarSearchResult } from '../types';
import { carName, discountText, distance, money, numberText, verificationText, classificationLabels, scoreLabels } from '../display';
import { Button, colors, openListing, styles } from '../ui';

export function CarCard({ car, mode, manual = false, onDetails }: { car: CarSearchResult; mode: ListingMode; manual?: boolean; onDetails: () => void }) {
  return <View style={[local.card, manual && { borderColor: colors.amber, borderWidth: 2 }]}>
    <ListingImage category="cars" mode={mode} listingUrl={car.url} listingId={car.id} imageUrl={car.imageUrl} imageUrls={car.imageUrls} thumbnailUrl={car.thumbnailUrl} imagePresentation={car.imagePresentation} imageAttributions={car.imageAttributions} title={car.title} />
    <View style={{ padding: 18, gap: 12 }}>
      {manual && <View style={styles.warning}><Text style={{ color: colors.amber, fontSize: 18, fontWeight: '800' }}>
        ⚠️ {car.verification.seriousConflict ? 'Date contradictorii' : 'Necesită clarificare'}</Text>
        {(car.verification.dataConflicts.length ? car.verification.dataConflicts : car.warnings.slice(0, 2)).map((warning, i) => <Text key={i} style={styles.body}>{warning}</Text>)}
      </View>}
      <Text accessibilityRole="header" style={{ fontSize: 25, fontWeight: '800', color: colors.ink }}>{carName(car)}</Text>
      <Text style={styles.body}>{classificationLabels[car.classification ?? ''] ?? 'Clasificare indisponibilă'}{car.classification === 'INTERESTING_CAR' && (car.price.discountPercent ?? 0) < 0 ? ' / Preț ridicat' : ''}</Text>
      <Text style={styles.muted}>{numberText(car.car.year)} • {car.car.mileageKm === null ? 'Km necunoscuți' : `${numberText(car.car.mileageKm)} km`}</Text>
      <Text style={styles.price}>{money(car.price.askingEur)}</Text>
      <View style={{ gap: 5 }}>
        <Text style={styles.body}>Piață estimată: {car.price.estimatedMarketEur === null ? 'necunoscută' : `~${money(car.price.estimatedMarketEur)}`}</Text>
        <Text style={[styles.body, { color: !manual && (car.price.discountPercent ?? 0) > 0 ? colors.green : colors.muted, fontWeight: '700' }]}>{discountText(car.price.discountPercent)}</Text>
        <Text style={styles.muted}>{(car.price.potentialSavingEur ?? 0) < 0 ? 'Diferență față de piață' : 'Economie potențială'}: {car.price.potentialSavingEur === null ? 'necunoscută' : `~${money(car.price.potentialSavingEur)}`}</Text>
      </View>
      {scoreLabels(car.scores).map(label => <Text key={label} style={styles.body}>{label}</Text>)}
      <Text style={[styles.muted, car.scores.overallRisk >= 70 && { color: colors.red, fontWeight: '800' }]}>🛡 Risc: {car.scores.overallRisk}/100</Text>
      <Text style={styles.muted}>📍 {car.location.text ?? 'Locație necunoscută'} · {distance(car.location.distanceKm)}</Text>
      {car.verification.status !== 'VERIFIED' && <Text style={{ color: colors.amber, fontSize: 15 }}>{verificationText(car.verification.status)}</Text>}
      {isDemoListing({category:'cars', mode, listingUrl:car.url})?<Text style={styles.muted}>ANUNȚ DEMO — date sintetice</Text>:<Button title="VEZI ANUNȚUL" onPress={() => { void openListing(car.url); }} />}
      <Button title="VEZI DETALII" secondary onPress={onDetails} />
    </View>
  </View>;
}
const local = StyleSheet.create({
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 20, overflow: 'hidden' },
});
