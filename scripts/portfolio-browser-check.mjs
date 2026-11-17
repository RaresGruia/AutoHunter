import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile, writeFile, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseEnv } from 'node:util';
import { chromium } from 'playwright';
import { buildServer } from '../dist/src/api/server.js';
import { LiveService } from '../dist/src/live/service.js';
import { BraveSearchAdapter } from '../dist/src/live/brave.js';
import { AvailabilityReports } from '../dist/src/live/availability.js';
import { ManualOfferStore } from '../dist/src/live/manual.js';

// Real local DEMO assets + injected provider responses. No real provider evidence is claimed.
const screenshots = process.argv.includes('--screenshots');
if (process.argv.slice(2).some((value) => value !== '--screenshots'))
  throw Error('Usage: npm run test:browser -- [--screenshots]');
const output = path.resolve('validation/portfolio'),
  pictures = path.resolve('docs/screenshots');
await mkdir(output, { recursive: true });
if (screenshots) await mkdir(pictures, { recursive: true });
const temporary = await mkdtemp(path.join(tmpdir(), 'autohunter-portfolio-'));
let local = {};
try {
  local = parseEnv(await readFile('mobile/.env', 'utf8'));
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
const apiOrigin = new URL(
  process.env.EXPO_PUBLIC_API_BASE_URL ?? local.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3000',
).origin;
const config = { enabled: true, key: 'TEST-ONLY-NOT-A-REAL-API-KEY', count: 20 };
let providerCalls = 0,
  providerFailure = false,
  backendExternalCalls = 0,
  clock = Date.now();
const first = 'https://www.autovit.ro/autoturisme/anunt/portfolio-test-ID1.html';
const expired = 'https://www.autovit.ro/autoturisme/anunt/portfolio-expired-ID3.html';
const reports = new AvailabilityReports(path.join(temporary, 'reports.json'));
await reports.save({ originalUrl: expired, status: 'EXPIRED', note: 'TEST ONLY: simulated expiry' });
const store = new ManualOfferStore(path.join(temporary, 'manual.json'));
const adapter = new BraveSearchAdapter(
  config,
  async () => {
    providerCalls++;
    if (providerFailure) return new Response('', { status: 503 });
    return new Response(
      JSON.stringify({
        web: {
          results: [
            {
              url: first,
              title: 'Utilizat Dacia Duster 2021 - 9500 EUR, 100000 km',
              description: 'TEST ONLY: simulated provider response',
            },
            {
              url: first + '?utm_source=duplicate',
              title: 'Utilizat Dacia Duster 2021 - 9500 EUR, 100000 km',
              description: 'TEST ONLY duplicate',
            },
            {
              url: 'https://www.olx.ro/d/oferta/portfolio-test-ID2.html',
              title: 'TEST ONLY Dacia Duster an 2019, 8000 EUR, 150000 km',
            },
            { url: expired, title: 'TEST ONLY expired listing' },
          ],
        },
      }),
    );
  },
  () => clock,
);
const service = new LiveService({ config: async () => config, adapter, reports, store, now: () => clock });
const app = await buildServer({ mode: 'DEMO', liveService: service });
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => {
  backendExternalCalls++;
  throw Error('Unexpected backend network request');
};
const dist = path.resolve('mobile/dist-demo-images');
assert.ok(
  existsSync(path.join(dist, 'index.html')),
  'Run npm run build and npm run web:export before browser tests.',
);
const server = http.createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://localhost').pathname,
      file = path.resolve(dist, '.' + (pathname === '/' ? '/index.html' : pathname));
    assert.ok(file.startsWith(dist + path.sep));
    const bytes = await readFile(file);
    res.writeHead(200, {
      'Content-Type': file.endsWith('.html')
        ? 'text/html'
        : file.endsWith('.js')
          ? 'text/javascript'
          : 'application/octet-stream',
    });
    res.end(bytes);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const origin = 'http://127.0.0.1:' + server.address().port;
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executable =
  process.env.AUTOHUNTER_BROWSER_PATH ||
  (process.platform === 'win32' && existsSync(edge) ? edge : undefined);
const browser = await chromium.launch({
  headless: true,
  ...(executable ? { executablePath: executable } : {}),
});
const report = {
  kind: 'LOCAL_DEMO_AND_INJECTED_BRAVE_NOT_LIVE',
  completed: false,
  viewports: [],
  errors: [],
  unexpectedRequests: [],
  backendExternalCalls: 0,
};
const watchdog = setTimeout(() => {
  console.error('Portfolio browser verification timed out');
  process.exit(124);
}, 180000);
async function shot(page, name) {
  if (screenshots) await page.screenshot({ path: path.join(pictures, name), animations: 'disabled' });
}
async function noOverflow(page) {
  assert.ok(
    await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    'Unexpected horizontal overflow',
  );
}
try {
  for (const width of [1440, 1920, 390, 320]) {
    const context = await browser.newContext({
      viewport: { width, height: width < 600 ? 844 : 1080 },
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
    });
    let holdSearch = false,
      release;
    let paused;
    const requestPaused = new Promise((resolve) => {
      paused = resolve;
    });
    await context.route('**/*', async (route) => {
      const request = route.request(),
        url = new URL(request.url());
      if (url.origin === origin) return route.continue();
      if (url.origin !== apiOrigin) {
        report.unexpectedRequests.push(url.origin);
        return route.abort();
      }
      if (holdSearch && url.pathname === '/api/live/search')
        await new Promise((resolve) => {
          release = resolve;
          paused();
        });
      const reply = await app.inject({
        method: request.method(),
        url: url.pathname + url.search,
        headers: {
          origin: 'http://localhost:8082',
          ...(request.postData() ? { 'content-type': 'application/json' } : {}),
        },
        ...(request.postData() ? { payload: request.postData() } : {}),
      });
      return route.fulfill({
        status: reply.statusCode,
        body: reply.rawPayload,
        headers: {
          'content-type': String(reply.headers['content-type'] ?? 'application/json'),
          'access-control-allow-origin': '*',
        },
      });
    });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    page.on('pageerror', (error) => report.errors.push(error.message));
    await page.goto(origin);
    await page.getByTestId('results-grid').waitFor();
    assert.equal(await page.locator('[data-testid^="listing-card-"]').count(), 5);
    await page.waitForFunction(
      () =>
        document.images.length >= 5 &&
        [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    );
    const positions = await page
      .getByTestId('results-grid')
      .locator(':scope > div')
      .evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().y));
    const columns = positions.filter((y) => y === positions[0]).length;
    assert.equal(columns, width === 1920 ? 4 : width === 1440 ? 3 : 1);
    await noOverflow(page);
    assert.equal(await page.getByText(/Deal Score|Oportunitate estimată/).count(), 0);
    assert.equal(await page.getByRole('tab', { name: /Tractoare|Scule/ }).count(), 0);
    if (width === 1440) await shot(page, 'demo-desktop.png');
    if (width === 390) await shot(page, 'demo-mobile.png');
    if (width < 1050) await page.getByRole('button', { name: 'Filtre', exact: true }).click();
    await page.getByRole('textbox', { name: 'Preț maxim', exact: true }).fill('6500');
    if (width < 1050) await page.getByRole('button', { name: /^Arată \d+ rezultate/ }).click();
    assert.equal(await page.locator('[data-testid^="listing-card-"]').count(), 3);
    if (width < 1050) await page.getByRole('button', { name: /^Filtre/ }).click();
    await page.getByRole('button', { name: 'Resetează', exact: true }).click();
    if (width < 1050) await page.getByRole('button', { name: /^Arată \d+ rezultate/ }).click();
    await page.getByRole('button', { name: 'Salvează la favorite: Dacia Duster', exact: true }).click();
    await page.getByRole('button', { name: 'Vezi detalii: Dacia Duster', exact: true }).click();
    await page.getByRole('button', { name: 'Fotografia 2 din 2', exact: true }).click();
    await page.getByText('Fotografia 2 din 2', { exact: true }).waitFor();
    assert.ok(
      await page
        .locator('img')
        .evaluateAll((nodes) =>
          nodes.some((node) => node.src.endsWith('/02.jpg') && node.complete && node.naturalWidth > 0),
        ),
    );
    assert.equal(
      await page.getByRole('button', { name: 'Deschide anunțul original', exact: true }).count(),
      0,
    );
    if (width === 1440) await shot(page, 'demo-details.png');
    await noOverflow(page);
    await page.reload();
    await page.getByTestId('results-grid').waitFor();
    await page.getByRole('button', { name: 'Favorite', exact: true }).click();
    await page.getByRole('heading', { name: 'Favoritele tale · DEMO', exact: true }).waitFor();
    assert.equal(await page.locator('[data-testid^="listing-card-"]').count(), 1);
    await page.getByRole('button', { name: 'Analiză DEMO salvată', exact: true }).click();
    await page.getByTestId('history-card-demo-duster-good').waitFor();
    assert.equal(await page.locator('[data-testid^="history-card-"]').count(), 10);
    assert.equal(await page.locator('[data-testid^="listing-card-"]').count(), 0);
    await page.getByText(/DATE SINTETICE/).waitFor();
    await page.waitForFunction(
      () =>
        document.images.length > 0 &&
        [...document.images].every((image) => image.complete && image.naturalWidth > 0),
    );
    if (width === 1440) await shot(page, 'synthetic-analysis-desktop.png');
    await page.getByRole('button', { name: 'Analiză DEMO: Dacia Duster', exact: true }).click();
    await page.getByTestId('historical-details').waitFor();
    for (const text of [
      'Deal Score',
      'Flip Potential',
      'Risc textual',
      '40/100',
      '54/100',
      '28/100',
      '17.4%',
    ])
      await page.getByText(text, { exact: true }).waitFor();
    await page.getByText(/9 comparabile · încredere 81%/).waitFor();
    assert.equal(
      await page.getByRole('button', { name: 'Deschide linkul original istoric', exact: true }).count(),
      0,
    );
    assert.ok(
      await page
        .locator('img')
        .evaluateAll((nodes) =>
          nodes.some(
            (node) =>
              node.src.includes('/demo-images/cars/demo-duster-good/') &&
              node.complete &&
              node.naturalWidth > 0,
          ),
        ),
    );
    await noOverflow(page);
    if (width === 1440) await shot(page, 'synthetic-analysis-details.png');
    if (width === 390) {
      await shot(page, 'synthetic-analysis-mobile.png');
      await page.getByTestId('analysis-summary').scrollIntoViewIfNeeded();
      await shot(page, 'synthetic-analysis-mobile-scores.png');
    }
    await page.getByRole('button', { name: 'Mod LIVE', exact: true }).click();
    await page.getByRole('textbox', { name: 'Căutare LIVE' }).waitFor();
    assert.equal(await page.getByRole('img', { name: /Fotografie DEMO/ }).count(), 0);
    assert.equal(await page.getByTestId('historical-analysis').count(), 0);
    await page.getByRole('button', { name: 'Favorite', exact: true }).click();
    await page.getByRole('heading', { name: 'Păstrează mașinile interesante', exact: true }).waitFor();
    await page.getByRole('button', { name: 'Descoperă', exact: true }).click();
    await page.getByRole('textbox', { name: 'Căutare LIVE' }).fill('Dacia Duster');
    holdSearch = true;
    await page.getByRole('button', { name: 'Caută LIVE', exact: true }).click();
    await page.getByRole('progressbar').waitFor();
    await requestPaused;
    assert.equal(typeof release, 'function');
    holdSearch = false;
    release();
    await page.getByTestId('results-grid').waitFor();
    assert.equal(
      await page.locator('[data-testid^="listing-card-"]').count(),
      2,
      'Canonical duplicates and expired records are excluded',
    );
    const callsBeforeFilters = providerCalls;
    if (width < 1050) await page.getByRole('button', { name: 'Filtre', exact: true }).click();
    await page.getByRole('checkbox', { name: 'Doar cu fotografii', exact: true }).click();
    if (width < 1050) await page.getByRole('button', { name: /^Arată \d+ rezultate/ }).click();
    await page.getByRole('heading', { name: 'Nicio ofertă cu aceste filtre', exact: true }).waitFor();
    assert.equal(providerCalls, callsBeforeFilters);
    await page.getByRole('button', { name: 'Resetează filtrele', exact: true }).click();
    await page
      .getByRole('button', { name: /^Salvează la favorite:/ })
      .first()
      .click();
    await page
      .getByRole('button', { name: /^Vezi detalii:/ })
      .first()
      .click();
    await page.getByRole('button', { name: 'Deschide anunțul original', exact: true }).waitFor();
    assert.equal(await page.getByRole('img').count(), 0);
    await page.getByRole('button', { name: 'Raportează anunț indisponibil', exact: true }).click();
    await page.getByText('Anunțul raportat a fost ascuns din rezultate.', { exact: true }).waitFor();
    assert.equal(await page.locator('[data-testid^="listing-card-"]').count(), 1);
    await page.getByRole('button', { name: 'Anulează', exact: true }).click();
    await page.getByText(/Raportarea a fost anulată/).waitFor();
    assert.equal(await page.locator('[data-testid^="listing-card-"]').count(), 2);
    await page.reload();
    await page.getByTestId('results-grid').waitFor();
    await page.getByRole('button', { name: 'Mod LIVE', exact: true }).click();
    await page.getByRole('button', { name: 'Favorite', exact: true }).click();
    await page.getByRole('button', { name: 'Deschide originalul ↗', exact: true }).waitFor();
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('autohunter:bookmarks:v1')));
    assert.deepEqual(Object.keys(stored[0]).sort(), ['category', 'savedAt', 'url']);
    await page.getByRole('button', { name: 'Descoperă', exact: true }).click();
    await page.getByRole('textbox', { name: 'Căutare LIVE' }).fill('TEST ERROR ' + width);
    providerFailure = true;
    // Advance the injected clock instead of sleeping through the adapter's interval.
    clock += 1200;
    await page.getByRole('button', { name: 'Caută LIVE', exact: true }).click();
    await page.getByRole('button', { name: 'Încearcă din nou', exact: true }).waitFor();
    providerFailure = false;
    clock += 1200;
    await page.getByRole('button', { name: 'Încearcă din nou', exact: true }).click();
    await page.getByTestId('results-grid').waitFor();
    await page.getByRole('button', { name: 'Despre', exact: true }).click();
    await page.getByRole('heading', { name: 'Despre AutoHunter', exact: true }).waitFor();
    assert.equal(await page.getByRole('textbox').count(), 1, 'No technical import forms');
    await page.getByRole('button', { name: 'Mod DEMO', exact: true }).click();
    await page.getByTestId('results-grid').waitFor();
    // Existing decoded pictures can remain cached; a fresh page/context checks errors below.
    await noOverflow(page);
    report.viewports.push({
      width,
      columns,
      demoPhotos: 5,
      gallery: true,
      historicalSnapshot: true,
      historicalScoresAndLicensedPhoto: true,
      favoritesPersist: true,
      modeSeparation: true,
      canonicalDedup: true,
      expiredExcluded: true,
      reportUndo: true,
      localFilters: true,
      errorRetry: true,
      noOverflow: true,
    });
    await context.close();
  }
  // New browser context ensures that broken files do not reuse a successful image cache.
  const broken = await browser.newContext();
  await broken.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.origin === apiOrigin) {
      if (url.pathname.startsWith('/demo-images/')) return route.fulfill({ status: 404, body: '' });
      const reply = await app.inject(url.pathname);
      return route.fulfill({
        status: reply.statusCode,
        body: reply.rawPayload,
        headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' },
      });
    }
    report.unexpectedRequests.push(url.origin);
    return route.abort();
  });
  const brokenPage = await broken.newPage();
  await brokenPage.goto(origin);
  await brokenPage.getByText('Imagine DEMO indisponibilă', { exact: true }).first().waitFor();
  await broken.close();
  assert.equal(providerCalls > 0, true);
  assert.equal(backendExternalCalls, 0);
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.unexpectedRequests, []);
  report.backendExternalCalls = backendExternalCalls;
  report.completed = true;
  console.log(JSON.stringify(report));
} finally {
  clearTimeout(watchdog);
  globalThis.fetch = originalFetch;
  await browser.close();
  await app.close();
  await new Promise((resolve) => server.close(resolve));
  await writeFile(path.join(output, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
  assert.equal(path.dirname(path.resolve(temporary)), path.resolve(tmpdir()));
  assert.ok(path.basename(temporary).startsWith('autohunter-portfolio-'));
  await rm(temporary, { recursive: true, force: true });
}
