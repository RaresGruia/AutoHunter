import type { CarListing } from '../../models/CarListing.js';
import { parseOlxAd, readOlxState, record } from './olxParser.js';

export function parseOlxDetailHtml(html: string, expected: Pick<CarListing, 'id' | 'url'>,
  options: { fixture?: boolean } = {}): CarListing {
  const state = readOlxState(html);
  const detail = parseOlxAd(record(record(state).ad).ad, options.fixture ?? false, true);
  if (!detail) throw new Error('Pagina individuală OLX nu conține un anunț activ cu preț EUR verificabil.');
  const expectedUrl = new URL(expected.url);
  expectedUrl.search = '';
  expectedUrl.hash = '';
  if (detail.id !== expected.id || detail.url !== expectedUrl.href) throw new Error('Pagina individuală nu corespunde anunțului solicitat.');
  return detail;
}
