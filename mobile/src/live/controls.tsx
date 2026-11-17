import { useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { theme, t } from './theme';

export function Action({
  title,
  onPress,
  secondary = false,
  disabled = false,
  icon,
  compact = false,
  accessibilityLabel,
  style,
}: {
  title: string;
  onPress: () => void;
  secondary?: boolean;
  disabled?: boolean;
  icon?: string;
  compact?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? title}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        s.button,
        {
          backgroundColor: secondary ? theme.white : theme.green,
          minHeight: compact ? 40 : 46,
          borderColor: secondary ? theme.line : theme.green,
          opacity: disabled ? 0.45 : pressed ? 0.8 : 1,
        },
        style,
      ]}
    >
      {icon && <Text style={{ fontSize: 17, color: secondary ? theme.text : theme.white }}>{icon}</Text>}
      <Text
        style={{
          fontSize: compact ? 12 : 14,
          fontWeight: '600',
          color: secondary ? theme.text : theme.white,
        }}
      >
        {title}
      </Text>
    </Pressable>
  );
}
export function IconButton({
  label,
  symbol,
  onPress,
  active = false,
  dark = false,
}: {
  label: string;
  symbol: string;
  onPress: () => void;
  active?: boolean;
  dark?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => ({
        width: 42,
        height: 42,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: active ? theme.greenLight : dark ? '#24434B' : theme.white,
        opacity: pressed ? 0.7 : 1,
        borderWidth: dark ? 0 : 1,
        borderColor: theme.line,
      })}
    >
      <Text style={{ fontSize: 23, color: active ? theme.green : dark ? 'white' : theme.muted }}>
        {symbol}
      </Text>
    </Pressable>
  );
}
export function Check({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
  hint?: string;
}) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      style={{ flexDirection: 'row', gap: 10, minHeight: 42, alignItems: 'center' }}
    >
      <View
        style={{
          width: 19,
          height: 19,
          borderRadius: 5,
          borderWidth: 1,
          borderColor: value ? theme.green : '#C8D5D9',
          backgroundColor: value ? theme.green : 'white',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {value && <Text style={{ color: 'white', fontSize: 12 }}>✓</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={t.body}>{label}</Text>
        {hint && <Text style={[t.muted, { fontSize: 11 }]}>{hint}</Text>}
      </View>
    </Pressable>
  );
}
export function useReducedMotion() {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((value) => {
      if (active) setReduced(value);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      active = false;
      sub.remove();
    };
  }, []);
  return reduced;
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: { title: string; onPress: () => void };
}) {
  return (
    <View
      style={{
        paddingVertical: 46,
        paddingHorizontal: 22,
        alignItems: 'center',
        gap: 13,
        borderWidth: 1,
        borderColor: theme.line,
        borderRadius: 18,
        backgroundColor: 'white',
      }}
    >
      <View
        style={{
          width: 58,
          height: 58,
          borderRadius: 18,
          backgroundColor: theme.greenLight,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 28, color: theme.green }}>⌕</Text>
      </View>
      <Text accessibilityRole="header" style={[t.sectionTitle, { textAlign: 'center' }]}>
        {title}
      </Text>
      <Text style={[t.muted, { textAlign: 'center', maxWidth: 420 }]}>{description}</Text>
      {action && <Action {...action} />}
    </View>
  );
}
export function BusyLabel() {
  return (
    <View style={t.row}>
      <ActivityIndicator size="small" color={theme.green} />
      <Text style={t.muted}>Căutăm anunțuri…</Text>
    </View>
  );
}
const s = StyleSheet.create({
  button: {
    paddingHorizontal: 17,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
