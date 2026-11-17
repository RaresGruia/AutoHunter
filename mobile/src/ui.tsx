import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import type { PropsWithChildren } from 'react';

export const colors = { ink: '#182D36', muted: '#52646B', green: '#176343', mint: '#E8F2EC',
  paper: '#F4F6F3', white: '#FFFFFF', line: '#D7E0DB', red: '#A92C2C', amber: '#83500B' };

export function Button({ title, onPress, secondary = false, disabled = false }: {
  title: string; onPress: () => void; secondary?: boolean; disabled?: boolean;
}) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled} onPress={onPress}
    style={({ pressed }) => [styles.button, secondary && styles.secondary, disabled && { opacity: 0.45 }, pressed && { opacity: 0.8 }]}>
    <Text style={[styles.buttonText, secondary && { color: colors.green }]}>{title}</Text>
  </Pressable>;
}
export function Section({ title, children }: PropsWithChildren<{ title?: string }>) {
  return <View style={styles.section}>{title && <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>}{children}</View>;
}
export function Fact({ label, value }: { label: string; value: string }) {
  return <View style={styles.fact}><Text style={styles.muted}>{label}</Text><Text style={styles.factValue}>{value}</Text></View>;
}
export async function openListing(url: string): Promise<void> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !['olx.ro', 'www.olx.ro'].includes(parsed.hostname)) throw new Error();
    await Linking.openURL(url);
  } catch { Alert.alert('Anunțul nu poate fi deschis', 'Încearcă din nou sau verifică legătura la internet.'); }
}
export const styles = StyleSheet.create({
  page: { padding: 20, gap: 18, paddingBottom: 36 },
  title: { fontSize: 30, fontWeight: '800', color: colors.ink, letterSpacing: -0.7 },
  subtitle: { fontSize: 19, lineHeight: 28, color: colors.muted },
  body: { fontSize: 17, lineHeight: 25, color: colors.ink },
  muted: { fontSize: 15, lineHeight: 22, color: colors.muted },
  button: { backgroundColor: colors.green, borderRadius: 14, minHeight: 58, paddingHorizontal: 18, paddingVertical: 17, justifyContent: 'center', alignItems: 'center' },
  secondary: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line },
  buttonText: { color: colors.white, fontSize: 17, fontWeight: '800', textAlign: 'center' },
  section: { backgroundColor: colors.white, borderRadius: 18, padding: 20, gap: 12, borderWidth: 1, borderColor: colors.line },
  sectionTitle: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  fact: { gap: 3, paddingVertical: 4 },
  factValue: { fontSize: 18, color: colors.ink, fontWeight: '600' },
  placeholder: { backgroundColor: colors.mint, alignItems: 'center', justifyContent: 'center', gap: 8 },
  warning: { padding: 16, gap: 8, backgroundColor: '#FFF1D8', borderRadius: 12, borderLeftWidth: 4, borderColor: colors.amber },
  price: { color: colors.ink, fontWeight: '800', fontSize: 32 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' },
});
