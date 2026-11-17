import { defaultSearchSettings } from '../config/searchSettings.js';
import { OlxSourceAdapter } from '../sources/olx/OlxSourceAdapter.js';
import { searchCars } from '../services/searchService.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('npm run search                  Offline legacy analysis on synthetic fixtures\nnpm run search -- --debug        Detailed fixture diagnostics\nLIVE discovery is available through the Brave Search API in the app.');
    return;
  }
  if (args.some(arg => !['--fixture', '--live', '--debug'].includes(arg)) || (args.includes('--fixture') && args.includes('--live'))) {
    throw new Error('Argumente invalide. Folosește --help, --live, --fixture sau --debug.');
  }
  if (args.includes('--live')) throw new Error('SOURCE_AUTHORIZATION_REQUIRED: legacy scraping is disabled; use Brave discovery in the app.');
  const mode = 'fixture';
  const settings = defaultSearchSettings;
  console.log('AutoHunter | DEMO / FIXTURE — DATE SINTETICE');
  console.log(`${settings.location} + ${settings.radiusKm} km | ${settings.minPriceEur}–${settings.maxPriceEur} EUR | an ≥ ${settings.minYear} | km ≤ ${settings.maxMileageKm}\n`);
  const debug = args.includes('--debug');
  const search = await searchCars(settings, [new OlxSourceAdapter({ mode })], debug ? { onProgress: console.log } : {});
  for (const source of search.sources) for (const warning of source.warnings) console.log(`Info: ${warning}`);
  console.log(`\n${search.fetchedCount} anunțuri unice; ${search.excludedHighRisk} excluse pentru risc mare; ${search.excludedByFilters} excluse de filtre.`);
  console.log(`${search.eligibleCount} eligibile; ${search.analyzedCount} analizate; ${search.market.used}/${search.market.budget} căutări de piață.`);
  console.log(`${search.results.filter(row => row.estimate.comparableCount >= 5).length} rezultate cu ≥5 comparabile; ${search.results.filter(row => row.estimate.estimatedMarketPrice !== null).length} cu estimare de piață.`);
  const verification = search.verification;
  console.log(`DETAIL VERIFICATION: ${verification.requested}/${verification.budget} requests; ${verification.succeeded} verified; ${verification.failed} failed; ${verification.notRequested} not requested`);
  console.log(`VERIFIED FINDINGS: ${verification.dataConflicts} data conflicts; ${verification.cosmeticWarnings} cosmetic; ${verification.mechanicalOrAccidentWarnings} mechanical/accident; ${verification.legalWarnings} legal`);
  console.log(`${search.needsManualVerification.length} necesită verificare manuală; ${search.excludedAfterVerification.length} excluse după detalii.`);
  if (verification.stoppedReason) console.log(`DETAIL REQUESTS STOPPED: ${verification.stoppedReason}`);
  if (search.market.skippedGroups.length) console.log(`Buget epuizat; fără căutare națională pentru: ${search.market.skippedGroups.join(', ')}`);
  if (debug) {
    console.log('\nCOMPARABLE SEARCHES:');
    for (const entry of search.market.searches) {
      console.log(`${entry.group} -> ${entry.fetched} fetched (${entry.mode})`);
      for (const warning of entry.warnings) console.log(`  ${warning}`);
    }
    console.log(`CACHE: ${search.market.searches.length} market searches; ${search.market.cacheHits} cache hits`);
    console.log(`REQUEST BUDGET: ${search.market.used}/${search.market.budget} used\n`);
  }
  console.log('Risc 0 = fără indicii textuale detectate; starea tehnică nu este verificată.\n');
  if (!search.results.length) console.log('Niciun anunț eligibil în această pagină.');
  for (const [heading, entries] of [
    ['REZULTATE PRINCIPALE', search.results],
    ['NEEDS MANUAL VERIFICATION / NECESITĂ VERIFICARE', search.needsManualVerification],
    ['EXCLUSE DUPĂ VERIFICARE: RISC GRAV', search.excludedAfterVerification],
  ] as const) {
    if (!entries.length && heading.startsWith('EXCLUSE')) continue;
    console.log(`\n${heading}`);
    if (!entries.length) console.log('Niciun anunț în această secțiune.');
    for (const [index, result] of entries.entries()) {
    const { listing: car, estimate, risk } = result;
    console.log(`${index + 1}. ${car.title}`);
    console.log(`   ${car.year} | ${car.mileageKm} km | Identity: ${car.make ?? '?'} ${car.model ?? '?'} (${car.identityConfidence ?? 0}/100)`);
    console.log(`   Price: ${car.priceEur} EUR`);
    console.log(`   ${estimate.estimatedMarketPrice === null ? 'Market: insufficient data' : `Market median: ${estimate.estimatedMarketPrice} EUR (estimare orientativă)`}`);
    console.log(`   Discount: ${estimate.discountPercent === null ? 'necunoscut' : `${estimate.discountPercent}%`}`);
    console.log(`   Potential saving: ${estimate.absoluteSavingEur === null ? 'necunoscut' : `${estimate.absoluteSavingEur} EUR`}`);
    console.log(`   Deal Score: ${result.dealScore}/100 | Risk: ${risk.riskScore}/100`);
    console.log(`   Car Quality: ${result.carQualityScore}/100 | Opportunity: ${result.opportunityScore}/100 | ${result.classification}`);
    console.log(`   Market data: ${estimate.marketDataFreshness} | ${estimate.matchQuality} | Similarity: ${estimate.comparableSimilarityAverage ?? '?'} | Fetched: ${estimate.marketFetchedAt ?? '?'}`);
    console.log(`   Flip Potential: ${result.flipPotentialScore}/100 (fără estimarea costurilor de reparație)`);
    console.log(`   Verification: ${result.verificationStatus} | Data quality: ${result.dataQualityScore}/100`);
    console.log(`   Risk: Mechanical ${risk.mechanicalRisk} | Accident ${risk.accidentRisk} | Cosmetic ${risk.cosmeticRisk} | Legal ${risk.legalRisk} | Price ${risk.priceRisk} | Data ${risk.dataRisk}`);
    console.log(`   Registration: ${car.registrationStatus ?? 'UNKNOWN'}`);
    console.log(`   Location: ${car.locationText}`);
    console.log(`   Distance: ${result.distanceKm === null ? 'necunoscută — raza nu poate fi verificată' : `${result.distanceKm.toFixed(1)} km`}`);
    console.log(`   Comparables: ${estimate.comparableCount} | Confidence: ${estimate.confidenceScore}/100${estimate.confidenceScore < 40 ? ' — încredere scăzută' : ''}`);
    console.log(`   Match level: ${estimate.comparableLevel ?? 'none'}`);
    console.log('   GOOD:');
    for (const reason of result.positiveReasons) console.log(`   + ${reason}`);
    console.log('   WARNINGS:');
    for (const warning of result.warnings) console.log(`   - ${warning}`);
    for (const claim of result.sellerClaims) console.log(`   Seller claim: "${claim}" — afirmație neverificată`);
    console.log(`   URL: ${car.url}\n`);
    if (debug) {
      console.log(`   Preliminary Deal Score: ${result.preliminary.dealScore}; final: ${result.dealScore}`);
      console.log(`   Details: ${car.engineCapacityCc ?? '?'} cm³; ${car.horsepower ?? '?'} CP; ${car.bodyType ?? '?'}; ${car.fuel ?? '?'}; ${car.transmission ?? '?'}`);
      console.log(`   Seller: ${car.sellerType ?? '?'}; images: ${car.imageUrls.length}; published: ${car.publishedAt ?? '?'}; updated: ${car.updatedAt ?? '?'}`);
      for (const level of estimate.diagnostics) console.log(`   Level ${level.level}: ${level.matches} matches; ${level.retained} retained; ${level.outliersRemoved} outliers removed`);
      console.log(`   Selected Level ${estimate.comparableLevel ?? 'none'}; Median: ${estimate.estimatedMarketPrice ?? 'insufficient data'}\n`);
    }
    }
  }
}

main().catch((error: unknown) => {
  console.error(`Căutarea a eșuat: ${error instanceof Error ? error.message : String(error)}`);
  console.error('Nu s-au substituit date mock. Pentru demo offline: npm run search -- --fixture');
  process.exitCode = 1;
});
