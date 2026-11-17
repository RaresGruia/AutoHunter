import { useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import type { HistoricalResponse, HistoricalVehicle } from '../../../src/models/HistoricalAnalysis';
import { readHistoricalResponse } from '../../../src/models/HistoricalAnalysis';
import { liveRequest } from './api';
import { Action, EmptyState } from './controls';
import { OfferMedia } from './OfferMedia';
import { AnalysisSummary } from './AnalysisSummary';
import { historicalMetrics as metrics } from './historicalPresentation';
import { amount, numberText } from './presentation';
import { theme, t } from './theme';

export function HistoricalAnalysisScreen({ width, onTop }: { width: number; onTop: () => void }) {
  const [response, setResponse] = useState<HistoricalResponse | null>(null),
    [error, setError] = useState(false),
    [busy, setBusy] = useState(true),
    [retry, setRetry] = useState(0),
    [selected, setSelected] = useState<HistoricalVehicle | null>(null);
  useEffect(() => {
    let active = true;
    setBusy(true);
    setError(false);
    void liveRequest('/api/history/cars')
      .then((data) => {
        if (active) setResponse(readHistoricalResponse(data));
      })
      .catch(() => {
        if (active) setError(true);
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  const wide = width >= 1050;
  const choose = (row: HistoricalVehicle | null) => {
    setSelected(row);
    onTop();
  };
  const photo = (row: HistoricalVehicle, large = false) => (
    <View style={{ gap: 10 }}>
      {row.illustration ? (
        <OfferMedia row={row.illustration} large={large} />
      ) : (
        <View style={{ padding: 22, backgroundColor: theme.background, borderRadius: 12 }}>
          <Text style={t.muted}>Nu există fotografie pentru acest exemplu sintetic.</Text>
        </View>
      )}
      {row.illustration && (
        <Text style={[t.muted, { fontSize: 12 }]}>
          Fotografie reprezentativă de model; datele și scorurile sunt sintetice.
        </Text>
      )}
    </View>
  );
  return (
    <View testID="historical-analysis" style={{ gap: 22 }}>
      <Text accessibilityRole="header" style={t.heading}>
        Analiză DEMO salvată
      </Text>
      <View style={[t.panel, { backgroundColor: '#FFF8E9', gap: 8 }]}>
        <Text style={[t.label, { color: theme.amber }]}>DEMO · DATE SINTETICE · NU SUNT OFERTE ACTUALE</Text>
        <Text style={t.body}>
          Prețurile și scorurile provin din fixture-uri sintetice, calculate offline de motorul AutoHunter. Nu
          sunt anunțuri reale și nu intră în căutarea sau comparabilele LIVE.
        </Text>
      </View>
      {busy ? (
        <ActivityIndicator accessibilityRole="progressbar" />
      ) : error ? (
        <EmptyState
          title="Analiza DEMO salvată nu poate fi încărcată"
          description="Verifică backend-ul și fixture-ul sintetic local."
          action={{ title: 'Reîncarcă analiza', onPress: () => setRetry((x) => x + 1) }}
        />
      ) : (
        response && (
          <>
            {selected ? (
              <>
                <Action title="Înapoi la analiza DEMO" secondary compact onPress={() => choose(null)} />
                <View
                  testID="historical-details"
                  style={{ flexDirection: wide ? 'row' : 'column', gap: 24, alignItems: 'flex-start' }}
                >
                  <View
                    style={{
                      width: wide ? undefined : '100%',
                      flex: wide ? 1.2 : undefined,
                      minWidth: 0,
                      gap: 20,
                    }}
                  >
                    {photo(selected, true)}
                    <View style={t.panel}>
                      <Text style={t.sectionTitle}>Caracteristici sintetice</Text>
                      <Text style={t.body}>
                        {selected.record.car.year ?? 'An necunoscut'} ·{' '}
                        {selected.record.car.mileageKm === null
                          ? 'Km necunoscuți'
                          : numberText(selected.record.car.mileageKm) + ' km'}{' '}
                        · {selected.record.car.fuel}
                      </Text>
                      <Text style={t.body}>
                        {selected.record.car.engine} · {selected.record.car.transmission} ·{' '}
                        {selected.record.location.text}
                      </Text>
                      <Text style={t.muted}>
                        Stare de test: {selected.record.verification.status}. Fixture-ul nu reprezintă o
                        verificare a unui anunț real.
                      </Text>
                    </View>
                  </View>
                  <View
                    style={{
                      width: wide ? undefined : '100%',
                      flex: wide ? 1 : undefined,
                      minWidth: 0,
                      gap: 18,
                    }}
                  >
                    <View style={t.panel}>
                      <Text accessibilityRole="header" style={t.sectionTitle}>
                        {selected.record.title}
                      </Text>
                      <Text style={{ fontSize: 29, fontWeight: '700', color: theme.text }}>
                        {amount(selected.record.price.askingEur)}
                      </Text>
                      <Text style={t.muted}>Preț sintetic DEMO · nu este ofertă</Text>
                    </View>
                    <View style={t.panel}>
                      <AnalysisSummary analysis={metrics(selected)} historical />
                    </View>
                    <View style={t.panel}>
                      <Text style={t.sectionTitle}>Riscuri textuale pe categorii</Text>
                      {Object.entries(selected.record.risks).map(([key, value]) => (
                        <Text key={key} style={t.body}>
                          {
                            (
                              {
                                mechanical: 'Mecanic',
                                accident: 'Accident',
                                cosmetic: 'Cosmetic',
                                legal: 'Juridic',
                                price: 'Preț',
                                data: 'Date',
                              } as Record<string, string>
                            )[key]
                          }
                          : {value}/100
                        </Text>
                      ))}
                      <Text style={t.muted}>
                        0 înseamnă lipsa indiciilor detectate în text, nu absența defectelor.
                      </Text>
                      <Text style={[t.muted, { fontSize: 12 }]}>
                        Sursă: {response.meta.sourceFile} · {response.meta.snapshotAt}
                      </Text>
                    </View>
                  </View>
                </View>
              </>
            ) : (
              <>
                <Text style={t.muted}>
                  {response.meta.localFetched} fixture-uri sintetice · {response.meta.eligible} eligibile ·{' '}
                  {response.meta.analyzed} analizate · {response.results.length} exemple salvate
                </Text>
                {[
                  ['Exemple de analiză', response.results],
                  ['Necesită verificare manuală', response.needsManualVerification],
                  ['Excluse după verificare', response.excludedAfterVerification],
                ].map(([label, items]) => {
                  const rows = items as HistoricalVehicle[];
                  return (
                    rows.length > 0 && (
                      <View key={String(label)} style={{ gap: 14 }}>
                        <Text style={t.sectionTitle}>{String(label)}</Text>
                        <View
                          testID={label === 'Exemple de analiză' ? 'history-grid' : undefined}
                          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 18 }}
                        >
                          {rows.map((row) => (
                            <View
                              key={row.record.id}
                              testID={'history-card-' + row.record.id}
                              style={[
                                t.panel,
                                {
                                  width: width < 600 ? '100%' : wide ? '31.8%' : '48%',
                                  minWidth: 0,
                                  padding: 16,
                                },
                              ]}
                            >
                              {photo(row)}
                              <Text accessibilityRole="header" style={t.sectionTitle}>
                                {row.record.car.make} {row.record.car.model}
                              </Text>
                              <Text numberOfLines={2} style={t.muted}>
                                {row.record.title}
                              </Text>
                              <Text style={{ fontSize: 23, fontWeight: '700', color: theme.text }}>
                                {amount(row.record.price.askingEur)}
                              </Text>
                              <Text style={[t.muted, { fontSize: 12 }]}>Preț sintetic · nu este ofertă</Text>
                              <AnalysisSummary analysis={metrics(row)} historical compact />
                              <Action
                                title={'Analiză DEMO: ' + row.record.car.make + ' ' + row.record.car.model}
                                secondary
                                onPress={() => choose(row)}
                              />
                            </View>
                          ))}
                        </View>
                      </View>
                    )
                  );
                })}
              </>
            )}
          </>
        )
      )}
    </View>
  );
}
