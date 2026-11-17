import type { HistoricalVehicle } from '../../../src/models/HistoricalAnalysis';
import type { AnalysisMetrics } from './AnalysisSummary';

export const historicalMetrics = ({ record: r }: HistoricalVehicle): AnalysisMetrics => ({
  dealScore: r.scores.deal,
  flipPotential: r.scores.flipPotential,
  overallRisk: r.scores.overallRisk,
  estimatedMarketEur: r.price.estimatedMarketEur,
  savingEur: r.price.potentialSavingEur,
  discountPercent: r.price.discountPercent,
  confidence: r.price.confidence,
  comparableCount: r.price.comparableCount,
  reasons: r.positiveReasons,
  risks: r.warnings,
});
