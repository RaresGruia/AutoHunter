import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, colors, styles } from '../ui';

export function HomeScreen({ onCars, onSettings, onTractors, onTools }: { onCars: () => void; onSettings: () => void; onTractors: () => void; onTools: () => void }) {
  const [soon, setSoon] = useState<string | null>(null);
  return <View style={styles.page}>
    <Text style={local.eyebrow}>OFERTE DIN ZONA TA</Text>
    <Text accessibilityRole="header" style={[styles.title, { fontSize: 40 }]}>AutoHunter</Text>
    <Text style={styles.subtitle}>Găsește cele mai bune oferte</Text>
    <Pressable accessibilityRole="button" onPress={onCars} style={local.feature}>
      <Text style={{ fontSize: 40 }}>🚗</Text><View style={{ gap: 5, flex: 1 }}>
        <Text style={local.featureTitle}>MAȘINI</Text><Text style={{ color: '#DBEEE3', fontSize: 17 }}>Oferte verificate, într-un singur loc</Text>
      </View><Text style={{ fontSize: 30, color: 'white' }}>›</Text>
    </Pressable>
    <Pressable accessibilityRole="button" onPress={onTractors} style={local.category}><Text style={{fontSize:21,fontWeight:'700',color:colors.ink}}>🚜 TRACTOARE</Text><Text style={styles.muted}>Oferte și analiză pentru tractoare</Text></Pressable>
    <Pressable accessibilityRole="button" onPress={onTools} style={local.category}><Text style={{fontSize:21,fontWeight:'700',color:colors.ink}}>🔧 SCULE</Text><Text style={styles.muted}>Oferte și analiză pentru scule</Text></Pressable>
    {(['🚚 UTILAJE'] as const).map(label => <Pressable key={label} accessibilityRole="button"
      onPress={() => setSoon(label)} style={local.category}>
      <Text style={{ fontSize: 21, fontWeight: '700', color: colors.ink }}>{label}</Text><Text style={styles.muted}>În curând</Text>
    </Pressable>)}
    {soon && <View accessibilityLiveRegion="polite" style={styles.warning}><Text style={styles.body}>{soon} · În curând</Text></View>}
    <View style={{ marginTop: 16 }}><Button title="⚙️ SETĂRI" secondary onPress={onSettings} /></View>
  </View>;
}
const local = StyleSheet.create({
  eyebrow: { fontSize: 13, letterSpacing: 1.6, color: colors.green, fontWeight: '800', marginTop: 16 },
  feature: { backgroundColor: colors.green, borderRadius: 22, padding: 22, minHeight: 150, flexDirection: 'row', alignItems: 'center', gap: 14, marginVertical: 8 },
  featureTitle: { color: 'white', fontSize: 26, fontWeight: '800' },
  category: { padding: 22, gap: 6, borderRadius: 18, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
});
