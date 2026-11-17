import type { SearchSettings } from '../models/SearchSettings.js';
import type { CarSearchRequest, CarSearchResponse, SearchEngine } from './types.js';
import { serializeSearch } from './serializeSearch.js';
import { CategoryJobs } from './categoryJobs.js';

/** Cars compatibility facade over the shared category job lifecycle. */
export class SearchJobs extends CategoryJobs<CarSearchRequest, SearchSettings, CarSearchResponse> {
  constructor(search: SearchEngine, logError: (error: unknown) => void = () => {}) {
    super(async (settings, request, startedAt) => {
      const started = performance.now();
      return serializeSearch(await search(settings), request, startedAt, Math.round(performance.now() - started));
    }, logError);
  }
}
