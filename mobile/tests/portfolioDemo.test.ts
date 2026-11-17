import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { demoVehicles } from '../../src/demo/vehicles';
import { readLiveResponse } from '../src/live/api';
import { readDemoResponse, readDemoFavorites, isDemo } from '../src/live/offers';
import { exactPhotoUrls, availabilityText, selectOffers, emptyFilters } from '../src/live/presentation';
const loadDemo = () =>
  demoVehicles(
    fileURLToPath(new URL('../../fixtures/demo-images.json', import.meta.url)),
    fileURLToPath(new URL('../../fixtures/olx-search.html', import.meta.url)),
  );

test('DEMO response cannot be accepted as LIVE and has no original-product photo claims', async () => {
  const response = readDemoResponse(await loadDemo());
  assert.throws(() => readLiveResponse(response), /INVALID_LIVE_RESPONSE/);
  for (const row of response.results) {
    assert.equal(isDemo(row), true);
    assert.match(availabilityText(row), /DEMO/);
    assert.ok(exactPhotoUrls(row).every((url) => url.startsWith('/demo-images/cars/')));
  }
  const live = { ...response, meta: { ...response.meta, mode: 'LIVE' } };
  assert.throws(() => readDemoResponse(live), /INVALID_DEMO_RESPONSE/);
});
test('Local sample cars support existing filtering, sorting and a separate favorite ID set', async () => {
  const rows = (await loadDemo()).results;
  const duster = selectOffers(
    rows,
    { ...emptyFilters, brand: 'Dacia', onlyPhotos: true },
    'price-asc',
    new Set(),
  );
  assert.equal(duster.length, 1);
  assert.equal(duster[0]!.model, 'Duster');
  const sorted = selectOffers(rows, emptyFilters, 'price-asc', new Set());
  assert.ok(sorted.every((row, i) => i === 0 || row.priceEur! >= sorted[i - 1]!.priceEur!));
  assert.deepEqual(
    readDemoFavorites(JSON.stringify([rows[0]!.id, rows[0]!.id, 'https://www.olx.ro/example', 'unsafe/id'])),
    [rows[0]!.id],
  );
  assert.deepEqual(readDemoFavorites('bad'), []);
});
