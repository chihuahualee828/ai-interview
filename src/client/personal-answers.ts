import {getSupabase} from './supabase';
import {PersonalController} from './personal-controller';
import {answerStore} from './personal-store';
import {basePath, returnKey, safeReturn} from './personal-security';
import type {Messages} from '../lib/i18n';
import type {Locale} from '../lib/types';
async function mount() {
 const root = document.getElementById('personal-answer');
 if (!root) return;
 const t = JSON.parse(root.dataset.labels!) as Messages['personal'];
 const $ = <T extends HTMLElement>(id: string) => document.getElementById(`personal-${id}`) as T;
 const body = $<HTMLTextAreaElement>('body'), status = $('status'), updated = $<HTMLTimeElement>('updated');
 const login = $<HTMLButtonElement>('login'), logout = $<HTMLButtonElement>('logout');
 const save = $<HTMLButtonElement>('save'), refresh = $<HTMLButtonElement>('refresh'), remove = $<HTMLButtonElement>('delete');
 const client = await getSupabase();
 if (!client) return;
 const controller = new PersonalController(answerStore(client), root.dataset.question!, root.dataset.locale as Locale, render);
 let signingOut = false, authMuted = false;
 function render() {
  // Plain text only. Never render personal answers or auth errors as HTML.
  if (body.value !== controller.body) body.value = controller.body;
  body.disabled = !controller.loaded || controller.status === 'deleting' || signingOut;
  body.readOnly = controller.status === 'required';
  login.hidden = !!controller.userId && controller.status !== 'required'; login.disabled = signingOut;
  logout.hidden = !controller.userId; logout.disabled = signingOut;
  save.disabled = !controller.userId || controller.busy || controller.status === 'required' || controller.status === 'tooLong' || signingOut || (controller.loaded && !controller.dirty);
  save.textContent = controller.status === 'failed' ? t.retry : t.save;
  refresh.disabled = !controller.userId || controller.pending || controller.status === 'loading' || signingOut;
  remove.disabled = !controller.loaded || controller.busy || controller.status === 'required' || signingOut;
  status.textContent = t[controller.status];
  updated.hidden = !controller.updatedAt;
  if (!controller.updatedAt) { updated.textContent = ''; updated.removeAttribute('datetime'); }
  if (controller.updatedAt) { updated.dateTime = controller.updatedAt; updated.textContent = `${t.updated} ${new Date(controller.updatedAt).toLocaleString(root!.dataset.locale)}`; }
 }
 render();
 body.addEventListener('input', () => controller.edit(body.value));
 save.addEventListener('click', () => { if (controller.loaded) void controller.save(); else void controller.load(); });
 refresh.addEventListener('click', () => void controller.load());
 remove.addEventListener('click', () => { if (confirm(t.confirmDelete)) void controller.remove(); });
 const discard = () => !controller.pending || confirm(t.confirmDiscard);
 login.addEventListener('click', async () => {
  if (!discard()) return;
  login.disabled = true;
  try {
   const base = import.meta.env.BASE_URL;
   sessionStorage.setItem(returnKey(base), safeReturn(location.pathname + location.search, location.origin, base));
   // No additional GitHub scopes. Supabase manages provider state; SDK manages PKCE.
   const {error} = await client.auth.signInWithOAuth({provider: 'github', options: {redirectTo: new URL(`${basePath(base)}auth/callback/`, location.origin).href}});
   if (error) throw error;
   login.disabled = false;
  } catch { status.textContent = t.authFailed; login.disabled = false; }
 });
 logout.addEventListener('click', async () => {
  if (!discard()) return;
  signingOut = true; authMuted = true; controller.dispose(); render();
  try {
   const {error} = await client.auth.signOut({scope: 'local'});
   if (error) throw error;
   signingOut = false; authMuted = false; render();
  } catch {
   signingOut = false; render(); status.textContent = t.signOutFailed;
   // Keep the editor cleared; allow an explicit logout retry when revocation fails.
   logout.hidden = false;
  }
 });
 const {data: {subscription}} = client.auth.onAuthStateChange((_event, session) => {
  if (!authMuted) controller.setUser(session?.user.id ?? null);
 });
 // INITIAL_SESSION comes from the SDK subscription; no competing getSession load.
 addEventListener('beforeunload', event => { if (controller.pending) { event.preventDefault(); event.returnValue = ''; } });
 addEventListener('pagehide', () => { subscription.unsubscribe(); controller.dispose(); });
 addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
}
void mount().catch(() => { /* Unavailable sync never prevents public study controls. */ });
