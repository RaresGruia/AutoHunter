import { Text, TextInput, View } from 'react-native';
import type { LiveCategory } from '../../../src/live/types';
import { Action, Check } from './controls';
import { emptyFilters, filtersError, type OfferFilters } from './presentation';
import { theme, t } from './theme';

export function FiltersPanel({
  category,
  filters,
  onChange,
  demo = false,
}: {
  category: LiveCategory;
  filters: OfferFilters;
  onChange: (filters: OfferFilters) => void;
  demo?: boolean;
}) {
  const update = <K extends keyof OfferFilters>(key: K, value: OfferFilters[K]) =>
    onChange({ ...filters, [key]: value });
  const field = (
    key: 'brand' | 'location' | 'minPrice' | 'maxPrice' | 'minYear' | 'maxMileage' | 'maxHours',
    label: string,
    placeholder: string,
  ) => (
    <View key={key} style={{ gap: 6, flex: 1 }}>
      <Text style={t.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={filters[key]}
        onChangeText={(value) => update(key, value)}
        placeholder={placeholder}
        placeholderTextColor="#91A0A5"
        keyboardType={['brand', 'location'].includes(key) ? 'default' : 'numeric'}
        style={t.input}
      />
    </View>
  );
  return (
    <View style={{ gap: 17 }}>
      <View style={[t.row, { justifyContent: 'space-between' }]}>
        <Text style={t.sectionTitle}>Filtre</Text>
        <Action title="Resetează" secondary compact onPress={() => onChange({ ...emptyFilters })} />
      </View>
      {field('brand', category === 'tools' ? 'Marcă sau model' : 'Marcă / model', 'Oricare')}
      <View style={t.divider} />
      <Text style={t.label}>Preț</Text>
      <View style={{ flexDirection: 'row', gap: 6 }}>
        {(['ALL', 'EUR', 'RON'] as const).map((value) => (
          <Action
            key={value}
            title={value === 'ALL' ? 'Toate' : value}
            secondary={filters.currency !== value}
            compact
            onPress={() => update('currency', value)}
            style={{ flex: 1, paddingHorizontal: 5 }}
          />
        ))}
      </View>
      <View style={t.row}>
        {field('minPrice', 'Preț minim', 'De la')}
        {field('maxPrice', 'Preț maxim', 'Până la')}
      </View>
      <Text style={[t.muted, { fontSize: 11 }]}>
        EUR și RON se păstrează separat, fără conversie automată.
      </Text>
      <View style={t.divider} />
      {field('location', 'Localitate', 'Ex. Brașov')}
      <Text style={[t.muted, { fontSize: 11 }]}>Filtrăm doar localitățile cunoscute.</Text>
      {category !== 'tools' && field('minYear', 'An minim', 'Ex. 2015')}
      {category === 'cars' && field('maxMileage', 'Kilometraj maxim', 'Ex. 150000')}
      {category === 'tractors' && field('maxHours', 'Ore maxime', 'Ex. 5000')}
      {category === 'tools' && (
        <View style={{ gap: 8 }}>
          <Text style={t.label}>Stare</Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
            {[
              ['ALL', 'Oricare'],
              ['NEW', 'Nou'],
              ['USED', 'Folosit'],
              ['LIKE_NEW', 'Ca nou'],
              ['FOR_PARTS', 'Piese'],
            ].map(([value, label]) => (
              <Action
                key={value}
                title={label!}
                secondary={filters.condition !== value}
                compact
                onPress={() => update('condition', value!)}
              />
            ))}
          </View>
        </View>
      )}
      <View style={t.divider} />
      <View>
        <Check
          label="Doar cu fotografii"
          value={filters.onlyPhotos}
          onChange={(value) => update('onlyPhotos', value)}
        />
        {!demo && (
          <Check
            label="Disponibilitate confirmată"
            value={filters.onlyVerified}
            onChange={(value) => update('onlyVerified', value)}
          />
        )}
        <Check
          label="Doar favoritele mele"
          value={filters.favoritesOnly}
          onChange={(value) => update('favoritesOnly', value)}
        />
      </View>
      {filtersError(filters) && (
        <Text accessibilityRole="alert" style={{ fontSize: 12, color: theme.red }}>
          {filtersError(filters)}
        </Text>
      )}
      <Text style={[t.muted, { fontSize: 11 }]}>Filtrarea este locală și nu consumă cereri de căutare.</Text>
    </View>
  );
}
