import { useState } from 'react';
import { Alert, Image, Linking, Pressable, ScrollView, Text, View } from 'react-native';
import type { DisplayOffer } from './offers';
import { isDemo } from './offers';
import { listingImagePlan } from '../listingImages';
import { apiBaseUrl } from '../apiBaseUrl';
import { publicListingUrl } from '../../../src/models/ListingUrl';
import { exactPhotoUrls } from './presentation';
import { theme, t } from './theme';

export async function openOriginal(url: string) {
  const safe = publicListingUrl(url);
  if (!safe) return;
  try {
    await Linking.openURL(safe);
  } catch {
    Alert.alert('Linkul nu poate fi deschis', 'Verifică legătura la internet și încearcă din nou.');
  }
}
export function OfferMedia({
  row,
  large = false,
  onDetails,
}: {
  row: DisplayOffer;
  large?: boolean;
  onDetails?: () => void;
}) {
  const urls = isDemo(row)
    ? listingImagePlan(
        { mode: 'DEMO', category: 'cars', listingId: row.id, imageUrls: exactPhotoUrls(row) },
        apiBaseUrl(),
      ).uris
    : exactPhotoUrls(row);
  return (
    <Media
      key={row.id + JSON.stringify(urls)}
      row={row}
      urls={urls}
      large={large}
      {...(onDetails ? { onDetails } : {})}
    />
  );
}
function Media({
  row,
  urls,
  large,
  onDetails,
}: {
  row: DisplayOffer;
  urls: string[];
  large: boolean;
  onDetails?: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null),
    [failed, setFailed] = useState<string[]>([]);
  const gallery = urls.filter((url) => !failed.includes(url)),
    active = selected && gallery.includes(selected) ? selected : gallery[0];
  const credit = row.imageAttributions?.find(
    (item) => item.imageUrl === active || (isDemo(row) && active?.endsWith(item.imageUrl)),
  );
  const reject = (uri: string) =>
    setFailed((previous) => (previous.includes(uri) ? previous : [...previous, uri]));
  return (
    <View testID={'offer-media-' + row.id}>
      <View
        style={{
          height: large ? (active ? undefined : 150) : active ? undefined : 100,
          aspectRatio: active ? (large ? 1.65 : 1.6) : undefined,
          maxHeight: large ? 470 : undefined,
          backgroundColor: '#EDF3F4',
          overflow: 'hidden',
          borderRadius: large ? 17 : 0,
        }}
      >
        {active ? (
          <Pressable
            accessibilityRole={onDetails ? 'button' : undefined}
            accessibilityLabel={onDetails ? 'Vezi fotografiile și detaliile' : undefined}
            onPress={onDetails}
            style={{ flex: 1 }}
          >
            <Image
              source={{ uri: active }}
              accessibilityLabel={(isDemo(row) ? 'Fotografie DEMO: ' : 'Fotografia produsului: ') + row.title}
              resizeMode="contain"
              onError={() => reject(active)}
              style={{ width: '100%', height: '100%' }}
            />
          </Pressable>
        ) : (
          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 11, padding: 20 }}>
            <Text style={{ fontSize: 13, color: theme.muted, fontWeight: '600' }}>
              {isDemo(row) ? 'Imagine DEMO indisponibilă' : row.publisher.replace(/^www\./, '')}
            </Text>
            {!isDemo(row) && (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={'Previzualizare la sursă: ' + row.title}
                onPress={() => {
                  void openOriginal(row.originalUrl);
                }}
                style={{ minHeight: 44, justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 12, color: theme.green, fontWeight: '600' }}>
                  Fotografii la sursă ↗
                </Text>
              </Pressable>
            )}
            {large && !isDemo(row) && (
              <Text style={[t.muted, { textAlign: 'center', maxWidth: 340 }]}>
                Fotografiile acestui anunț se consultă pe site-ul original.
              </Text>
            )}
          </View>
        )}
      </View>
      {active && (
        <View style={{ paddingHorizontal: large ? 0 : 12, paddingVertical: 6, gap: 3 }}>
          {isDemo(row) && (
            <Text style={{ fontSize: 10, color: theme.amber }}>
              DEMO · fotografie reprezentativă a modelului
            </Text>
          )}
          {credit ? (
            <>
              <Text style={{ fontSize: 10, lineHeight: 15, color: theme.muted }}>
                {large ? credit.title + ' · ' : ''}
                {credit.author}
              </Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                <Text
                  accessibilityRole="link"
                  onPress={() => {
                    void openOriginal(credit.sourceUrl);
                  }}
                  style={{ fontSize: 10, color: theme.green }}
                >
                  Sursa fotografiei ↗
                </Text>
                <Text
                  accessibilityRole="link"
                  onPress={() => {
                    void openOriginal(credit.licenseUrl);
                  }}
                  style={{ fontSize: 10, color: theme.green }}
                >
                  {credit.license}
                </Text>
              </View>
              {large && (
                <Text style={{ fontSize: 10, lineHeight: 15, color: theme.muted }}>{credit.changes}</Text>
              )}
            </>
          ) : (
            <Text
              numberOfLines={large ? undefined : 2}
              style={{ fontSize: 10, lineHeight: 15, color: theme.muted }}
            >
              {row.imageRights.evidence}
            </Text>
          )}
        </View>
      )}
      {large && gallery.length > 1 && (
        <View style={{ gap: 9, paddingTop: 14 }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10 }}>
            {gallery.map((url, index) => (
              <Pressable
                key={url}
                accessibilityRole="button"
                accessibilityLabel={'Fotografia ' + (index + 1) + ' din ' + gallery.length}
                accessibilityState={{ selected: active === url }}
                onPress={() => setSelected(url)}
                style={{
                  width: 86,
                  height: 66,
                  borderRadius: 10,
                  overflow: 'hidden',
                  borderWidth: 2,
                  borderColor: active === url ? theme.green : theme.line,
                }}
              >
                <Image
                  source={{ uri: url }}
                  resizeMode="cover"
                  onError={() => reject(url)}
                  style={{ width: '100%', height: '100%' }}
                />
              </Pressable>
            ))}
          </ScrollView>
          <Text style={t.muted}>
            Fotografia {gallery.indexOf(active!) + 1} din {gallery.length}
          </Text>
        </View>
      )}
    </View>
  );
}
