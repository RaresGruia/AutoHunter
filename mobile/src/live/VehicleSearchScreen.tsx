import { useEffect, useRef, useState } from 'react';
import {
  Animated,
  BackHandler,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LiveCategory } from '../../../src/live/types';
import type { LiveResponse as BackendLiveResponse } from '../../../src/live/types';
import type { DisplayOffer, DisplayResponse } from './offers';
import { isDemo, readDemoResponse, readDemoFavorites, DEMO_FAVORITES_KEY } from './offers';
import type { DemoVehicle } from '../../../src/demo/vehicles';
import { canonicalListingUrl } from '../../../src/models/ListingUrl';
import { liveRequest, readLiveResponse } from './api';
import { BOOKMARKS_KEY, readBookmarks, toggleBookmark, type Bookmark } from './bookmarks';
import { Action, EmptyState, IconButton, useReducedMotion } from './controls';
import { FiltersPanel } from './FiltersPanel';
import { OfferCard } from './OfferCard';
import { OfferDetails } from './OfferDetails';
import { FavoritesSection } from './FavoritesSection';
import { HistoricalAnalysisScreen } from './HistoricalAnalysisScreen';
import {
  emptyFilters,
  selectOffers,
  splitAvailability,
  normalized,
  type OfferFilters,
  type SortOrder,
} from './presentation';
import { theme, t } from './theme';

const suggestions = ['Dacia Duster', 'Toyota Corolla', 'Volkswagen Golf'];
const sortLabels: Partial<Record<SortOrder, string>> = {
  relevance: 'Relevanță',
  'price-asc': 'Preț crescător',
  'price-desc': 'Preț descrescător',
  newest: 'Descoperite recent',
};
type Page = 'explore' | 'favorites' | 'sources' | 'details' | 'history';
type SourceStatus = { configured: boolean; message: string };
const sameUrl = (a: string, b: string) => canonicalListingUrl(a) === canonicalListingUrl(b);
const isLiveResult = (value: DisplayResponse | null): value is BackendLiveResponse =>
  value?.meta.mode === 'LIVE';
const errorText = (code: string) =>
  (
    ({
      BRAVE_RATE_LIMITED: 'Limita de căutări a fost atinsă. Așteaptă un minut înainte de a reîncerca.',
      BRAVE_AUTH_FAILED: 'Cheia sursei de căutare nu este acceptată.',
      BRAVE_NOT_CONFIGURED: 'Sursa LIVE nu este încă configurată.',
      BRAVE_NETWORK_BLOCKED: 'Conexiunea la sursa de căutare este blocată.',
      BRAVE_UNAVAILABLE: 'Sursa de căutare nu răspunde momentan.',
      BRAVE_INVALID_PARAMETERS: 'Sursa a refuzat parametrii căutării.',
    }) as Record<string, string>
  )[code] ?? 'Nu ne putem conecta acum. Verifică dacă backend-ul este pornit și încearcă din nou.';

