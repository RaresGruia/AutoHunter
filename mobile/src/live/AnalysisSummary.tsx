import { Text, View } from 'react-native';
import { amount } from './presentation';
import { theme, t } from './theme';

export interface AnalysisMetrics {
  dealScore: number | null;
  flipPotential?: number | null;
  overallRisk?: number | null;
  estimatedMarketEur: number | null;
  savingEur: number | null;
  discountPercent: number | null;
  confidence: number | null;
  comparableCount: number;
  reasons: string[];
  risks: string[];
}
/** Equivalent of the original price/Deal/Flip/risk presentation; calculations stay in the backend. */
export function AnalysisSummary({
  analysis: a,
  historical = false,
  compact = false,
}: {
  analysis: AnalysisMetrics;
  historical?: boolean;
  compact?: boolean;
}) {
  if (a.dealScore === null)
    return (
      <View style={{ gap: 6 }}>
        <Text style={t.label}>Date insuficiente</Text>
        {!compact &&
          a.reasons.map((reason) => (
            <Text key={reason} style={t.muted}>
              {reason}
            </Text>
          ))}
      </View>
    );
  const metrics: [string, string][] = [
    ['Mediană de piață', a.estimatedMarketEur === null ? 'Date insuficiente' : amount(a.estimatedMarketEur)],
    ['Diferență față de mediană', a.discountPercent === null ? 'Necunoscută' : `${a.discountPercent}%`],
    ['Deal Score', `${a.dealScore}/100`],
    ['Flip Potential', a.flipPotential == null ? 'Indisponibil' : `${a.flipPotential}/100`],
    ['Risc textual', a.overallRisk == null ? 'Indisponibil' : `${a.overallRisk}/100`],
  ];
  if (!compact)
    metrics.splice(2, 0, [
      'Economie înainte de costuri',
      a.savingEur === null ? 'Necunoscută' : amount(a.savingEur),
    ]);
  return (
    <View testID="analysis-summary" style={{ gap: compact ? 10 : 16 }}>
      <Text style={[t.label, { color: theme.green }]}>
        {historical ? 'Analiză DEMO salvată' : 'Analiza AutoHunter'}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {metrics.map(([label, value]) => (
          <View key={label} style={{ flexBasis: '44%', flexGrow: 1, minWidth: 100, gap: 4 }}>
            <Text style={[t.muted, { fontSize: compact ? 11 : 12 }]}>{label}</Text>
            <Text style={{ fontSize: compact ? 15 : 20, fontWeight: '700', color: theme.text }}>{value}</Text>
          </View>
        ))}
      </View>
      <Text style={[t.muted, { fontSize: 12 }]}>
        {a.comparableCount} comparabile · încredere {a.confidence ?? '—'}%
      </Text>
      {!compact && (
        <>
          <Text style={t.muted}>
            Mediana folosește prețuri cerute, nu tranzacții. Flip Potential este un indicator euristic, nu
            profit în EUR. Riscul provine din text, nu dintr-o inspecție tehnică.
          </Text>
          {a.reasons.map((reason, i) => (
            <Text key={'reason' + i} style={t.body}>
              • {reason}
            </Text>
          ))}
          {a.risks.map((risk, i) => (
            <Text key={'risk' + i} style={[t.muted, { color: theme.amber }]}>
              • {risk}
            </Text>
          ))}
        </>
      )}
    </View>
  );
}
