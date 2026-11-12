/** Edge-safe portal-host helpers. No DB, no Node APIs. */

export function portalHostsFromEnv(raw = process.env.PORTAL_HOSTS): string[] {
  return String(raw || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .map(s => s.replace(/^https?:\/\//, ''))
    .map(s => s.replace(/\/.*$/, ''))
    .map(s => s.split(':')[0])
    .filter(Boolean);
}

export function requestHostname(host: string): string {
  return String(host || '').toLowerCase().split(':')[0];
}

export function isPortalHost(host: string, env = process.env.PORTAL_HOSTS): boolean {
  const h = requestHostname(host);
  if (!h) return false;
  return portalHostsFromEnv(env).includes(h);
}

function pathIs(pathname: string, base: string) {
  return pathname === base || pathname.startsWith(`${base}/`);
}

export function isPortalPublicPath(pathname: string): boolean {
  if (
    pathIs(pathname, '/merchant')
    || pathIs(pathname, '/api/merchant')
    || pathIs(pathname, '/portal')
    || pathIs(pathname, '/api/portal')
  ) return true;
  if (pathname.startsWith('/_next/')) return true;
  if (pathname.startsWith('/images/')) return true;
  if (pathname.startsWith('/favicon')) return true;
  if (/\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff2?)$/i.test(pathname)) return true;
  return false;
}