export function VehicleSearchScreen(_props?: { onDemo?: () => void }) {
  const { width } = useWindowDimensions(),
    desktop = width >= 1050,
    padding = width < 600 ? 18 : 32;
  const [measuredArea, setMeasuredArea] = useState(0);
  const category: LiveCategory = 'cars';
  const [query, setQuery] = useState(''),
    [experience, setExperience] = useState<'DEMO' | 'LIVE'>('DEMO');
  const [catalog, setCatalog] = useState<DemoVehicle[]>([]),
    [demoFavorites, setDemoFavorites] = useState<string[]>([]);
  const [status, setStatus] = useState<SourceStatus | null>(null),
    [result, setResult] = useState<DisplayResponse | null>(null);
  const [busy, setBusy] = useState(true),
    [error, setError] = useState<string | null>(null),
    [page, setPage] = useState<Page>('explore');
  const [selected, setSelected] = useState<DisplayOffer | null>(null),
    [filters, setFilters] = useState<OfferFilters>({ ...emptyFilters }),
    [sort, setSort] = useState<SortOrder>('relevance');
  const [availabilityScope, setAvailabilityScope] = useState<'confirmed' | 'unverified'>('unverified');
  const [sheet, setSheet] = useState<'filters' | 'sort' | null>(null),
    [bookmarks, setBookmarks] = useState<Bookmark[]>([]),
    [storageReady, setStorageReady] = useState(false);
  const [notice, setNotice] = useState(''),
    [reporting, setReporting] = useState(false),
    [undo, setUndo] = useState<DisplayOffer | null>(null),
    [limit, setLimit] = useState(24);
  const carBookmarks = bookmarks.filter((row) => row.category === 'cars');
  const favorites = new Set(
    experience === 'DEMO'
      ? catalog
          .filter((row) => demoFavorites.includes(row.id))
          .map((row) => canonicalListingUrl(row.originalUrl)!)
      : carBookmarks.map((row) => row.url),
  );
  const favoriteCount = experience === 'DEMO' ? demoFavorites.length : carBookmarks.length;
  const scroll = useRef<ScrollView>(null),
    storageQueue = useRef<Promise<unknown>>(Promise.resolve());
  const reduced = useReducedMotion();
  useEffect(() => {
    let active = true;
    void liveRequest('/api/live/status')
      .then((value) => {
        if (active) setStatus(value as SourceStatus);
      })
      .catch(() => {
        if (active) setStatus(null);
      });
    void Promise.all([AsyncStorage.getItem(BOOKMARKS_KEY), AsyncStorage.getItem(DEMO_FAVORITES_KEY)])
      .then(([live, demo]) => {
        if (active) {
          setBookmarks(readBookmarks(live));
          setDemoFavorites(readDemoFavorites(demo));
        }
      })
      .catch(() => {
        if (active) setNotice('Favoritele nu pot fi citite pe acest dispozitiv.');
      })
      .finally(() => {
        if (active) setStorageReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!storageReady) return;
    storageQueue.current = storageQueue.current
      .catch(() => {})
      .then(() => AsyncStorage.setItem(BOOKMARKS_KEY, JSON.stringify(bookmarks)))
      .catch(() => setNotice('Favoritele nu au putut fi salvate pe acest dispozitiv.'));
  }, [bookmarks, storageReady]);
  useEffect(() => {
    if (!storageReady) return;
    storageQueue.current = storageQueue.current
      .catch(() => {})
      .then(() => AsyncStorage.setItem(DEMO_FAVORITES_KEY, JSON.stringify(demoFavorites)))
      .catch(() => setNotice('Favoritele DEMO nu au putut fi salvate.'));
  }, [demoFavorites, storageReady]);
  useEffect(() => {
    let active = true;
    if (experience === 'DEMO') {
      setBusy(true);
      void liveRequest('/api/demo/cars')
        .then((value) => {
          if (active) {
            const demo = readDemoResponse(value);
            setCatalog(demo.results);
            setResult(demo);
          }
        })
        .catch(() => {
          if (active)
            setError('Colecția DEMO nu poate fi încărcată. Verifică dacă backend-ul rulează în modul demo.');
        })
        .finally(() => {
          if (active) setBusy(false);
        });
    }
    return () => {
      active = false;
    };
  }, [experience]);
  useEffect(() => {
    const listener = BackHandler.addEventListener('hardwareBackPress', () => {
      if (sheet) {
        setSheet(null);
        return true;
      }
      if (page !== 'explore') {
        setPage('explore');
        return true;
      }
      return false;
    });
    return () => listener.remove();
  }, [page, sheet]);
  const top = () => scroll.current?.scrollTo({ y: 0, animated: !reduced });
  function navigate(next: Page) {
    setPage(next);
    setSheet(null);
    top();
  }
  function switchExperience(next: 'DEMO' | 'LIVE') {
    if (busy) return;
    if (next === experience) {
      navigate('explore');
      return;
    }
    setExperience(next);
    setQuery('');
    setResult(null);
    setSelected(null);
    setFilters({ ...emptyFilters });
    setError(null);
    setNotice('');
    setUndo(null);
    setLimit(24);
    setAvailabilityScope('unverified');
    navigate('explore');
  }
  function favorite(row: DisplayOffer) {
    if (isDemo(row))
      setDemoFavorites((previous) =>
        previous.includes(row.id) ? previous.filter((id) => id !== row.id) : [...previous, row.id],
      );
    else setBookmarks((previous) => toggleBookmark(previous, row.originalUrl, 'cars'));
  }
  function details(row: DisplayOffer) {
    setSelected(row);
    navigate('details');
  }
  async function search(value = query) {
    if (busy || (experience === 'LIVE' && value.trim().length < 2)) return;
    setBusy(true);
    setError(null);
    setQuery(value);
    setLimit(24);
    navigate('explore');
    try {
      if (experience === 'DEMO') {
        const demo = readDemoResponse(await liveRequest('/api/demo/cars'));
        setCatalog(demo.results);
        const words = normalized(value).split(/\s+/).filter(Boolean),
          results = demo.results.filter((row) => words.every((word) => normalized(row.title).includes(word)));
        setResult({
          ...demo,
          results,
          meta: { ...demo.meta, query: value.trim() || 'Colecția DEMO', discovered: results.length },
        });
        return;
      }
      const response = readLiveResponse(
        await liveRequest('/api/live/search', { category, query: value.trim() }),
      );
      setResult(response);
      setAvailabilityScope(
        response.results.some(
          (row) => row.availability === 'USER_CONFIRMED' || row.availability === 'ACTIVE_VERIFIED',
        )
          ? 'confirmed'
          : 'unverified',
      );
      if (response.meta.searchStatus.startsWith('BRAVE_')) setError(errorText(response.meta.searchStatus));
    } catch (reason) {
      setError(errorText(reason instanceof Error ? reason.message : ''));
    } finally {
      setBusy(false);
    }
  }
  async function report(row: DisplayOffer, restore = false) {
    if (isDemo(row)) return;
    setReporting(true);
    setError(null);
    try {
      await liveRequest('/api/live/availability-report', {
        originalUrl: row.originalUrl,
        status: restore ? 'UNVERIFIED' : 'UNAVAILABLE',
        note: restore
          ? 'Raportare anulată de utilizator.'
          : 'Indisponibilitate raportată din aplicație de utilizator.',
      });
      if (restore) {
        setResult((previous) =>
          isLiveResult(previous)
            ? {
                ...previous,
                results: [
                  ...previous.results.filter((item) => !sameUrl(item.originalUrl, row.originalUrl)),
                  row,
                ],
                meta: {
                  ...previous.meta,
                  excludedUnavailable: Math.max(0, (previous.meta.excludedUnavailable ?? 0) - 1),
                },
              }
            : previous,
        );
        setUndo(null);
        setNotice('Raportarea a fost anulată. Disponibilitatea rămâne de verificat.');
      } else {
        setResult((previous) =>
          isLiveResult(previous)
            ? {
                ...previous,
                results: previous.results.filter((item) => !sameUrl(item.originalUrl, row.originalUrl)),
                meta: { ...previous.meta, excludedUnavailable: (previous.meta.excludedUnavailable ?? 0) + 1 },
              }
            : previous,
        );
        setUndo(row);
        setNotice('Anunțul raportat a fost ascuns din rezultate.');
        navigate('explore');
      }
    } catch {
      setError('Raportarea nu a putut fi salvată. Încearcă din nou.');
    } finally {
      setReporting(false);
    }
  }
  const buckets = splitAvailability(result?.results ?? []),
    scoped = experience === 'DEMO' ? (result?.results ?? []) : buckets[availabilityScope];
  const visible = selectOffers(scoped, filters, sort, favorites),
    containerWidth = Math.min(width, 1640) - padding * 2;
  const areaWidth = measuredArea || containerWidth - (desktop ? 270 : 0),
    columns = areaWidth >= 1120 ? 4 : areaWidth >= 810 ? 3 : areaWidth >= 540 ? 2 : 1,
    gap = 18;
  const cardWidth = Math.floor((areaWidth - gap * (columns - 1)) / columns);
  const active = Object.entries(filters).filter(
    ([key, value]) => value !== emptyFilters[key as keyof OfferFilters],
  );
  const setFilter = (next: OfferFilters) => {
    setFilters(next);
    setLimit(24);
  };
  const searchBox = (
    <View
      style={{
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 9,
        backgroundColor: 'white',
        borderRadius: 12,
        padding: 6,
        paddingLeft: 14,
        minWidth: 0,
      }}
    >
      <Text style={{ color: theme.muted, fontSize: 25 }}>⌕</Text>
      <TextInput
        accessibilityLabel={'Căutare ' + experience}
        placeholder={experience === 'DEMO' ? 'Caută în exemplele DEMO…' : 'Dacia Duster, Golf, Corolla…'}
        placeholderTextColor="#8A999F"
        value={query}
        onChangeText={setQuery}
        editable={!busy}
        onSubmitEditing={() => {
          void search();
        }}
        returnKeyType="search"
        style={{ flex: 1, minWidth: 0, color: theme.text, fontSize: 14, minHeight: 38, paddingVertical: 7 }}
      />
      <Action
        title={busy ? 'Caută…' : 'Caută'}
        accessibilityLabel={'Caută ' + experience}
        disabled={busy || (experience === 'LIVE' && query.trim().length < 2)}
        onPress={() => {
          void search();
        }}
        compact
        style={{ paddingHorizontal: width < 400 ? 11 : 20 }}
      />
    </View>
  );
  const navigation = (mobile = false) => (
    <View
      style={{
        flexDirection: 'row',
        gap: mobile ? 0 : 8,
        justifyContent: mobile ? 'space-around' : undefined,
      }}
    >
      {(
        [
          ['explore', '⌕', 'Descoperă'],
          ['favorites', '♡', 'Favorite'],
          ['history', '▥', 'Analiză'],
          ['sources', '◈', 'Despre'],
        ] as const
      ).map(([value, icon, label]) => (
        <Pressable
          key={value}
          accessibilityRole="button"
          accessibilityLabel={value === 'history' ? 'Analiză DEMO salvată' : label}
          accessibilityState={{ selected: page === value }}
          onPress={() => navigate(value)}
          style={{
            minHeight: mobile ? 56 : 42,
            paddingHorizontal: mobile ? 12 : 15,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            gap: mobile ? 2 : 5,
            flexDirection: mobile ? 'column' : 'row',
            backgroundColor: mobile ? 'white' : page === value ? '#274A53' : 'transparent',
          }}
        >
          <Text
            style={{
              fontSize: mobile ? 22 : 17,
              color: mobile ? (page === value ? theme.green : theme.muted) : '#D7E4E6',
            }}
          >
            {icon}
          </Text>
          <Text
            style={{
              fontSize: mobile ? 10 : 13,
              fontWeight: '600',
              color: mobile ? (page === value ? theme.green : theme.muted) : 'white',
            }}
          >
            {label}
            {value === 'favorites' && favoriteCount ? ' · ' + favoriteCount : ''}
          </Text>
        </Pressable>
      ))}
    </View>
  );
  return (
    <View style={t.root}>
      <ScrollView
        ref={scroll}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: desktop ? 0 : 12 }}
      >
        <View style={{ backgroundColor: theme.navy }}>
          <View
            style={{
              width: '100%',
              maxWidth: 1640,
              alignSelf: 'center',
              paddingHorizontal: padding,
              paddingTop: 16,
              paddingBottom: 14,
              gap: 14,
            }}
          >
            <View style={[t.row, { gap: desktop ? 35 : 12 }]}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Pagina principală AutoHunter"
                onPress={() => navigate('explore')}
                style={[t.row, { gap: 10 }]}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 11,
                    backgroundColor: theme.green,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text style={{ color: 'white', fontSize: 23, fontWeight: '700' }}>A</Text>
                  <View
                    style={{
                      width: 16,
                      height: 2,
                      backgroundColor: '#7CE2B3',
                      position: 'absolute',
                      bottom: 7,
                    }}
                  />
                </View>
                <Text style={{ fontSize: 22, color: 'white', fontWeight: '700', letterSpacing: -0.7 }}>
                  AutoHunter
                </Text>
              </Pressable>
              {desktop && <View style={{ flex: 1, maxWidth: 600 }}>{searchBox}</View>}
              <View style={{ flex: desktop ? 0 : 1 }} />
              <View
                accessibilityLabel="Modul aplicației"
                style={{ flexDirection: 'row', backgroundColor: '#08252E', borderRadius: 8, padding: 3 }}
              >
                {(['DEMO', 'LIVE'] as const).map((mode) => (
                  <Pressable
                    key={mode}
                    accessibilityRole="button"
                    accessibilityLabel={'Mod ' + mode}
                    accessibilityState={{
                      selected: page !== 'history' && experience === mode,
                      disabled: busy,
                    }}
                    disabled={busy}
                    onPress={() => switchExperience(mode)}
                    style={{
                      paddingHorizontal: 10,
                      minHeight: 38,
                      justifyContent: 'center',
                      borderRadius: 6,
                      backgroundColor:
                        page !== 'history' && experience === mode ? theme.green : 'transparent',
                    }}
                  >
                    <Text style={{ fontSize: 10, color: 'white', fontWeight: '700' }}>{mode}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            {!desktop && searchBox}
            <View
              style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 15, alignItems: 'center' }}
            >
              <Text style={{ color: '#BFD4D9', fontSize: 12 }}>Vehicle Listing Search &amp; Comparison</Text>
              {desktop && navigation()}
            </View>
          </View>
        </View>
        <View
          style={{
            width: '100%',
            maxWidth: 1640,
            alignSelf: 'center',
            paddingHorizontal: padding,
            paddingTop: desktop ? 30 : 23,
            paddingBottom: 36,
            gap: 23,
          }}
        >
          {!!notice && (
            <View
              accessibilityRole="alert"
              style={{
                padding: 13,
                borderRadius: 10,
                backgroundColor: theme.greenLight,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              <Text style={[t.muted, { color: theme.green, flex: 1 }]}>{notice}</Text>
              {undo && (
                <Action
                  title="Anulează"
                  secondary
                  compact
                  disabled={reporting}
                  onPress={() => {
                    void report(undo, true);
                  }}
                />
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Închide notificarea"
                onPress={() => {
                  setNotice('');
                  setUndo(null);
                }}
                style={{ width: 32, height: 40, justifyContent: 'center', alignItems: 'center' }}
              >
                <Text>×</Text>
              </Pressable>
            </View>
          )}
          {!!error && (
            <View
              accessibilityRole="alert"
              style={[t.panel, { backgroundColor: '#FFF6F1', borderColor: '#F0D9CB', gap: 12 }]}
            >
              <Text style={[t.body, { color: theme.red }]}>{error}</Text>
              <Action
                title="Încearcă din nou"
                secondary
                compact
                disabled={busy}
                onPress={() => {
                  void search();
                }}
                style={{ alignSelf: 'flex-start' }}
              />
            </View>
          )}
          {page === 'explore' && (
            <>
              {experience === 'LIVE' && status?.configured === false && (
                <Text style={[t.muted, { color: theme.amber }]}>
                  LIVE necesită o cheie Brave configurată în backend. Colecția DEMO funcționează fără cheie.
                </Text>
              )}
              <View style={{ gap: 6 }}>
                <Text
                  style={[t.muted, { fontSize: 11, letterSpacing: 1, color: theme.green, fontWeight: '600' }]}
                >
                  {experience === 'DEMO' ? 'EXEMPLE DEMO · DATE FICTIVE' : 'CĂUTARE LIVE · BRAVE SEARCH'}
                </Text>
                <Text accessibilityRole="header" style={[t.heading, { fontSize: desktop ? 29 : 25 }]}>
                  {result
                    ? experience === 'DEMO'
                      ? 'Mașini de exemplu'
                      : 'Rezultate pentru „' + result.meta.query + '”'
                    : 'Caută și compară mașini'}
                </Text>
                <Text style={t.muted}>
                  {result
                    ? visible.length +
                      ' rezultate' +
                      (experience === 'DEMO'
                        ? ' · fotografii reprezentative, licențiate'
                        : ' · disponibilitatea se verifică la sursă')
                    : 'Descoperă linkuri reale după marcă sau model, apoi filtrează și salvează ce te interesează.'}
                </Text>
                {experience === 'DEMO' && query.length > 0 && (
                  <Action
                    title="Toate exemplele DEMO"
                    secondary
                    compact
                    onPress={() => {
                      void search('');
                    }}
                    style={{ alignSelf: 'flex-start' }}
                  />
                )}
              </View>
              {!result && !busy && (
                <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                  {suggestions.map((value) => (
                    <Action
                      key={value}
                      title={value + ' ↗'}
                      secondary
                      compact
                      onPress={() => {
                        void search(value);
                      }}
                    />
                  ))}
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 24, alignItems: 'flex-start' }}>
                {desktop && (
                  <View style={[t.panel, { width: 246, padding: 18 }]}>
                    <FiltersPanel
                      category={category}
                      filters={filters}
                      onChange={setFilter}
                      demo={experience === 'DEMO'}
                    />
                  </View>
                )}
                <View
                  onLayout={(event) => setMeasuredArea(event.nativeEvent.layout.width)}
                  style={{ flex: 1, minWidth: 0, gap: 18 }}
                >
                  {result && experience === 'LIVE' && buckets.confirmed.length > 0 && (
                    <View
                      accessibilityLabel="Separarea disponibilității"
                      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
                    >
                      <Action
                        title={'Confirmate · ' + buckets.confirmed.length}
                        secondary={availabilityScope !== 'confirmed'}
                        compact
                        onPress={() => setAvailabilityScope('confirmed')}
                      />
                      <Action
                        title={'De verificat · ' + buckets.unverified.length}
                        secondary={availabilityScope !== 'unverified'}
                        compact
                        onPress={() => setAvailabilityScope('unverified')}
                      />
                    </View>
                  )}
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 8,
                    }}
                  >
                    {!desktop ? (
                      <Action
                        title={'Filtre' + (active.length ? ' · ' + active.length : '')}
                        icon="☷"
                        secondary
                        compact
                        onPress={() => setSheet('filters')}
                      />
                    ) : (
                      <Text style={[t.muted, { fontSize: 12 }]}>
                        {result
                          ? experience === 'DEMO'
                            ? 'Colecție DEMO · fotografii locale'
                            : 'Linkuri descoperite prin Brave'
                          : 'Caută după marcă sau model'}
                      </Text>
                    )}
                    <Action
                      title={sortLabels[sort] + ' ⌄'}
                      secondary
                      compact
                      accessibilityLabel="Sortează rezultatele"
                      onPress={() => setSheet('sort')}
                    />
                  </View>
                  {active.length > 0 && (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {active.map(([key, value]) => (
                        <Pressable
                          key={key}
                          accessibilityRole="button"
                          accessibilityLabel={'Elimină filtrul ' + key}
                          onPress={() =>
                            setFilter({ ...filters, [key]: emptyFilters[key as keyof OfferFilters] })
                          }
                          style={{
                            backgroundColor: theme.greenLight,
                            borderRadius: 8,
                            paddingHorizontal: 10,
                            minHeight: 36,
                            justifyContent: 'center',
                          }}
                        >
                          <Text style={{ fontSize: 12, color: theme.green }}>
                            {(
                              {
                                brand: 'Marcă',
                                location: 'Localitate',
                                minPrice: 'De la',
                                maxPrice: 'Până la',
                                currency: 'Monedă',
                                minYear: 'Din anul',
                                maxMileage: 'Max. km',
                                maxHours: 'Max. ore',
                                onlyPhotos: 'Cu fotografii',
                                onlyVerified: 'Confirmate',
                                favoritesOnly: 'Favorite',
                                condition: 'Stare',
                              } as Record<string, string>
                            )[key] ?? key}
                            {typeof value === 'string' ? ' ' + value : ''} ×
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                  )}
                  {busy ? (
                    <Skeleton columns={columns} cardWidth={cardWidth} />
                  ) : result ? (
                    <>
                      {!visible.length ? (
                        availabilityScope === 'confirmed' &&
                        !buckets.confirmed.length &&
                        buckets.unverified.length > 0 ? (
                          <EmptyState
                            title="Nicio ofertă cu disponibilitate confirmată"
                            description="Linkurile găsite sunt separate în «De verificat». Nu le prezentăm drept oferte active sau recomandate."
                            action={{
                              title: 'Vezi linkurile de verificat',
                              onPress: () => setAvailabilityScope('unverified'),
                            }}
                          />
                        ) : (
                          <EmptyState
                            title={
                              scoped.length
                                ? 'Nicio ofertă cu aceste filtre'
                                : 'Nu am găsit anunțuri pentru această căutare'
                            }
                            description={
                              scoped.length
                                ? 'Unele oferte nu au încă preț, fotografii ori caracteristici confirmate. Încearcă filtre mai largi.'
                                : 'Încearcă alt model sau o denumire mai scurtă. Nu completăm rezultatele LIVE cu anunțuri DEMO.'
                            }
                            {...(scoped.length
                              ? {
                                  action: {
                                    title: 'Resetează filtrele',
                                    onPress: () => setFilter({ ...emptyFilters }),
                                  },
                                }
                              : {})}
                          />
                        )
                      ) : (
                        <View testID="results-grid" style={{ flexDirection: 'row', flexWrap: 'wrap', gap }}>
                          {visible.slice(0, limit).map((row) => (
                            <View
                              key={row.id}
                              style={{ width: columns === 1 ? '100%' : cardWidth, minWidth: 0 }}
                            >
                              <OfferCard
                                row={row}
                                favorite={favorites.has(canonicalListingUrl(row.originalUrl)!)}
                                onFavorite={() => favorite(row)}
                                onDetails={() => details(row)}
                              />
                            </View>
                          ))}
                        </View>
                      )}
                      {visible.length > limit && (
                        <Action title="Arată mai multe" secondary onPress={() => setLimit(limit + 24)} />
                      )}
                      {!!result.meta.excludedUnavailable && (
                        <Text style={t.muted}>
                          {result.meta.excludedUnavailable === 1
                            ? 'Un anunț indisponibil a fost ascuns.'
                            : result.meta.excludedUnavailable + ' anunțuri indisponibile au fost ascunse.'}
                        </Text>
                      )}
                      {experience === 'LIVE' &&
                        result.meta.searchStatus !== 'OK' &&
                        result.meta.searchStatus !== 'CACHED' &&
                        !error && (
                          <Text style={{ fontSize: 12, color: theme.amber }}>
                            Căutarea automată nu este disponibilă. Nu sunt afișate exemple DEMO în LIVE.
                          </Text>
                        )}
                      {experience === 'LIVE' && (
                        <Text style={[t.muted, { fontSize: 11 }]}>
                          Brave descoperă pagini; disponibilitatea și datele actuale se verifică la sursă.
                        </Text>
                      )}
                    </>
                  ) : (
                    <View style={[t.panel, { padding: 22, gap: 10 }]}>
                      <Text style={t.sectionTitle}>Caută după marcă sau model</Text>
                      <Text style={t.muted}>
                        Rezultatele LIVE sunt linkuri descoperite prin Brave. Disponibilitatea se verifică pe
                        site-ul original.
                      </Text>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                        <Action
                          title="Vezi exemplele DEMO"
                          secondary
                          compact
                          onPress={() => switchExperience('DEMO')}
                        />
                      </View>
                    </View>
                  )}
                </View>
              </View>
            </>
          )}
          {page === 'history' && <HistoricalAnalysisScreen width={width} onTop={top} />}
          {page === 'details' && selected && (
            <OfferDetails
              row={selected}
              wide={desktop}
              favorite={favorites.has(canonicalListingUrl(selected.originalUrl)!)}
              onFavorite={() => favorite(selected)}
              onBack={() => navigate('explore')}
              onReport={() => {
                void report(selected);
              }}
              reporting={reporting}
            />
          )}
          {page === 'favorites' && (
            <FavoritesSection
              mode={experience}
              catalog={catalog}
              demoIds={demoFavorites}
              bookmarks={carBookmarks}
              result={result}
              width={width}
              onExplore={() => navigate('explore')}
              onFavorite={favorite}
              onDetails={details}
              onRemoveLink={(url) => setBookmarks((previous) => previous.filter((row) => row.url !== url))}
            />
          )}
          {page === 'sources' && (
            <View style={{ gap: 20, maxWidth: 820, width: '100%', alignSelf: 'center' }}>
              <Text accessibilityRole="header" style={t.heading}>
                Despre AutoHunter
              </Text>
              <Text style={t.body}>
                Vehicle Listing Search &amp; Comparison — un proiect de portofoliu pentru căutarea, filtrarea
                și compararea informațiilor din anunțuri auto.
              </Text>
              <View style={t.panel}>
                <View style={[t.row, { justifyContent: 'space-between' }]}>
                  <Text style={t.sectionTitle}>LIVE · Brave Search</Text>
                  <Text style={t.muted}>{status?.configured ? 'Configurat' : 'Necesită cheie API'}</Text>
                </View>
                <Text style={t.body}>
                  Găsește linkuri către anunțuri indexate. Un link nu dovedește că oferta mai este
                  disponibilă. Prețurile și caracteristicile lipsă rămân necunoscute.
                </Text>
                <Text style={t.muted}>
                  Fotografiile originale sunt afișate numai cu drept de utilizare. În rest, deschizi anunțul
                  pe site-ul sursă. Filtrele și favoritele nu declanșează căutări plătite.
                </Text>
              </View>
              <View style={t.panel}>
                <Text style={t.sectionTitle}>DEMO · cinci exemple locale</Text>
                <Text style={t.body}>
                  Date fictive și fotografii licențiate, reprezentative pentru model. Colecția arată
                  cardurile, filtrele, favoritele și galeria fără o cheie Brave. Nu conține oferte reale.
                </Text>
                <Text style={t.muted}>
                  Autorul, sursa și licența sunt indicate lângă fotografii. DEMO și LIVE au rezultate și
                  favorite separate.
                </Text>
              </View>
              <View style={t.panel}>
                <Text style={t.sectionTitle}>Comparație cu limite clare</Text>
                <Text style={t.body}>
                  Compari prețul, anul și kilometrajul atunci când există date. Un scor sau o estimare de
                  piață nu sunt afișate fără date și comparabile suficiente.
                </Text>
              </View>
            </View>
          )}
        </View>
        <View
          style={{
            borderTopWidth: 1,
            borderColor: theme.line,
            paddingHorizontal: padding,
            paddingVertical: 18,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 11, color: theme.muted }}>
            AutoHunter · Vehicle Listing Search &amp; Comparison
          </Text>
        </View>
      </ScrollView>
      {!desktop && (
        <View
          style={{ backgroundColor: 'white', borderTopWidth: 1, borderColor: theme.line, paddingBottom: 2 }}
        >
          {navigation(true)}
        </View>
      )}
      <Modal
        visible={sheet !== null}
        transparent
        animationType={reduced ? 'none' : 'fade'}
        onRequestClose={() => setSheet(null)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: '#09232D88',
            justifyContent: desktop ? 'center' : 'flex-end',
            alignItems: 'center',
          }}
        >
          <Pressable
            accessibilityLabel="Închide panoul"
            onPress={() => setSheet(null)}
            style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0 }}
          />
          <View
            accessibilityViewIsModal
            style={{
              width: desktop ? 430 : '100%',
              maxWidth: 540,
              maxHeight: '88%',
              backgroundColor: 'white',
              borderRadius: desktop ? 20 : 22,
              borderBottomLeftRadius: desktop ? 20 : 0,
              borderBottomRightRadius: desktop ? 20 : 0,
              padding: 22,
              gap: 16,
            }}
          >
            <View style={[t.row, { justifyContent: 'space-between' }]}>
              <Text style={t.sectionTitle}>
                {sheet === 'sort' ? 'Sortează rezultatele' : 'Alege filtrele'}
              </Text>
              <IconButton label="Închide" symbol="×" onPress={() => setSheet(null)} />
            </View>
            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 10 }}>
              {sheet === 'sort' ? (
                <View style={{ gap: 8 }}>
                  {(Object.keys(sortLabels) as SortOrder[]).map((value) => (
                    <Action
                      key={value}
                      title={sortLabels[value]!}
                      secondary={sort !== value}
                      onPress={() => {
                        setSort(value);
                        setSheet(null);
                      }}
                    />
                  ))}
                </View>
              ) : (
                <FiltersPanel
                  category={category}
                  filters={filters}
                  onChange={setFilter}
                  demo={experience === 'DEMO'}
                />
              )}
            </ScrollView>
            {sheet === 'filters' && (
              <Action title={'Arată ' + visible.length + ' rezultate'} onPress={() => setSheet(null)} />
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}
function Skeleton({ columns, cardWidth }: { columns: number; cardWidth: number }) {
  const opacity = useRef(new Animated.Value(1)).current,
    reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) {
      opacity.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.45, duration: 650, useNativeDriver: Platform.OS !== 'web' }),
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: Platform.OS !== 'web' }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [reduced, opacity]);
  return (
    <View
      accessibilityLabel="Se încarcă ofertele"
      accessibilityRole="progressbar"
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}
    >
      {Array.from({ length: columns * 2 }, (_, i) => (
        <Animated.View
          key={i}
          style={{
            opacity,
            width: columns === 1 ? '100%' : cardWidth,
            borderWidth: 1,
            borderColor: theme.line,
            borderRadius: 16,
            overflow: 'hidden',
            backgroundColor: 'white',
          }}
        >
          <View style={{ height: 184, backgroundColor: '#E2EAEC' }} />
          <View style={{ padding: 18, gap: 14 }}>
            {[0.7, 0.45, 0.6, 0.9].map((value, j) => (
              <View
                key={j}
                style={{
                  height: j === 2 ? 26 : 13,
                  width: (value * 100 + '%') as `${number}%`,
                  borderRadius: 5,
                  backgroundColor: '#E2EAEC',
                }}
              />
            ))}
          </View>
        </Animated.View>
      ))}
    </View>
  );
}
