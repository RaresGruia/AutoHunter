export type PageLoader = (url: URL) => Promise<string>;
import { runtimeMode } from '../../config/runtimeMode.js';

export const loadPublicOlxPage: PageLoader = async url => {
  if (runtimeMode() === 'DEMO') throw new Error('DEMO_NETWORK_DISABLED: public sources are disabled.');
  const response = await fetch(url, {
    signal: AbortSignal.timeout(20000),
    redirect: 'manual',
    headers: { Accept: 'text/html', 'User-Agent': 'AutoHunter/0.1 (personal, on-demand search)' },
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`OLX HTTP ${response.status}. Căutarea a fost oprită; fără retry sau ocolirea protecțiilor.`);
  }
  if (!response.headers.get('content-type')?.includes('text/html')) {
    await response.body?.cancel();
    throw new Error('OLX nu a returnat o pagină HTML.');
  }
  if (!response.body) throw new Error('Răspuns OLX gol.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let bytes = 0;
  let html = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 12 * 1024 * 1024) {
        await reader.cancel();
        throw new Error('Pagina OLX depășește limita de 12 MB.');
      }
      html += decoder.decode(value, { stream: true });
    }
    return html + decoder.decode();
  } finally { reader.releaseLock(); }
};
