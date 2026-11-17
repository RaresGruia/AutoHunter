import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { DisplayOffer } from './offers';
import { isDemo } from './offers';
import { Action, IconButton } from './controls';
import { OfferMedia, openOriginal } from './OfferMedia';
import {
  amount,
  availabilityText,
  indexed,
  priceOf,
  publisherName,
  shortTitle,
  valueOf,
} from './presentation';
import { theme, t } from './theme';
import { AnalysisSummary } from './AnalysisSummary';

const date = (value: string | null) => (value ? new Date(value).toLocaleString('ro-RO') : 'Neconfirmată');
const labels: Record<string, string> = {
  year: 'An',
  manufacturingYear: 'An fabricație',
  mileageKm: 'Kilometraj',
  operatingHours: 'Ore de funcționare',
  horsepower: 'Putere (CP)',
  location: 'Localitate',
  fuel: 'Combustibil',
  engine: 'Motor',
  engineCapacityCc: 'Cilindree (cm³)',
  transmission: 'Transmisie',
  drivetrain: 'Tracțiune',
  condition: 'Stare',
  powerSource: 'Alimentare',
  voltageV: 'Tensiune (V)',
  powerWatts: 'Putere (W)',
  batteryAh: 'Baterie (Ah)',
  description: 'Descriere',
  batteriesIncluded: 'Baterii incluse',
  chargerIncluded: 'Încărcător inclus',
  subcategory: 'Tip produs',
};
const translations: Record<string, string> = {
  NEW: 'Nou',
  USED: 'Folosit',
  LIKE_NEW: 'Ca nou',
  FOR_PARTS: 'Pentru piese',
  BATTERY: 'Acumulator',
  ELECTRIC: 'Electric',
  PETROL: 'Benzină',
};
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ minWidth: 125, flexGrow: 1, flexBasis: '42%', gap: 4, paddingVertical: 8 }}>
      <Text style={t.muted}>{label}</Text>
      <Text style={[t.body, { fontWeight: '600' }]}>{value}</Text>
    </View>
  );
}
export function OfferDetails({
  row,
  wide,
  favorite,
  onFavorite,
  onBack,
  onReport,
  reporting,
}: {
  row: DisplayOffer;
  wide: boolean;
  favorite: boolean;
  onFavorite: () => void;
  onBack: () => void;
  onReport: () => void;
  reporting: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const price = priceOf(row),
    analysis = row.analysis;
  const hints = indexed(row),
    facts = Object.entries(row.attributes).filter(
      ([key, value]) => value !== null && value !== '' && key !== 'description',
    );
  return (
    <View style={{ gap: 22 }}>
      <View style={[t.row, { justifyContent: 'space-between' }]}>
        <Action title="Înapoi la rezultate" icon="‹" secondary compact onPress={onBack} />
        <IconButton
          label={favorite ? 'Elimină de la favorite' : 'Salvează la favorite'}
          symbol={favorite ? '♥' : '♡'}
          active={favorite}
          onPress={onFavorite}
        />
      </View>
      <View style={{ flexDirection: wide ? 'row' : 'column', gap: 28, alignItems: 'flex-start' }}>
        <View
          style={{ flex: wide ? 1.55 : undefined, width: wide ? undefined : '100%', minWidth: 0, gap: 22 }}
        >
          <OfferMedia row={row} large />
          <View style={t.panel}>
            <Text style={t.sectionTitle}>Caracteristici</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', columnGap: 16 }}>
              {facts.map(([key, value]) => (
                <Fact
                  key={key}
                  label={labels[key] ?? key}
                  value={
                    typeof value === 'boolean'
                      ? value
                        ? 'Da'
                        : 'Nu'
                      : (translations[String(value)] ?? String(value))
                  }
                />
              ))}
              {(['year', 'mileageKm', 'operatingHours'] as const)
                .filter((key) => hints[key] && row.attributes[key] === undefined)
                .map((key) => (
                  <Fact
                    key={key}
                    label={(labels[key] ?? key) + ' · din index'}
                    value={String(valueOf(row, key))}
                  />
                ))}
            </View>
            {!facts.length && !Object.keys(hints).some((key) => key !== 'price') && (
              <Text style={t.muted}>Caracteristicile nu sunt confirmate. Consultă anunțul original.</Text>
            )}
            {!!Object.keys(hints).length && !isDemo(row) && (
              <Text style={[t.muted, { fontSize: 12 }]}>
                Datele marcate „din index” pot fi neactualizate. Verifică informațiile la sursă.
              </Text>
            )}
            {typeof row.attributes.description === 'string' && (
              <Text style={t.body}>{row.attributes.description}</Text>
            )}
          </View>
          <View style={t.panel}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Proveniență și datele din index"
              accessibilityState={{ expanded }}
              onPress={() => setExpanded(!expanded)}
              style={[t.row, { justifyContent: 'space-between', minHeight: 42 }]}
            >
              <Text style={t.sectionTitle}>Proveniență și verificare</Text>
              <Text style={{ color: theme.green }}>{expanded ? '−' : '+'}</Text>
            </Pressable>
            <Text style={t.muted}>
              {isDemo(row)
                ? 'Exemplu local cu date fictive'
                : row.origin === 'WEB_INDEX'
                  ? 'Descoperit prin Brave Search · ' + date(row.discoveredAt)
                  : 'Date adăugate cu permisiune · ' + date(row.discoveredAt)}
            </Text>
            {!isDemo(row) && (
              <Text style={t.muted}>Ultima verificare a ofertei: {date(row.lastVerifiedAt)}</Text>
            )}
            {expanded && (
              <View style={{ gap: 12 }}>
                <Text style={t.label}>Titlu original</Text>
                <Text selectable style={t.body}>
                  {row.title}
                </Text>
                {!!row.snippet && (
                  <>
                    <Text style={t.label}>Fragment din index · posibil vechi</Text>
                    <Text selectable style={t.muted}>
                      {row.snippet}
                    </Text>
                  </>
                )}
                {Object.values(hints).map((hint, index) => (
                  <Text key={index} style={t.muted}>
                    Extras din {hint.field === 'title' ? 'titlu' : 'fragment'}: {hint.evidence}
                  </Text>
                ))}
                {!isDemo(row) && (
                  <Text selectable style={[t.muted, { fontSize: 12 }]}>
                    {row.originalUrl}
                  </Text>
                )}
                {row.availabilityReport && (
                  <Text style={t.muted}>
                    Raportat de utilizator la {date(row.availabilityReport.reportedAt)}.{' '}
                    {row.availabilityReport.note}
                  </Text>
                )}
                {row.imageUrls.length > 0 && (
                  <Text style={t.muted}>Drept de afișare: {row.imageRights.evidence}</Text>
                )}
              </View>
            )}
          </View>
        </View>
        <View style={{ flex: wide ? 1 : undefined, width: wide ? undefined : '100%', minWidth: 0, gap: 18 }}>
          <View style={t.panel}>
            <View style={[t.row, { justifyContent: 'space-between' }]}>
              <Text style={[t.label, { color: theme.green }]}>{publisherName(row.publisher)}</Text>
              <Text style={{ fontSize: 10, fontWeight: '700', color: theme.green }}>
                {isDemo(row) ? 'DEMO' : 'LIVE'}
              </Text>
            </View>
            <Text accessibilityRole="header" style={[t.heading, { fontSize: wide ? 27 : 24 }]}>
              {shortTitle(row)}
            </Text>
            <Text style={{ fontSize: 32, fontWeight: '700', letterSpacing: -1, color: theme.text }}>
              {price ? amount(price.amount, price.currency) : 'Preț la sursă'}
            </Text>
            {price?.origin === 'INDEX' && (
              <Text style={{ fontSize: 12, lineHeight: 18, color: theme.amber }}>
                Preț din index · verifică valoarea actuală la sursă.
              </Text>
            )}
            <View style={{ backgroundColor: theme.background, padding: 12, borderRadius: 10, gap: 5 }}>
              <Text style={[t.label, { fontSize: 12 }]}>{availabilityText(row)}</Text>
              <Text style={[t.muted, { fontSize: 12 }]}>
                {isDemo(row)
                  ? 'Date fictive. Fotografiile reprezintă modelul, nu un produs oferit spre vânzare.'
                  : row.availability === 'USER_CONFIRMED'
                    ? 'Verificat manual de utilizator.'
                    : 'Prezența în rezultatele căutării nu confirmă că oferta mai este activă.'}
              </Text>
            </View>
            {!isDemo(row) && (
              <>
                <Action
                  title="Deschide anunțul original"
                  icon="↗"
                  onPress={() => {
                    void openOriginal(row.originalUrl);
                  }}
                />
                <Action
                  title={row.availabilityReport ? 'Raportat indisponibil' : 'Raportează anunț indisponibil'}
                  secondary
                  disabled={reporting || !!row.availabilityReport}
                  onPress={onReport}
                />
              </>
            )}
          </View>
          {!isDemo(row) && (
            <View style={t.panel}>
              <AnalysisSummary analysis={analysis} />
              {!!analysis.comparableUrls.length && (
                <View style={{ gap: 8 }}>
                  <Text style={t.label}>Oferte candidate pentru comparație</Text>
                  {analysis.comparableUrls.map((url, i) => (
                    <Action
                      key={url}
                      title={'Consultă oferta ' + (i + 1) + ' ↗'}
                      secondary
                      compact
                      onPress={() => {
                        void openOriginal(url);
                      }}
                    />
                  ))}
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
