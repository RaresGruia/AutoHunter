import { Text, View } from 'react-native';
import type { DemoVehicle } from '../../../src/demo/vehicles';
import { canonicalListingUrl } from '../../../src/models/ListingUrl';
import type { Bookmark } from './bookmarks';
import type { DisplayOffer, DisplayResponse } from './offers';
import { OfferCard } from './OfferCard';
import { Action, EmptyState } from './controls';
import { openOriginal } from './OfferMedia';
import { t } from './theme';

export function FavoritesSection({
  mode,
  catalog,
  demoIds,
  bookmarks,
  result,
  width,
  onExplore,
  onFavorite,
  onDetails,
  onRemoveLink,
}: {
  mode: 'DEMO' | 'LIVE';
  catalog: DemoVehicle[];
  demoIds: string[];
  bookmarks: Bookmark[];
  result: DisplayResponse | null;
  width: number;
  onExplore: () => void;
  onFavorite: (row: DisplayOffer) => void;
  onDetails: (row: DisplayOffer) => void;
  onRemoveLink: (url: string) => void;
}) {
  const urls = new Set(bookmarks.map((row) => row.url));
  const rows =
    mode === 'DEMO'
      ? catalog.filter((row) => demoIds.includes(row.id))
      : result?.meta.mode === 'LIVE'
        ? result.results.filter((row) => urls.has(canonicalListingUrl(row.originalUrl)!))
        : [];
  const missing =
    mode === 'LIVE'
      ? bookmarks.filter(
          (bookmark) => !rows.some((row) => canonicalListingUrl(row.originalUrl) === bookmark.url),
        )
      : [];
  const count = rows.length + missing.length;
  return (
    <View style={{ gap: 20 }}>
      <Text accessibilityRole="header" style={t.heading}>
        Favoritele tale · {mode}
      </Text>
      <Text style={t.muted}>
        {mode === 'DEMO'
          ? 'Exemplele salvate sunt separate de linkurile LIVE.'
          : 'Linkurile sunt salvate pe acest dispozitiv. Datele ofertelor nu se actualizează automat.'}
      </Text>
      {!count ? (
        <EmptyState
          title="Păstrează mașinile interesante"
          description="Apasă inima unui rezultat pentru a-l găsi aici."
          action={{ title: 'Înapoi la căutare', onPress: onExplore }}
        />
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}>
          {rows.map((row) => (
            <View key={row.id} style={{ width: width < 600 ? '100%' : 310 }}>
              <OfferCard
                row={row}
                favorite
                onFavorite={() => onFavorite(row)}
                onDetails={() => onDetails(row)}
              />
            </View>
          ))}
          {missing.map((bookmark) => (
            <View key={bookmark.url} style={[t.panel, { width: width < 600 ? '100%' : 310 }]}>
              <Text style={t.sectionTitle}>Link salvat</Text>
              <Text numberOfLines={3} style={t.muted}>
                {bookmark.url}
              </Text>
              <Text style={t.muted}>Salvat la {new Date(bookmark.savedAt).toLocaleDateString('ro-RO')}</Text>
              <Action
                title="Deschide originalul ↗"
                onPress={() => {
                  void openOriginal(bookmark.url);
                }}
              />
              <Action title="Elimină din favorite" secondary onPress={() => onRemoveLink(bookmark.url)} />
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
