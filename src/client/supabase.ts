import type {SupabaseClient} from '@supabase/supabase-js';
import {basePath, publicConfig, sessionStorageWithoutProviderTokens, withoutProviderCredentials} from './personal-security';
let client: Promise<SupabaseClient | null> | undefined;
export function getSupabase() {
 return client ??= (async () => {
  const config = publicConfig(import.meta.env.PUBLIC_SUPABASE_URL, import.meta.env.PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  if (!config || typeof window === 'undefined') return null;
  // Fail closed if browser storage is blocked: PKCE must survive the round trip.
  const storage = sessionStorageWithoutProviderTokens(window.localStorage);
  const probe = `recall-storage-probe:${basePath(import.meta.env.BASE_URL)}`;
  storage.setItem(probe, '"ok"'); storage.removeItem(probe);
  const {createClient} = await import('@supabase/supabase-js');
  return createClient(config.url, config.key, {global: {fetch: withoutProviderCredentials(config.url)}, auth: {
   flowType: 'pkce', detectSessionInUrl: false, persistSession: true,
   autoRefreshToken: true, storage,
   storageKey: `recall-personal:${new URL(config.url).hostname}:${basePath(import.meta.env.BASE_URL)}`,
  }});
 })();
}
