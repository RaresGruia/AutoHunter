import { ApiClientError } from './apiClient';
import { clearCurrentSearchId, loadCurrentSearchId, saveCurrentSearchId, type JobStorage } from './searchStorage';
import type { CarSearchRequest, CarSearchResponse, CategoryJobResponse } from './types';

export interface JobApi<Request = CarSearchRequest, Result = CarSearchResponse> {
  search(settings: Request): Promise<CategoryJobResponse<Result>>;
  getJob(id: string): Promise<CategoryJobResponse<Result>>;
  current(): Promise<CategoryJobResponse<Result> | null>;
}
export interface SearchSessionState<Result = CarSearchResponse> {
  phase: 'IDLE' | 'CONNECTING' | 'RUNNING' | 'RECONNECTING' | 'PAUSED' | 'COMPLETED' | 'FAILED' | 'ERROR';
  searchId: string | null;
  startedAt: string | null;
  response: Result | null;
  error: ApiClientError | null;
  storageWarning: string | null;
}
export const POLL_INTERVAL_MS = 2000;
export const RETRY_INTERVAL_MS = 5000;
export const MAX_NETWORK_FAILURES = 5;

/** A single serial session, independent of React rendering; lifecycle and storage are injectable. */
export class SearchSession<Request = CarSearchRequest, Result = CarSearchResponse> {
  state: SearchSessionState<Result> = { phase: 'IDLE', searchId: null, startedAt: null, response: null, error: null, storageWarning: null };
  private foreground = false;
  private disposed = false;
  private operation: Promise<void> | null = null;
  private resumeRequested = false;
  private cancelTimer: (() => void) | null = null;
  private failures = 0;
  private handledId: string | null = null;
  private nextCheckAt = 0;
  private readonly now: () => number;
  private readonly schedule: (callback: () => void, ms: number) => () => void;

  constructor(private readonly api: JobApi<Request, Result>, private readonly storage: JobStorage,
    private readonly onChange: (state: SearchSessionState<Result>) => void,
    options: { now?: () => number; schedule?: (callback: () => void, ms: number) => () => void } = {}) {
    this.now = options.now ?? Date.now;
    this.schedule = options.schedule ?? ((callback, ms) => { const timer = setTimeout(callback, ms); return () => clearTimeout(timer); });
  }
  private emit(change: Partial<SearchSessionState<Result>>): void {
    this.state = { ...this.state, ...change };
    if (!this.disposed) this.onChange(this.state);
  }
  private clearTimer(): void { this.cancelTimer?.(); this.cancelTimer = null; }
  pause(): void { this.foreground = false; this.resumeRequested = false; this.clearTimer(); }
  dispose(): void { this.pause(); this.disposed = true; }

