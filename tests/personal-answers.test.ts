import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PersonalController} from '../src/client/personal-controller';
import type {Answer, AnswerKey, AnswerStore} from '../src/client/personal-store';
const tick = () => new Promise(resolve => setTimeout(resolve,0));
function deferred<T>() { let resolve!: (v:T)=>void, reject!: (e:unknown)=>void; const promise = new Promise<T>((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; }
function setup(overrides: Partial<AnswerStore> = {}) {
 const records = new Map<string,Answer>(), calls: {key:AnswerKey;body:string}[] = [];
 const keyOf = (key: AnswerKey) => JSON.stringify(key);
 const store: AnswerStore = {
  async load(key) { return records.get(keyOf(key))??null; },
  async save(key,body) { calls.push({key,body}); const answer = {body,updated_at:'2026-10-18T00:00:00Z'}; records.set(keyOf(key),answer); return answer; },
  async remove(key) { records.delete(keyOf(key)); }, ...overrides,
 };
 const controller = new PersonalController(store,'Q0001','ja',()=>{});
 return {controller,store,records,calls};
}
test('signed-out editor cannot load or write; user/question/locale key controls CRUD', async () => {
 const {controller:c,store,calls}=setup(); c.edit('ignored'); await c.save(); assert.equal(c.body,''); assert.equal(calls.length,0);
 c.setUser('A'); await tick(); assert.equal(c.status,'ready');
 c.edit('private'); await c.save(); assert.equal(c.status,'saved'); assert.deepEqual(calls,[{key:{user_id:'A',question_id:'Q0001',locale:'ja'},body:'private'}]);
 const second=new PersonalController(store,'Q0001','en',()=>{});second.setUser('A');await tick();assert.equal(second.body,'');second.dispose();
 c.setUser('B');await tick();assert.equal(c.body,'');c.setUser('A');await tick();assert.equal(c.body,'private');
 await c.remove();assert.equal(c.status,'deleted');await c.load();assert.equal(c.body,'');c.dispose();
});
test('typing never writes; an explicit save waits for acknowledgement', async t => {
 t.mock.timers.enable({apis:['setTimeout']});
 const response=deferred<Answer>();let writes=0;
 const {controller:c}=setup({async save(_key,body){writes++;assert.equal(body,'latest');return response.promise;}});
 c.setUser('A');await Promise.resolve();c.edit('first');t.mock.timers.tick(1000);c.edit('latest');t.mock.timers.tick(60000);
 assert.equal(writes,0);assert.equal(c.status,'unsaved');
 const saving=c.save();assert.equal(writes,1);assert.equal(c.status,'saving');
 response.resolve({body:'latest',updated_at:'now'});await saving;assert.equal(c.status,'saved');c.dispose();
});
test('edits during a save stay local until another explicit save', async () => {
 const first=deferred<Answer>(),second=deferred<Answer>();const writes:string[]=[];
 const {controller:c}=setup({async save(_key,body){writes.push(body);return writes.length===1?first.promise:second.promise;}});
 c.setUser('A');await tick();c.edit('old');const saving=c.save();c.edit('new');await c.save();assert.deepEqual(writes,['old']);
 first.resolve({body:'old',updated_at:'old-time'});await saving;assert.equal(c.body,'new');assert.equal(c.status,'unsaved');assert.deepEqual(writes,['old']);
 const next=c.save();assert.deepEqual(writes,['old','new']);second.resolve({body:'new',updated_at:'new-time'});await next;assert.equal(c.status,'saved');c.dispose();
});
test('logout/account switch abort requests and ignore stale loads and saves', async () => {
 const oldLoad=deferred<Answer>();let signal:AbortSignal|undefined;
 const {controller:c}=setup({async load(key,s){if(key.user_id==='A'){signal=s;return oldLoad.promise;}return null;}});
 c.setUser('A');c.setUser('B');assert.equal(signal!.aborted,true);await tick();c.edit('B answer');oldLoad.resolve({body:'A private',updated_at:'old'});await tick();assert.equal(c.body,'B answer');c.setUser(null);assert.equal(c.body,'');assert.equal(c.status,'signedOut');
 const save=deferred<Answer>();const other=setup({async save(_key,_body,s){signal=s;return save.promise;}}).controller;
 other.setUser('A');await tick();other.edit('A');const saving=other.save();other.setUser('B');await tick();assert.equal(signal!.aborted,true);save.resolve({body:'A',updated_at:'old'});await saving;assert.equal(other.body,'');assert.equal(other.status,'ready');other.dispose();
});
test('network failure retains text and retries; failed loads cannot overwrite cloud data', async () => {
 let failLoad=true,failSave=true;
 const {controller:c}=setup({async load(){if(failLoad)throw new Error('offline');return null;},async save(_key,body){if(failSave)throw new Error('offline');return {body,updated_at:'now'};}});
 c.setUser('A');await tick();assert.equal(c.status,'failed');c.edit('ignored');assert.equal(c.body,'');
 failLoad=false;await c.load();c.edit('keep me');await c.save();assert.equal(c.status,'failed');assert.equal(c.body,'keep me');assert.equal(c.pending,true);
 await c.load();assert.equal(c.body,'keep me');failSave=false;await c.save();assert.equal(c.status,'saved');c.dispose();
});
test('delete failure preserves content; successful delete clears the draft without saving', async t => {
 t.mock.timers.enable({apis:['setTimeout']});let fail=true, saves=0;
 const {controller:c}=setup({async load(){return {body:'saved',updated_at:'now'};},async remove(){if(fail)throw new Error('offline');},async save(_k,body){saves++;return {body,updated_at:'now'};}});
 c.setUser('A');await Promise.resolve();c.edit('unsaved');await c.remove();assert.equal(c.status,'failed');assert.equal(c.body,'unsaved');fail=false;await c.remove();t.mock.timers.tick(1000);assert.equal(saves,0);assert.equal(c.body,'');c.dispose();
});
test('expired credentials require login; over-limit answers never get sent', async () => {
 const {controller:c,calls}=setup({async save(){throw {status:401};}});
 c.setUser('A');await tick();c.edit('x'.repeat(30001));await c.save();assert.equal(c.status,'tooLong');assert.equal(calls.length,0);
 c.edit('keep before reauthentication');await c.save();assert.equal(c.status,'required');assert.equal(c.body,'keep before reauthentication');c.setUser(null);assert.equal(c.body,'');c.dispose();
});
test('reverting local text during a pending save is not marked saved prematurely', async () => {
 const first=deferred<Answer>(),second=deferred<Answer>();let writes=0;
 const {controller:c}=setup({async save(){return ++writes===1?first.promise:second.promise;}});
 c.setUser('A');await tick();c.edit('pending');const saving=c.save();c.edit('');assert.equal(c.status,'saving');assert.equal(c.pending,true);
 first.resolve({body:'pending',updated_at:'first'});await saving;assert.equal(writes,1);assert.equal(c.status,'unsaved');
 const next=c.save();assert.equal(writes,2);
 second.resolve({body:'',updated_at:'second'});await next;assert.equal(c.status,'saved');c.dispose();assert.equal(c.updatedAt,'');
});

test('discard restores the acknowledged version without sending or hiding an expired session', async () => {
 const {controller:c,calls}=setup({async load(){return {body:'saved note',updated_at:'now'};}});
 c.setUser('A');await tick();c.edit('draft');c.discardEdits();assert.equal(c.body,'saved note');assert.equal(c.dirty,false);assert.equal(calls.length,0);
 const expired=setup({async save(){throw {status:401};}}).controller;
 expired.setUser('A');await tick();expired.edit('draft');await expired.save();expired.discardEdits();assert.equal(expired.status,'required');assert.equal(expired.body,'');
 c.dispose();expired.dispose();
});
