import type {Locale} from '../lib/types';
import type {AnswerKey, AnswerStore} from './personal-store';
export type Status = 'signedOut' | 'loading' | 'ready' | 'unsaved' | 'saving' | 'saved' | 'failed' | 'required' | 'deleting' | 'deleted' | 'tooLong';
export class PersonalController {
 body = ''; status: Status = 'signedOut'; updatedAt = ''; userId: string | null = null;
 loaded = false; busy = false;
 private savedBody = ''; private epoch = 0;
 private timer?: ReturnType<typeof setTimeout>;
 private request?: AbortController;
 constructor(private store: AnswerStore, private question: string, private locale: Locale, private changed: () => void, private delay = 900) {}
 get dirty() { return this.body !== this.savedBody; }
 get pending() { return this.dirty || this.busy; }
 private key(): AnswerKey { return {user_id: this.userId!, question_id: this.question, locale: this.locale}; }
 private emit(status: Status) { this.status = status; this.changed(); }
 private cancel() { clearTimeout(this.timer); this.request?.abort(); this.epoch++; }
 setUser(id: string | null) {
  if (id === this.userId) return;
  this.cancel(); this.userId = id; this.body = this.savedBody = this.updatedAt = ''; this.loaded = this.busy = false;
  this.emit(id ? 'loading' : 'signedOut');
  if (id) void this.load();
 }
 async load() {
  if (!this.userId || this.pending) return;
  this.cancel(); const epoch = this.epoch;
  this.request = new AbortController(); this.loaded = false; this.emit('loading');
  try {
   const answer = await this.store.load(this.key(), this.request.signal);
   if (epoch !== this.epoch) return;
   this.body = this.savedBody = answer?.body ?? ''; this.updatedAt = answer?.updated_at ?? ''; this.loaded = true;
   this.emit(answer ? 'saved' : 'ready');
  } catch (error) { if (epoch === this.epoch) this.fail(error); }
 }
 edit(body: string) {
  if (!this.userId || !this.loaded || this.status === 'deleting' || this.status === 'required') return;
  this.body = body; clearTimeout(this.timer);
  if ([...body].length > 30000) { this.emit('tooLong'); return; }
  this.emit(this.dirty ? 'unsaved' : this.busy ? 'saving' : 'saved');
  if (this.dirty) this.timer = setTimeout(() => void this.save(), this.delay);
 }
 private fail(error: unknown) {
  const status = (error as {status?: number; code?: string})?.status;
  const code = (error as {code?: string})?.code;
  this.emit(status === 401 || code === 'PGRST301' || code === 'PGRST303' ? 'required' : 'failed');
 }
 async save() {
  clearTimeout(this.timer);
  if (!this.userId || !this.loaded || this.busy || !this.dirty || [...this.body].length > 30000 || this.status === 'required') return;
  const epoch = this.epoch, body = this.body;
  this.request = new AbortController(); this.busy = true; this.emit('saving');
  let acknowledged = false;
  try {
   const answer = await this.store.save(this.key(), body, this.request.signal);
   if (epoch !== this.epoch) return;
   this.savedBody = body; this.updatedAt = answer.updated_at; acknowledged = true;
  } catch (error) { if (epoch === this.epoch) this.fail(error); }
  finally {
   if (epoch === this.epoch) {
    this.busy = false;
    if (acknowledged) this.emit([...this.body].length > 30000 ? 'tooLong' : this.dirty ? 'unsaved' : 'saved'); else this.changed();
    // Serialize writes: a newer edit is sent only after this request completes.
    if (acknowledged && this.dirty) void this.save();
   }
  }
 }
 async remove() {
  if (!this.userId || !this.loaded || this.busy || this.status === 'required') return;
  clearTimeout(this.timer); const epoch = this.epoch;
  this.request = new AbortController(); this.busy = true; this.emit('deleting');
  try {
   await this.store.remove(this.key(), this.request.signal);
   if (epoch !== this.epoch) return;
   this.body = this.savedBody = this.updatedAt = ''; this.emit('deleted');
  } catch (error) { if (epoch === this.epoch) this.fail(error); }
  finally { if (epoch === this.epoch) { this.busy = false; this.changed(); } }
 }
 dispose() { this.cancel(); this.userId = null; this.body = this.savedBody = this.updatedAt = ''; this.loaded = this.busy = false; this.emit('signedOut'); }
}
