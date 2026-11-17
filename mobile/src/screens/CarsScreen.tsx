import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { CarSearchRequest } from '../types';
import type { SearchSessionState } from '../searchSession';
import { money, numberText } from '../display';
import { Button, colors, Section, styles } from '../ui';

export function CarsScreen({ settings, busy, jobState, error, onSearch, onSettings }: {
  settings: CarSearchRequest; busy: boolean; error: { title: string; detail: string } | null;
  jobState: SearchSessionState | null;
  onSearch: () => void; onSettings: () => void;
}) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!busy) { setSeconds(0); return; }
    const start = jobState?.startedAt ? Date.parse(jobState.startedAt) : Date.now();
    const timer = setInterval(() => setSeconds(Math.floor((Date.now() - start) / 1000)), 1000);
    return () => clearInterval(timer);
  }, [busy, jobState?.startedAt]);
  return <View style={styles.page}>
    <Text accessibilityRole="header" style={styles.title}>🚗 Mașini</Text>
    <Text style={styles.subtitle}>Găsește cele mai bune oferte disponibile acum în zona ta.</Text>
    <Button title={jobState?.phase === 'PAUSED' ? 'RECONECTEAZĂ LA CĂUTARE' : busy ? 'CĂUTARE ÎN DESFĂȘURARE' : error ? 'ÎNCEARCĂ DIN NOU' : '🔥 CAUTĂ OFERTE'} onPress={onSearch} disabled={busy && jobState?.phase !== 'PAUSED'} />
    {busy && <Section>
      <ActivityIndicator size="large" color={colors.green} />
      <Text accessibilityLiveRegion="polite" style={styles.sectionTitle}>{jobState?.phase === 'RECONNECTING' || jobState?.phase === 'PAUSED' ? 'Reconectare...' : 'AutoHunter caută ofertele...'}</Text>
      <Text style={styles.body}>Poți reveni în aplicație mai târziu. Căutarea continuă pe PC.</Text>
      <Text style={styles.muted}>{jobState?.phase === 'PAUSED' ? 'Nu am putut restabili conexiunea. Apasă „Reconectează la căutare” sau revino mai târziu. Nu pornim altă căutare.' : `Au trecut ${seconds} secunde. Rezultatul rămâne disponibil pe PC.`}</Text>
      <Text style={styles.muted}>Etapele căutării · orientativ</Text>
      {['Căutăm mașini din zonă', 'Comparăm prețurile', 'Verificăm anunțurile', 'Alegem cele mai bune oferte'].map((step, i) =>
        <Text style={styles.body} key={step}>{i + 1}. {step}</Text>)}
    </Section>}
    {error && !busy && <View accessibilityRole="alert" style={styles.warning}>
      <Text style={[styles.sectionTitle, { color: colors.amber }]}>{error.title}</Text><Text style={styles.body}>{error.detail}</Text>
    </View>}
    <Section title="Căutarea ta">
      <Text style={styles.body}>📍 {settings.location} · {settings.radiusKm} km</Text>
      <Text style={styles.body}>{money(settings.minPriceEur)} – {money(settings.maxPriceEur)}</Text>
      <Text style={styles.muted}>An ≥ {settings.minYear} · max. {numberText(settings.maxMileageKm)} km</Text>
      <Button title="Modifică setările" secondary onPress={onSettings} disabled={busy} />
    </Section>
  </View>;
}
