/** Expo development on the same PC must not depend on yesterday's Wi-Fi address. */
const localHost = (host: string) =>
  ['localhost', '127.0.0.1', '[::1]'].includes(host) ||
  /^10\.\d+\.\d+\.\d+$/.test(host) ||
  /^192\.168\.\d+\.\d+$/.test(host) ||
  /^172\.(?:1[6-9]|2\d|3[01])\.\d+\.\d+$/.test(host);
const browserUrl = () => (typeof window === 'undefined' ? undefined : window.location?.href);
export function resolveApiBaseUrl(configured: string | undefined, pageHref?: string): string | undefined {
  try {
    const base = new URL(configured ?? ''),
      page = new URL(pageHref ?? '');
    if (
      page.protocol === 'http:' &&
      ['8081', '8082'].includes(page.port) &&
      localHost(page.hostname) &&
      base.protocol === 'http:' &&
      base.port === '3000' &&
      localHost(base.hostname) &&
      !base.username &&
      !base.password
    ) {
      base.hostname = page.hostname;
      return base.href.replace(/\/$/, '');
    }
  } catch {
    /* Native apps and hosted deployments use their explicit configuration. */
  }
  return configured;
}
export function browserLoopbackAllowed(base: URL, pageHref = browserUrl()): boolean {
  try {
    const page = new URL(pageHref ?? '');
    return (
      page.protocol === 'http:' &&
      ['8081', '8082'].includes(page.port) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(page.hostname) &&
      base.hostname === page.hostname &&
      base.port === '3000'
    );
  } catch {
    return false;
  }
}
export const apiBaseUrl = () => resolveApiBaseUrl(process.env.EXPO_PUBLIC_API_BASE_URL, browserUrl());
