// Exactly one controlled search, no server, no retries. Network timeouts also exist per page.
import { writeFile, mkdir } from 'node:fs/promises';
import { searchCars } from '../dist/src/services/searchService.js';
import { OlxSourceAdapter } from '../dist/src/sources/olx/OlxSourceAdapter.js';
import { defaultSearchSettings } from '../dist/src/config/searchSettings.js';
import { serializeSearch } from '../dist/src/api/serializeSearch.js';

await mkdir('validation', { recursive: true });
const startedAt = new Date().toISOString();
const started = Date.now();
const adapter = new OlxSourceAdapter({ mode: 'live' });
const watchdog = setTimeout(() => {
  console.error('LIVE_TIMEOUT: stopped after 150 seconds; no further attempts.');
  process.exit(124);
}, 150_000);
try {
  const result = await searchCars(defaultSearchSettings, [adapter], { onProgress: console.log });
  const response = serializeSearch(result, { ...defaultSearchSettings, limit: 30 }, startedAt, Date.now() - started);
  const counts = Object.fromEntries(['GREAT_DEAL', 'GOOD_DEAL', 'INTERESTING_CAR', 'FAIR', 'POOR_VALUE', 'NEEDS_VERIFICATION']
    .map(type => [type, response.results.filter(car => car.classification === type).length]));
  const report = { startedAt, durationMs: Date.now() - started, status: adapter.accessBlocked ? 'PARTIAL_ACCESS_DENIED' : 'COMPLETED',
    localFetched: result.fetchedCount, returned: response.results.length, metrics: result.requestMetrics,
    marketEstimates: response.results.filter(car => car.price.estimatedMarketEur !== null).length,
    classifications: counts, manualVerification: response.needsManualVerification.length,
    top10: response.results.slice(0, 10).map(car => ({ title: car.title, price: car.price, scores: car.scores, classification: car.classification, url: car.url })) };
  await writeFile('validation/cars-v2-live-response.json', JSON.stringify(response, null, 2));
  await writeFile('validation/cars-v2-live.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  const report = { startedAt, durationMs: Date.now() - started, status: adapter.accessBlocked ? 'OLX_ACCESS_DENIED' : 'SOURCE_UNAVAILABLE',
    error: String(error), metrics: adapter.metrics, totalOlxRequests: adapter.metrics.localNetworkRequests + adapter.metrics.freshMarketRequests + adapter.metrics.detailRequests,
    localFetched: 0, returned: 0, marketEstimates: 0, top10: [] };
  await writeFile('validation/cars-v2-live.json', JSON.stringify(report, null, 2));
  console.error(JSON.stringify(report, null, 2)); process.exitCode = 1;
} finally { clearTimeout(watchdog); }
