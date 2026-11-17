/** Node-free URL rules shared with Expo. Never fetches a page. */
export function canonicalListingUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()])
      if (/^utm_/i.test(key) || ['fbclid', 'gclid'].includes(key)) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.href;
  } catch {
    return null;
  }
}
export function publicListingUrl(value: string): string | null {
  try {
    const u = new URL(value),
      host = u.hostname.toLowerCase();
    if (
      u.protocol !== 'https:' ||
      u.username ||
      u.password ||
      u.port ||
      !host.includes('.') ||
      /^[\d.]+$/.test(host) ||
      host.includes(':') ||
      /(?:^|\.)(?:localhost|invalid|local|test|example)$/.test(host)
    )
      return null;
    u.hash = '';
    return u.href;
  } catch {
    return null;
  }
}
