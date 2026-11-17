import { randomUUID } from 'node:crypto';
export type JobResponse<Result> =
  | { searchId: string; status: 'RUNNING'; startedAt: string }
  | { searchId: string; status: 'COMPLETED'; startedAt: string; completedAt: string; response: Result }
  | { searchId: string; status: 'FAILED'; startedAt: string; completedAt: string; error: { code: string; message: string } };

/** One active and one retained terminal job per category; no dependency on a client socket. */
export class CategoryJobs<Request, Settings, Result> {
  private active: JobResponse<Result> | null = null;
  private latest: JobResponse<Result> | null = null;
  constructor(private readonly execute: (settings: Settings, request: Request, startedAt: string) => Promise<Result>,
    private readonly logError: (error: unknown) => void = () => {}) {}
  current(): JobResponse<Result> | null { return this.active ?? this.latest; }
  get(id: string): JobResponse<Result> | null {
    return this.active?.searchId === id ? this.active : this.latest?.searchId === id ? this.latest : null;
  }
  start(request: Request, settings: Settings): { created: boolean; job: JobResponse<Result> } {
    if (this.active) return { created: false, job: this.active };
    const requestSnapshot = structuredClone(request), settingsSnapshot = structuredClone(settings);
    const job: JobResponse<Result> = { searchId: randomUUID(), status: 'RUNNING', startedAt: new Date().toISOString() };
    this.active = job;
    setImmediate(() => { void this.run(job, settingsSnapshot, requestSnapshot); });
    return { created: true, job };
  }
  private async run(job: JobResponse<Result>, settings: Settings, request: Request): Promise<void> {
    try {
      const response = await this.execute(settings, request, job.startedAt);
      this.latest = { ...job, status: 'COMPLETED', completedAt: new Date().toISOString(), response };
    } catch (error) {
      this.latest = { ...job, status: 'FAILED', completedAt: new Date().toISOString(),
        error: { code: 'SOURCE_UNAVAILABLE', message: 'Source could not be accessed.' } };
      try { this.logError(error); } catch { /* Logging cannot hold a job RUNNING. */ }
    } finally { this.active = null; }
  }
}
