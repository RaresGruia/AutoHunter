import { Text, View } from 'react-native';
import { useState } from 'react';
import { visibleResults } from '../display';
import type { CarSearchResponse, CarSearchResult } from '../types';
import { CarCard } from '../components/CarCard';
import { Button, colors, Section, styles } from '../ui';

export function ResultsScreen({ response, onDetails, onSettings, onSearch }: {
  response: CarSearchResponse; onDetails: (car: CarSearchResult) => void; onSettings: () => void; onSearch: () => void;
}) {
  const [all, setAll] = useState(false);
  return <View style={styles.page}>
    <Text accessibilityRole="header" style={styles.title}>{all ? 'TOATE REZULTATELE' : '🔥 TOP OPORTUNITĂȚI'}</Text>
    <Text style={styles.muted}>{response.meta.location} · {response.meta.radiusKm} km · {response.results.length} oferte</Text>
    <Text style={styles.muted}>Prețuri orientative. Verifică mașina înainte de cumpărare.</Text>
    {response.meta.warnings.filter(warning => /cache|OLX_ACCESS_DENIED/i.test(warning)).map((warning, i) => <Text key={i} style={styles.warning}>{warning}</Text>)}
    {response.results.length === 0 && <Section><Text style={styles.subtitle}>N-am găsit momentan oferte suficient de bune pentru criteriile tale.</Text><Button title="MODIFICĂ SETĂRILE" onPress={onSettings} /></Section>}
    {visibleResults(response.results, all).map(car => <CarCard key={car.id} car={car} mode={response.meta.mode} onDetails={() => onDetails(car)} />)}
    {response.results.length > 10 && <Button title={all ? 'VEZI TOP 10' : `VEZI TOATE CELE ${response.results.length}`} onPress={() => setAll(previous => !previous)} />}
    {response.needsManualVerification.length > 0 && <>
      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.amber, marginTop: 14 }]}>⚠️ NECESITĂ VERIFICARE</Text>
      <Text style={styles.body}>Datele acestor anunțuri trebuie clarificate cu vânzătorul.</Text>
      {response.needsManualVerification.map(car => <CarCard key={`manual-${car.id}`} car={car} mode={response.meta.mode} manual onDetails={() => onDetails(car)} />)}
    </>}
    <Button title="O NOUĂ CĂUTARE" secondary onPress={onSearch} />
  </View>;
}
