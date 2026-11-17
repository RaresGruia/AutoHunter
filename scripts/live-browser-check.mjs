// Explicit real-provider smoke test. Never used by credential-free CI.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { chromium } from 'playwright';
const base = 'http://localhost:8082/',
  api = process.env.AUTOHUNTER_API_URL || 'http://localhost:3000';
const output = 'validation/portfolio';
await mkdir(output, { recursive: true });
const status = await (await fetch(api + '/api/live/status')).json();
assert.equal(status.configured, true, 'Brave is not configured. This is not a successful LIVE verification.');
const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const executable =
  process.env.AUTOHUNTER_BROWSER_PATH ||
  (process.platform === 'win32' && existsSync(edge) ? edge : undefined);
const browser = await chromium.launch({
  headless: true,
  ...(executable ? { executablePath: executable } : {}),
});
const report = { kind: 'REAL_BRAVE_API', completed: false, searches: [], errors: [], unexpectedRequests: [] };
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({
      viewport: { width, height: width < 600 ? 844 : 1000 },
      serviceWorkers: 'block',
    });
    await context.route('**/*', (route) => {
      const url = new URL(route.request().url());
      if ([new URL(base).origin, new URL(api).origin].includes(url.origin)) return route.continue();
      report.unexpectedRequests.push(url.origin);
      return route.abort();
    });
    const page = await context.newPage();
    page.setDefaultTimeout(20000);
    page.on('pageerror', (error) => report.errors.push(error.message));
    await page.goto(base, { timeout: 60000, waitUntil: 'domcontentloaded' });
    await page.getByTestId('results-grid').waitFor();
    await page.getByRole('button', { name: 'Mod LIVE', exact: true }).click();
    await page.getByRole('textbox', { name: 'Căutare LIVE' }).fill('Dacia Duster');
    const pending = page.waitForResponse(
      (response) => response.url().endsWith('/api/live/search') && response.request().method() === 'POST',
    );
    await page.getByRole('button', { name: 'Caută LIVE', exact: true }).click();
    const response = await pending,
      data = await response.json();
    assert.equal(response.status(), 200);
    assert.equal(data.meta.mode, 'LIVE');
    assert.ok(
      ['OK', 'CACHED'].includes(data.meta.searchStatus),
      'Provider failure: ' + data.meta.searchStatus,
    );
    await page.getByRole('heading', { name: 'Rezultate pentru „Dacia Duster”', exact: true }).waitFor();
    assert.equal(await page.getByTestId('historical-analysis').count(), 0);
    if (data.results.length && data.meta.scored === 0)
      await page.getByText('Date insuficiente', { exact: true }).first().waitFor();
    assert.equal(await page.getByRole('img', { name: /Fotografie DEMO/ }).count(), 0);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    for (const row of data.results) {
      assert.ok(row.originalUrl.startsWith('https://'));
      assert.ok(!['EXPIRED', 'UNAVAILABLE'].includes(row.availability));
      if (row.origin === 'WEB_INDEX') {
        assert.equal(row.availability, 'UNVERIFIED');
        assert.equal(row.lastVerifiedAt, null);
        assert.deepEqual(row.imageUrls, []);
        assert.equal(row.analysis.dealScore, null);
      }
    }
    if (data.results.length) {
      await page
        .getByRole('button', { name: /^Vezi detalii:/ })
        .first()
        .click();
      await page.getByRole('button', { name: 'Deschide anunțul original', exact: true }).waitFor();
      await page.getByRole('button', { name: 'Înapoi la rezultate', exact: true }).click();
    }
    report.searches.push({
      viewport: width,
      query: 'Dacia Duster',
      results: data.results.length,
      confirmed: data.results.filter((row) =>
        ['ACTIVE_VERIFIED', 'USER_CONFIRMED'].includes(row.availability),
      ).length,
      photos: data.results.filter((row) => row.imageUrls.length > 0).length,
      scored: data.meta.scored,
      excludedUnavailable: data.meta.excludedUnavailable ?? 0,
      providerStatus: data.meta.searchStatus,
    });
    await page.getByRole('button', { name: 'Mod DEMO', exact: true }).click();
    await page.getByTestId('results-grid').waitFor();
    assert.equal(await page.locator('[data-testid^="listing-card-"]').count(), 5);
    await context.close();
  }
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.unexpectedRequests, []);
  report.completed = true;
  console.log(JSON.stringify(report));
} finally {
  await browser.close();
  await writeFile(output + '/live-browser.json', JSON.stringify(report, null, 2) + '\n');
}
