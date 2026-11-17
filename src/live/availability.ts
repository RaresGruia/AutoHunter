import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { canonicalListingUrl } from '../discovery/normalize.js';
import { publicListingUrl } from './brave.js';

export interface AvailabilityReport {
  originalUrl: string;
  status: 'EXPIRED' | 'UNAVAILABLE' | 'UNVERIFIED';
  reportedAt: string;
  method: 'USER_REPORT';
  note: string;
}
export class AvailabilityReports {
  private queue: Promise<unknown> = Promise.resolve();
  constructor(private readonly file = resolve('data/imports/availability-reports.json')) {}
  async list(): Promise<AvailabilityReport[]> {
    try {
      const rows: unknown = JSON.parse(await readFile(this.file, 'utf8'));
      if (!Array.isArray(rows)) throw Error('INVALID_AVAILABILITY_STORE');
      return rows as AvailabilityReport[];
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
      throw error;
    }
  }
  async save(value: unknown, reportedAt = new Date().toISOString()): Promise<AvailabilityReport> {
    const input = value as Record<string, unknown> | null;
    const url = typeof input?.originalUrl === 'string' ? publicListingUrl(input.originalUrl) : null;
    if (!url || !['EXPIRED', 'UNAVAILABLE', 'UNVERIFIED'].includes(String(input?.status)))
      throw Error('INVALID_AVAILABILITY_REPORT');
    const originalUrl = canonicalListingUrl(url)!;
    const row: AvailabilityReport = {
      originalUrl,
      status: input!.status as AvailabilityReport['status'],
      reportedAt,
      method: 'USER_REPORT',
      note: typeof input!.note === 'string' ? input!.note.trim().slice(0, 500) : '',
    };
    const operation = this.queue.then(async () => {
      const rows = (await this.list()).filter((item) => item.originalUrl !== originalUrl);
      if (rows.length >= 2000) throw Error('AVAILABILITY_REPORT_LIMIT');
      await mkdir(dirname(this.file), { recursive: true });
      const temporary = this.file + '.' + randomUUID() + '.tmp';
      await writeFile(temporary, JSON.stringify([...rows, row], null, 2) + '\n', { flag: 'wx' });
      await rename(temporary, this.file);
    });
    this.queue = operation.catch(() => {});
    await operation;
    return row;
  }
}
