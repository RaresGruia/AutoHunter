import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { listingImagePlan } from '../src/listingImages';
import { mapApiResponse, ApiClientError } from '../src/apiClient';
import { mapTractorResponse } from '../src/tractors/api';
import { mapToolResponse } from '../src/tools/api';
import { analyzeTractor } from '../../src/tractors/analysis';
import { analyzeTool } from '../../src/tools/analysis';
const base = 'http://192.168.1.5:3000';

for (const category of ['cars', 'tractors', 'tools'] as const) {
  test(category + ': DEMO resolves own photos against the API and rejects remote images', () => {
    const prefix = '/demo-images/' + category + '/listing-1/';
    assert.deepEqual(
      listingImagePlan(
        {
          category,
          mode: 'DEMO',
          listingId: 'listing-1',
          imageUrl: prefix + '01.jpg',
          imageUrls: [prefix + '02.jpg', 'https://example.org/photo.jpg'],
          thumbnailUrl: prefix + 'thumbnail.jpg',
        },
        base,
      ),
      {
        demo: true,
        uris: [base + prefix + '01.jpg', base + prefix + '02.jpg'],
        thumbnailUri: base + prefix + 'thumbnail.jpg',
      },
    );
  });
}
test('Synthetic listings never load remote photographs with a stale or absent mode', () => {
  for (const mode of [null, undefined, 'LIVE'] as const) {
    assert.deepEqual(
      listingImagePlan(
        { category: 'tools', mode, synthetic: true, imageUrls: ['https://example.org/a.jpg'] },
        base,
      ),
      { demo: true, uris: [], thumbnailUri: null },
    );
    assert.deepEqual(
      listingImagePlan(
        {
          category: 'cars',
          mode,
          listingUrl: 'https://example.invalid/item',
          imageUrl: 'https://example.org/a.jpg',
        },
        base,
      ),
      { demo: true, uris: [], thumbnailUri: null },
    );
  }
});
test('Missing images, unknown mode or missing API base yield no fabricated image', () => {
  assert.deepEqual(listingImagePlan({ category: 'cars', mode: 'LIVE' }), {
    demo: false,
    uris: [],
    thumbnailUri: null,
  });
  assert.deepEqual(
    listingImagePlan({ category: 'cars', mode: null, imageUrls: ['https://example.org/a.png'] }),
    { demo: false, uris: [], thumbnailUri: null },
  );
  assert.deepEqual(
    listingImagePlan({
      category: 'cars',
      mode: 'DEMO',
      listingId: 'one',
      imageUrl: '/demo-images/cars/one/01.jpg',
    }),
    { demo: true, uris: [], thumbnailUri: null },
  );
});
test('LIVE photograph contract preserves order, deduplicates and rejects unsafe schemes', () => {
  const uris = ['https://example.org/primary.jpg', 'https://example.org/second.jpg'];
  assert.deepEqual(
    listingImagePlan({
      category: 'cars',
      mode: 'LIVE',
      imageUrl: uris[0],
      imageUrls: [
        uris[1],
        uris[0],
        '',
        'http://example.org/insecure.jpg',
        'file:///secret.jpg',
        'data:image/png,abc',
        'javascript:alert(1)',
        'https://name:pass@example.org/a.jpg',
      ],
      thumbnailUrl: 'https://example.org/thumb.jpg',
    }),
    { demo: false, uris, thumbnailUri: 'https://example.org/thumb.jpg' },
  );
});
test('DEMO paths cannot cross categories, listings, origins or directories', () => {
  const paths = [
    '/demo-images/tools/one/01.jpg',
    '/demo-images/cars/two/01.jpg',
    '//example.org/a.jpg',
    '/demo-images/cars/one/../../secret.jpg',
    '/demo-images/cars/one/01.jpg?redirect=elsewhere',
    'https://192.168.1.5:3000/demo-images/cars/one/01.jpg',
  ];
  assert.deepEqual(
    listingImagePlan({ category: 'cars', mode: 'DEMO', listingId: 'one', imageUrls: paths }, base),
    { demo: true, uris: [], thumbnailUri: null },
  );
});
test('Car API mapping preserves all image fields and supports an older single-photo payload', () => {
  const input = JSON.parse(readFileSync(new URL('../../fixtures/synthetic-analysis-snapshot.json', import.meta.url), 'utf8'));
  const row = input.results[0];
  row.imageUrl = '/demo-images/cars/' + row.id + '/01.jpg';
  row.imageUrls = [row.imageUrl, '/demo-images/cars/' + row.id + '/02.jpg'];
  row.thumbnailUrl = '/demo-images/cars/' + row.id + '/thumbnail.jpg';
  const mapped = mapApiResponse(input).results[0]!;
  assert.equal(mapped.imageUrl, row.imageUrl);
  assert.deepEqual(mapped.imageUrls, row.imageUrls);
  assert.equal(mapped.thumbnailUrl, row.thumbnailUrl);
  delete row.imageUrls;
  delete row.thumbnailUrl;
  assert.equal(mapApiResponse(input).results[0]!.imageUrl, row.imageUrl);
  row.imageUrls = [42];
  assert.throws(() => mapApiResponse(input), ApiClientError);
});

for (const category of ['cars', 'tractors', 'tools'] as const) {
  test(category + ': API mapping retains representative notice and all photo credits', () => {
    const fixture = JSON.parse(
      readFileSync(
        new URL(
          '../../' + (category === 'cars' ? 'fixtures/synthetic-analysis-snapshot.json' : `fixtures/${category}.json`),
          import.meta.url,
        ),
        'utf8',
      ),
    );
    const input =
      category === 'cars'
        ? fixture
        : {
            meta: {
              mode: 'DEMO',
              category,
              location: 'Deva',
              radiusKm: 100,
              localFetched: 1,
              eligible: 1,
              returnedResults: 1,
              limit: 30,
              warnings: [],
            },
            results: [
              category === 'tractors'
                ? analyzeTractor(fixture.local[0], fixture.market, 0)
                : analyzeTool(fixture.local[0], fixture.market, 0),
            ],
          };
    const row = category === 'cars' ? input.results[0] : input.results[0].listing;
    const prefix = `/demo-images/${category}/${row.id}/`;
    row.imagePresentation = 'REPRESENTATIVE_MODEL';
    row.imageUrls = [prefix + '01.jpg', prefix + '02.jpg'];
    row.imageUrl = row.imageUrls[0];
    row.imageAttributions = row.imageUrls.map((imageUrl: string, index: number) => ({
      imageUrl,
      title: 'Photo ' + index,
      author: 'Photographer ' + index,
      sourceUrl: 'https://commons.wikimedia.org/wiki/File:Test.jpg',
      license: 'CC BY-SA 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
      changes: 'Resized',
    }));
    const mapped =
      category === 'cars'
        ? mapApiResponse(input).results[0]!
        : category === 'tractors'
          ? mapTractorResponse(input).results[0]!.listing
          : mapToolResponse(input).results[0]!.listing;
    assert.equal(mapped.imagePresentation, 'REPRESENTATIVE_MODEL');
    assert.deepEqual(mapped.imageAttributions, row.imageAttributions);
    assert.equal(
      listingImagePlan({ ...mapped, category, listingId: row.id, mode: 'DEMO' }, base).uris.length,
      2,
    );
  });
}
