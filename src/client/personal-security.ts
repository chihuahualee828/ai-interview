/** Only public browser keys are accepted. Legacy JWT keys must have the anon role. */
export function publicConfig(url: string | undefined, key: string | undefined) {
 if (!url || !key) return null;
 try {
  const target = new URL(url);
  if (target.protocol !== 'https:' || !target.hostname.endsWith('.supabase.co') || target.username || target.password || target.search || target.hash || target.pathname !== '/') return null;
  const anon = key.split('.').length === 3 && JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role === 'anon';
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key) && !anon) return null;
  return {url: target.origin, key};
 } catch { return null; }
}
export const basePath = (base: string) => `${base.replace(/\/$/, '')}/`;
export const returnKey = (base: string) => `recall-personal-return:${basePath(base)}`;
/** Restrict returns to question routes, retaining filters but never auth parameters. */
export function safeReturn(value: string | null, origin: string, base: string): string {
 const root = basePath(base);
 const fallback = `${root}en/questions/Q0001/`;
 if (!value || !value.startsWith('/') || value.startsWith('//') || /[\\\x00-\x20]/.test(value)) return fallback;
 try {
  const url = new URL(value, origin);
  if (url.origin !== origin || !url.pathname.startsWith(root)) return fallback;
  if (!/^(en|zh-TW|ja)\/questions\/Q\d{4,}\/$/.test(url.pathname.slice(root.length))) return fallback;
  const params = new URLSearchParams();
  for (const [key, val] of url.searchParams) if (['tag','match','company','search','ready','mode','seed','anchor'].includes(key)) params.append(key,val);
  return url.pathname + (params.size ? `?${params}` : '');
 } catch { return fallback; }
}
/** SDK session persistence must never retain the GitHub provider credentials. */
export function sessionStorageWithoutProviderTokens(storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>) {
 const clean = (value: string) => {
  const parsed = JSON.parse(value);
  if (parsed && typeof parsed === 'object') {
   delete parsed.provider_token;
   delete parsed.provider_refresh_token;
  }
  return JSON.stringify(parsed);
 };
 return {
  getItem(key: string) {
   const value = storage.getItem(key);
   if (value === null) return null;
   const sanitized = clean(value);
   if (sanitized !== value) storage.setItem(key, sanitized);
   return sanitized;
  },
  setItem(key: string, value: string) { storage.setItem(key, clean(value)); },
  removeItem(key: string) { storage.removeItem(key); },
 };
}

/** Drop provider credentials before the SDK can broadcast or persist the session. */
export function withoutProviderCredentials(projectUrl: string, request: typeof fetch = fetch): typeof fetch {
 return async (input, init) => {
  const response = await request(input, init);
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (url.origin !== projectUrl || url.pathname !== '/auth/v1/token' || !response.ok) return response;
  const data = await response.json();
  delete data.provider_token;
  delete data.provider_refresh_token;
  const headers = new Headers(response.headers);
  headers.delete('content-length'); headers.delete('content-encoding');
  return new Response(JSON.stringify(data), {status: response.status, statusText: response.statusText, headers});
 };
}
