import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildServer } from '../src/api/server.js';
import { demoVehicles } from '../src/demo/vehicles.js';

test('Portfolio DEMO reuses five existing car fixtures with licensed local photos and no scores', async () => {
  const response = await demoVehicles();
  assert.equal(response.meta.mode, 'DEMO');
  assert.equal(response.results.length, 5);
  assert.ok(
    response.results.some((row) => row.imageUrls.length > 1),
    'A gallery is available',
  );
  for (const row of response.results) {
    assert.equal(row.mode, 'DEMO');
    assert.equal(row.origin, 'DEMO');
    assert.equal(row.availability, 'DEMO');
    assert.equal(row.lastVerifiedAt, null);
    assert.equal(row.analysis.dealScore, null);
    assert.ok(row.imageUrls.length > 0);
    assert.equal(row.imagePresentation, 'REPRESENTATIVE_MODEL');
    assert.equal(row.imageRights.status, 'LICENSED');
    for (const image of row.imageUrls) {
      assert.ok(image.startsWith('/demo-images/cars/' + row.id + '/'));
      assert.ok(
        row.imageAttributions?.some(
          (credit) => credit.imageUrl === image && credit.author && credit.licenseUrl,
        ),
      );
    }
  }
});
test('DEMO API serves only marked sample data and local image bytes, with no external fetch', async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    throw Error('External network forbidden');
  };
  const app = await buildServer({ mode: 'DEMO' });
  try {
    const result = await app.inject('/api/demo/cars');
    assert.equal(result.statusCode, 200);
    assert.equal(result.json().meta.mode, 'DEMO');
    const path = result.json().results[0].imageUrls[0];
    const photo = await app.inject(path);
    assert.equal(photo.statusCode, 200);
    assert.match(photo.headers['content-type'] ?? '', /image\/jpeg/);
    assert.ok(photo.rawPayload.length > 1000);
    assert.equal(calls, 0);
  } finally {
    await app.close();
    globalThis.fetch = original;
  }
});
