import { useState } from 'react';
import { Text, TextInput, Switch, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CarSearchRequest } from '../types';
import { resetSettings, saveSettings, settingsError } from '../settings';
import { Button, colors, Section, styles } from '../ui';

const fields = [
  ['radiusKm', 'Rază (km)', '10–500'], ['minPriceEur', 'Buget minim (€)', 'Minimum 0'],
  ['maxPriceEur', 'Buget maxim (€)', 'Mai mare decât bugetul minim'], ['minYear', 'An minim', '1980–anul curent'],
  ['maxMileageKm', 'Kilometri maximi', 'Minimum 0'], ['limit', 'Număr rezultate', '1–30'],
] as const;
type Field = typeof fields[number][0];
type Draft = Record<Field, string>;
function toDraft(settings: CarSearchRequest): Draft {
  return { radiusKm: String(settings.radiusKm), minPriceEur: String(settings.minPriceEur), maxPriceEur: String(settings.maxPriceEur),
    minYear: String(settings.minYear), maxMileageKm: String(settings.maxMileageKm), limit: String(settings.limit) };
}
export function SettingsScreen({ settings, onSaved, onSaving }: {
  settings: CarSearchRequest; onSaved: (settings: CarSearchRequest) => void; onSaving: (value: boolean) => void;
}) {
  const [draft, setDraft] = useState(() => toDraft(settings));
  const [excludeDamaged, setExcludeDamaged] = useState(settings.excludeDamaged);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function persist(reset: boolean) {
    if (saving) return;
    const numeric = (key: Field): number => draft[key].trim() ? Number(draft[key].trim().replace(',', '.')) : NaN;
    const next: CarSearchRequest = { location: 'Deva', radiusKm: numeric('radiusKm'), minPriceEur: numeric('minPriceEur'),
      maxPriceEur: numeric('maxPriceEur'), minYear: numeric('minYear'), maxMileageKm: numeric('maxMileageKm'), limit: numeric('limit'), excludeDamaged };
    const validation = reset ? null : settingsError(next);
    if (validation) { setError(validation); return; }
    setSaving(true); onSaving(true); setError(null);
    try {
      const saved = reset ? await resetSettings(AsyncStorage) : (await saveSettings(AsyncStorage, next), next);
      onSaved(saved);
    } catch { setError('Setările nu au putut fi salvate pe telefon. Încearcă din nou.'); }
    finally { setSaving(false); onSaving(false); }
  }
  return <View style={styles.page}>
    <Text accessibilityRole="header" style={styles.title}>⚙️ Setări</Text>
    <Text style={styles.subtitle}>Alege ce mașini vrei să găsești.</Text>
    <Section title="Mașini">
      <Text style={styles.body}>Locație: Deva</Text><Text style={styles.muted}>În această versiune, Deva și împrejurimi. Poți modifica raza.</Text>
      {fields.filter(([key]) => key !== 'limit').map(([key, label, hint]) => <View key={key} style={{ gap: 6, marginTop: 6 }}>
        <Text style={styles.body}>{label}</Text>
        <TextInput accessibilityLabel={label} keyboardType="numeric" inputMode="decimal" value={draft[key]} editable={!saving}
          onChangeText={value => setDraft(previous => ({ ...previous, [key]: value }))}
          style={{ minHeight: 56, padding: 14, fontSize: 20, color: colors.ink, borderRadius: 10, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.paper }} />
        <Text style={styles.muted}>{hint}</Text>
      </View>)}
      <Text style={styles.body}>Număr rezultate</Text>
      <View style={styles.row}>{[10, 20, 30].map(limit => <Button key={limit} title={`${draft.limit === String(limit) ? '✓ ' : ''}${limit}`}
        secondary={draft.limit !== String(limit)} disabled={saving} onPress={() => setDraft(previous => ({ ...previous, limit: String(limit) }))} />)}</View>
      <View style={[styles.row, { justifyContent: 'space-between', marginVertical: 12 }]}>
        <Text style={styles.body}>Exclude avariate</Text><Switch accessibilityLabel="Exclude avariate" value={excludeDamaged} disabled={saving}
          onValueChange={setExcludeDamaged} trackColor={{ false: '#A5B1AE', true: colors.green }} />
      </View>
    </Section>
    {error && <View accessibilityRole="alert" style={styles.warning}><Text style={styles.body}>{error}</Text></View>}
    <Button title={saving ? 'SE SALVEAZĂ...' : 'SALVEAZĂ SETĂRILE'} disabled={saving} onPress={() => { void persist(false); }} />
    <Button title="RESETEAZĂ LA IMPLICIT" secondary disabled={saving} onPress={() => { void persist(true); }} />
  </View>;
}
