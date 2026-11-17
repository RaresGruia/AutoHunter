import type { LiveResponse } from '../../../src/live/types';
import { apiBaseUrl } from '../apiBaseUrl';
export function readLiveResponse(value: unknown): LiveResponse {
  const v = value as LiveResponse;
  if (!v || v.meta?.mode !== 'LIVE' || !Array.isArray(v.results) || !Array.isArray(v.meta.warnings))
    throw Error('INVALID_LIVE_RESPONSE');
  for (const row of v.results) {
    let url: URL;
    try {
      url = new URL(row.originalUrl);
    } catch {
      throw Error('INVALID_LIVE_RESPONSE');
    }
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.hostname.endsWith('.invalid') ||
      !['WEB_INDEX', 'MANUAL'].includes(row.origin) ||
      typeof row.title !== 'string' ||
      !row.analysis ||
      !Array.isArray(row.imageUrls)
    )
      throw Error('INVALID_LIVE_RESPONSE');
    if (row.analysis.status === 'INSUFFICIENT_DATA' && row.analysis.dealScore !== null)
      throw Error('INVALID_LIVE_SCORE');
  }
  return v;
}
export async function liveRequest(path: string, body?: unknown): Promise<unknown> {
  const base = apiBaseUrl();
  if (!base) throw Error('Configurează adresa API în EXPO_PUBLIC_API_BASE_URL.');
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 20000);
  try {
    const response = await fetch(new URL(path, base).href, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: controller.signal,
    });
    const json = await response.json();
    if (!response.ok) throw Error(json?.error?.code ?? 'LIVE_REQUEST_FAILED');
    return json;
  } finally {
    clearTimeout(timer);
  }
}
