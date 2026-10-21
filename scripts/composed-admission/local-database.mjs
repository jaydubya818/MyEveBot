/** Validate authority-bearing URL fields, never a substring in credentials or query. */
export function requireLocalPostgres(value) {
  let url;
  try { url = new URL(value); } catch { throw Error('Explicit local PostgreSQL fixture required'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)
    || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.search || url.hash || !url.pathname || url.pathname === '/')
    throw Error('Explicit local PostgreSQL fixture required');
  return url.href;
}
