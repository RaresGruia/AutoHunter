import { useRef, useState } from 'react';
import { Animated, Platform, Pressable, Text, View } from 'react-native';
import type { DisplayOffer } from './offers';
import { isDemo } from './offers';
import { OfferMedia } from './OfferMedia';
import {
  amount,
  availabilityText,
  confirmed,
  numberText,
  priceOf,
  publisherName,
  shortTitle,
  unavailable,
  valueOf,
} from './presentation';
import { theme, t } from './theme';
import { useReducedMotion } from './controls';
import { AnalysisSummary } from './AnalysisSummary';

export function OfferCard({
  row,
  favorite,
  onFavorite,
  onDetails,
  list = false,
}: {
  row: DisplayOffer;
  favorite: boolean;
  onFavorite: () => void;
  onDetails: () => void;
  list?: boolean;
}) {
  const [hover, setHover] = useState(false),
    translate = useRef(new Animated.Value(0)).current,
    reduced = useReducedMotion();
  const price = priceOf(row),
    year = valueOf(row, 'year'),
    mileage = valueOf(row, 'mileageKm'),
    hours = valueOf(row, 'operatingHours');
  const facts = [
    year !== null ? String(year) : null,
    row.category === 'cars' && mileage !== null ? numberText(mileage) + ' km' : null,
    row.category === 'tractors' && hours !== null ? numberText(hours) + ' ore' : null,
    typeof row.attributes.condition === 'string'
      ? ((
          { NEW: 'Nou', LIKE_NEW: 'Ca nou', USED: 'Folosit', FOR_PARTS: 'Pentru piese' } as Record<
            string,
            string
          >
        )[row.attributes.condition] ?? null)
      : null,
  ].filter(Boolean);
  function hovered(value: boolean) {
    setHover(value);
    Animated.timing(translate, {
      toValue: value && !reduced ? -3 : 0,
      duration: reduced ? 0 : 140,
      useNativeDriver: Platform.OS !== 'web',
    }).start();
  }
  return (
    <Animated.View
      testID={'listing-card-' + row.id}
      style={{
        flex: 1,
        transform: [{ translateY: translate }],
        backgroundColor: theme.white,
        borderWidth: 1,
        borderColor: hover ? '#A6C7BC' : theme.line,
        borderRadius: 16,
        overflow: 'hidden',
        flexDirection: list ? 'row' : 'column',
      }}
    >
      <View style={{ width: list ? 245 : undefined }}>
        <OfferMedia row={row} onDetails={onDetails} />
        <View
          style={{
            position: 'absolute',
            left: 12,
            top: 12,
            paddingHorizontal: 9,
            paddingVertical: 5,
            borderRadius: 6,
            backgroundColor: theme.white,
          }}
        >
          <Text style={{ fontSize: 10, letterSpacing: 0.5, color: theme.muted, fontWeight: '700' }}>
            {row.category === 'cars' ? 'MAȘINĂ' : row.category === 'tractors' ? 'TRACTOR' : 'SCULĂ'}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={(favorite ? 'Elimină de la favorite: ' : 'Salvează la favorite: ') + row.title}
          accessibilityState={{ selected: favorite }}
          onPress={onFavorite}
          style={({ pressed }) => ({
            position: 'absolute',
            top: 9,
            right: 9,
            width: 40,
            height: 40,
            borderRadius: 11,
            backgroundColor: 'white',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: pressed ? 0.6 : 1,
          })}
        >
          <Text style={{ fontSize: 24, color: favorite ? theme.green : theme.muted }}>
            {favorite ? '♥' : '♡'}
          </Text>
        </Pressable>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={'Vezi detalii: ' + row.title}
        onPress={onDetails}
        onHoverIn={() => hovered(true)}
        onHoverOut={() => hovered(false)}
        style={{ padding: 17, gap: 10, flex: 1 }}
      >
        <Text style={{ fontSize: 11, color: theme.muted, fontWeight: '600' }}>
          {publisherName(row.publisher)}
        </Text>
        <Text
          numberOfLines={2}
          style={{ fontSize: 16, lineHeight: 22, fontWeight: '700', color: theme.text, minHeight: 44 }}
        >
          {shortTitle(row)}
        </Text>
        <Text style={{ fontSize: 12, color: theme.muted, minHeight: 17 }}>
          {facts.length ? facts.join('  ·  ') : 'Caracteristici la sursă'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', flexWrap: 'wrap', gap: 7 }}>
          <Text
            style={{
              fontSize: 23,
              lineHeight: 31,
              fontWeight: '700',
              letterSpacing: -0.5,
              color: theme.text,
            }}
          >
            {price ? amount(price.amount, price.currency) : 'Preț la sursă'}
          </Text>
          {price?.origin === 'INDEX' && (
            <Text style={{ fontSize: 10, color: theme.amber, fontWeight: '600' }}>NECONFIRMAT</Text>
          )}
        </View>
        <Text numberOfLines={1} style={t.muted}>
          ⌖{' '}
          {typeof row.attributes.location === 'string' && row.attributes.location
            ? row.attributes.location
            : 'Localitate la sursă'}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View
            style={{
              width: 5,
              height: 5,
              borderRadius: 3,
              backgroundColor: unavailable(row) ? theme.red : confirmed(row) ? theme.green : '#C39B59',
            }}
          />
          <Text
            numberOfLines={1}
            style={{ fontSize: 11, color: unavailable(row) ? theme.red : theme.muted, flex: 1 }}
          >
            {availabilityText(row)}
          </Text>
        </View>
        {!isDemo(row) && <AnalysisSummary analysis={row.analysis} compact />}
        <View style={{ height: 1, backgroundColor: theme.line, marginTop: 2 }} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 5,
              borderRadius: 6,
              backgroundColor: row.analysis.status === 'SCORED' ? theme.greenLight : '#F1F4F5',
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '600', color: theme.muted }}>
              {isDemo(row) ? 'DEMO' : 'Sursă originală ↗'}
            </Text>
          </View>
          <Text style={{ fontSize: 12, fontWeight: '600', color: theme.green }}>Detalii →</Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}
