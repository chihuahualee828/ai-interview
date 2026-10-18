import {getSupabase} from './supabase';
import {basePath, returnKey, safeReturn} from './personal-security';
import type {Messages} from '../lib/i18n';
import type {Locale} from '../lib/types';
async function callback() {
 const base = import.meta.env.BASE_URL;
 const params = new URLSearchParams(location.search);
 // Remove codes and provider errors before any async work or outgoing navigation.
 history.replaceState(null, '', `${basePath(base)}auth/callback/`);
 let stored: string | null = null;
 try { stored = sessionStorage.getItem(returnKey(base)); sessionStorage.removeItem(returnKey(base)); } catch {}
 const target = safeReturn(stored, location.origin, base);
 const locale = target.slice(basePath(base).length).split('/')[0] as Locale;
 const labels = JSON.parse(document.querySelector<HTMLElement>('.auth-callback')!.dataset.labels!) as Record<Locale, Messages['personal']>;
 const t = labels[locale];
 document.documentElement.lang = locale;
 document.title = `Recall · ${t.signIn}`;
 const status = document.getElementById('callback-status')!;
 const link = document.getElementById('callback-return') as HTMLAnchorElement;
 link.href = target; link.textContent = t.back; status.textContent = t.callbackLoading;
 try {
  const code = params.get('code');
  if (!code || params.has('error') || params.has('error_description')) throw new Error('OAuth failed');
  const client = await getSupabase();
  if (!client) throw new Error('Unavailable');
  // Provider credentials are stripped by the client fetch wrapper before SDK processing.
  const {error} = await client.auth.exchangeCodeForSession(code);
  if (error) throw error;
  location.replace(target);
 } catch { status.textContent = t.authFailed; }
}
void callback();
