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
 const edit = $<HTMLButtonElement>('edit'), cancel = $<HTMLButtonElement>('cancel');
 const editor = $('editor'), preview = $('preview'), authStatus = $('auth-status');
 const client = await getSupabase();
 if (!client) return;
 const controller = new PersonalController(answerStore(client), root.dataset.question!, root.dataset.locale as Locale, render);
 let signingOut = false, signingIn = false, authMuted = false, editing = false, composing = false;
 let userId: string | null = null, editSession = 0, previewVersion = 0, previewBody: string | undefined;
 function renderPreview() {
  const value = controller.loaded ? controller.body : '';
  if (previewBody === value) return;
  previewBody = value;
  const version = ++previewVersion;
  const fallback = document.createElement('p');
  fallback.textContent = value || t.empty;
  preview.replaceChildren(fallback);
  if (!value) return;
  // Render only on load/submit, never on keystrokes. A late module load must not
  // restore the previous account's content after logout or an account switch.
  void import('./personal-markdown').then(({renderPersonalMarkdown}) => {
   if (version !== previewVersion) return;
   preview.innerHTML = renderPersonalMarkdown(value);
   for (const link of preview.querySelectorAll('a')) {
    link.rel = 'noopener noreferrer'; link.target = '_blank';
   }
  }).catch(() => { /* Keep the safe text fallback if formatting is unavailable. */ });
 }
 function render() {
  if (userId !== controller.userId) {
   userId = controller.userId; editing = false; composing = false; editSession++;
   previewBody = undefined; previewVersion++; preview.replaceChildren();
  }
  if (body.value !== controller.body) body.value = controller.body;
  body.disabled = !controller.loaded || controller.busy || signingOut;
  body.readOnly = controller.status === 'required';
  editor.hidden = !editing; preview.hidden = editing;
  preview.setAttribute('aria-busy', String(controller.status === 'loading'));
  edit.hidden = editing;
  edit.disabled = !controller.loaded || controller.busy || controller.status === 'required' || signingOut;
  edit.setAttribute('aria-expanded', String(editing));
  cancel.disabled = controller.busy || signingOut;
  login.hidden = signingOut || (!!controller.userId && controller.status !== 'required'); login.disabled = signingOut || signingIn;
  login.removeAttribute('title');
  $('login-label').textContent = signingIn ? t.signingIn : t.signIn;
  logout.hidden = !controller.userId && !signingOut; logout.disabled = signingOut || signingIn;
  logout.textContent = signingOut ? t.signingOut : t.signOut;
  save.disabled = !controller.loaded || controller.busy || controller.status === 'required' || controller.status === 'tooLong' || signingOut;
  save.textContent = controller.status === 'failed' ? t.retry : t.save;
  refresh.disabled = !controller.userId || controller.pending || controller.status === 'loading' || signingOut;
  remove.disabled = !controller.loaded || controller.busy || controller.status === 'required' || signingOut;
  status.textContent = signingOut ? t.signingOut : t[controller.status];
  updated.hidden = !controller.updatedAt;
  if (!controller.updatedAt) { updated.textContent = ''; updated.removeAttribute('datetime'); }
  if (controller.updatedAt) { updated.dateTime = controller.updatedAt; updated.textContent = `${t.updated} ${new Date(controller.updatedAt).toLocaleString(root!.dataset.locale)}`; }
  if (!editing) renderPreview();
 }
 function startEditing() {
  if (edit.disabled || editing) return;
  editing = true; editSession++; render(); body.focus(); body.setSelectionRange(0, 0); body.scrollTop = 0;
 }
 async function submit() {
  if (!editing || save.disabled) return;
  const session = editSession;
  await controller.save();
  if (session !== editSession || !controller.loaded) return;
  if (!controller.dirty && controller.status !== 'failed' && controller.status !== 'required') {
   editing = false; render(); preview.focus();
  } else body.focus();
 }
 function cancelEditing() {
  if (cancel.disabled || (controller.dirty && !confirm(t.confirmDiscard))) return;
  controller.discardEdits(); editing = false; editSession++; render(); preview.focus();
 }
 render();
 edit.addEventListener('click', startEditing);
 root.addEventListener('dblclick', event => {
  if ((event.target as Element).closest('a,button,input,textarea,select,time')) return;
  startEditing();
 });
 preview.addEventListener('keydown', event => {
  if (event.target !== preview) return;
  if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); startEditing(); }
  if (event.key.startsWith('Arrow')) event.stopPropagation();
 });
 body.addEventListener('input', () => controller.edit(body.value));
 body.addEventListener('compositionstart', () => { composing = true; });
 body.addEventListener('compositionend', () => { composing = false; });
 body.addEventListener('keydown', event => {
  // Safari may end composition before keydown; 229 still identifies IME input.
  if (event.isComposing || composing || event.keyCode === 229) return;
  // Enter uses the textarea's native newline behavior. Only the Save button submits.
  if (event.key === 'Escape') { event.preventDefault(); cancelEditing(); }
 });
 save.addEventListener('click', () => void submit());
 cancel.addEventListener('click', cancelEditing);
 refresh.addEventListener('click', () => void controller.load());
 remove.addEventListener('click', async () => {
  if (!confirm(t.confirmDelete)) return;
  await controller.remove();
  if (controller.status === 'deleted') { editing = false; editSession++; render(); preview.focus(); }
 });
 const discard = () => !controller.pending || confirm(t.confirmDiscard);
 login.addEventListener('click', async () => {
  if (!discard()) return;
  signingIn = true; authStatus.textContent = ''; render();
  try {
   const base = import.meta.env.BASE_URL;
   sessionStorage.setItem(returnKey(base), safeReturn(location.pathname + location.search, location.origin, base));
   // No additional GitHub scopes. Supabase manages provider state; SDK manages PKCE.
   const {error} = await client.auth.signInWithOAuth({provider: 'github', options: {redirectTo: new URL(`${basePath(base)}auth/callback/`, location.origin).href}});
   if (error) throw error;
   signingIn = false; render();
  } catch { signingIn = false; render(); authStatus.textContent = t.authFailed; }
 });
 logout.addEventListener('click', async () => {
  if (!discard()) return;
  signingOut = true; authMuted = true; controller.dispose(); render();
  try {
   const {error} = await client.auth.signOut({scope: 'local'});
   if (error) throw error;
   signingOut = false; authMuted = false; authStatus.textContent = ''; render();
  } catch {
   signingOut = false; render(); status.textContent = t.signOutFailed; authStatus.textContent = t.signOutFailed;
   logout.hidden = false;
  }
 });
 const {data: {subscription}} = client.auth.onAuthStateChange((_event, session) => {
  if (!authMuted) controller.setUser(session?.user.id ?? null);
 });
 addEventListener('beforeunload', event => { if (controller.pending) { event.preventDefault(); event.returnValue = ''; } });
 addEventListener('pagehide', () => { subscription.unsubscribe(); controller.dispose(); });
 addEventListener('pageshow', event => { if (event.persisted) location.reload(); });
}
void mount().catch(() => { /* Unavailable sync never prevents public study controls. */ });