  async resume(): Promise<void> {
    if (this.disposed) return;
    this.foreground = true; this.failures = 0; this.clearTimer();
    if (this.operation) { this.resumeRequested = true; await this.operation; return; }
    this.emit({ phase: 'CONNECTING', error: null });
    if (this.now() < this.nextCheckAt) { this.later(this.nextCheckAt - this.now()); return; }
    await this.run(() => this.recover());
  }
  async start(settings: Request): Promise<void> {
    if (this.disposed || !this.foreground || this.operation) return;
    if (this.state.searchId || ['RECONNECTING', 'PAUSED', 'RUNNING'].includes(this.state.phase)) { await this.resume(); return; }
    this.clearTimer(); this.failures = 0;
    this.emit({ phase: 'CONNECTING', error: null, response: null });
    await this.run(async () => {
      // Reconcile before POST, including a job accepted while the previous client lost its response.
      const current = await this.api.current();
      if (current?.status === 'RUNNING') { await this.accept(current); return; }
      if (!this.foreground || this.disposed) return;
      try { await this.accept(await this.api.search(settings)); }
      catch (error: unknown) {
        if (error instanceof ApiClientError && error.code === 'SEARCH_IN_PROGRESS' && error.searchId) {
          await this.remember(error.searchId);
          this.emit({ phase: 'RUNNING', error: null });
          this.later(POLL_INTERVAL_MS);
        } else throw error;
      }
    });
  }
  private async run(task: () => Promise<void>): Promise<void> {
    if (this.operation || this.disposed) return;
    const work = async () => {
      try { await task(); this.failures = 0; }
      catch (error: unknown) {
        const failure = error instanceof ApiClientError ? error : new ApiClientError('NETWORK');
        if (['CONFIG', 'INVALID_REQUEST', 'LOCATION_COORDINATES_REQUIRED', 'INVALID_RESPONSE', 'CATEGORY_NOT_AVAILABLE_IN_LIVE_MODE'].includes(failure.code)) {
          this.emit({ phase: 'ERROR', error: failure });
        } else {
          this.failures++;
          this.emit({ phase: this.failures >= MAX_NETWORK_FAILURES ? 'PAUSED' : 'RECONNECTING', error: failure });
          if (this.failures < MAX_NETWORK_FAILURES) this.later(RETRY_INTERVAL_MS);
        }
      }
    };
    this.operation = work();
    try { await this.operation; }
    finally {
      this.operation = null;
      if (this.resumeRequested && this.foreground && !this.disposed) { this.resumeRequested = false; await this.resume(); }
    }
  }
  private later(ms: number): void {
    this.clearTimer();
    if (!this.foreground || this.disposed) return;
    this.cancelTimer = this.schedule(() => {
      this.cancelTimer = null;
      if (this.foreground && !this.disposed) void this.run(() => this.recover());
    }, ms);
  }
  private async remember(id: string): Promise<void> {
    this.emit({ searchId: id });
    try {
      if (this.disposed) {
        const current = await loadCurrentSearchId(this.storage);
        if (current && current !== id) return;
      }
      await saveCurrentSearchId(this.storage, id);
    }
    catch { this.emit({ storageWarning: 'ID-ul căutării nu a putut fi salvat. Îl putem recupera de pe PC la redeschidere.' }); }
  }
  private async forget(): Promise<void> {
    try { await clearCurrentSearchId(this.storage); }
    catch { this.emit({ storageWarning: 'Memoria telefonului nu a putut fi actualizată. Statusul va fi verificat la revenire.' }); }
    this.emit({ searchId: null });
  }
  private async recover(): Promise<void> {
    if (!this.foreground || this.disposed) return;
    this.nextCheckAt = this.now() + POLL_INTERVAL_MS;
    let savedId: string | null = null;
    try { savedId = await loadCurrentSearchId(this.storage); }
    catch { this.emit({ storageWarning: 'ID-ul salvat nu a putut fi citit. Verificăm căutarea de pe PC.' }); }
    const id = this.state.searchId ?? savedId;
    let job: CategoryJobResponse<Result> | null;
    if (id) {
      this.emit({ searchId: id });
      try { job = await this.api.getJob(id); }
      catch (error: unknown) {
        if (!(error instanceof ApiClientError) || error.code !== 'SEARCH_NOT_FOUND') throw error;
        await this.forget();
        job = await this.api.current();
        if (!job) { this.emit({ phase: 'ERROR', error: new ApiClientError('SEARCH_NOT_FOUND') }); return; }
      }
    } else job = await this.api.current();
    if (!job) { this.emit({ phase: 'IDLE', searchId: null, error: null }); return; }
    await this.accept(job);
  }
  private async accept(job: CategoryJobResponse<Result>): Promise<void> {
    // Persist even if the POST completed after AppState changed or React unmounted.
    if (job.status === 'RUNNING') {
      await this.remember(job.searchId);
      this.emit({ phase: 'RUNNING', startedAt: job.startedAt, error: null });
      this.nextCheckAt = this.now() + POLL_INTERVAL_MS;
      this.later(POLL_INTERVAL_MS);
      return;
    }
    this.clearTimer();
    // A replaced React session must not erase a newer session's persisted job.
    if (this.disposed) return;
    await this.forget();
    if (this.handledId === job.searchId) { this.emit({ phase: 'IDLE', error: null }); return; }
    this.handledId = job.searchId;
    if (job.status === 'COMPLETED') this.emit({ phase: 'COMPLETED', startedAt: job.startedAt, response: job.response, error: null });
    else this.emit({ phase: 'FAILED', startedAt: job.startedAt, response: null, error: new ApiClientError(job.error.code) });
  }
}
