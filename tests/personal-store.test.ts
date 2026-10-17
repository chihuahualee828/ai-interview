import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createClient} from '@supabase/supabase-js';
import {answerStore} from '../src/client/personal-store';
test('real SDK requests use all key filters, composite upsert and no client timestamp', async () => {
 const requests: {url:URL;method:string;body:unknown}[]=[];
 const client=createClient('https://example.supabase.co','sb_publishable_test_only',{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:async(input,init)=>{
  const url=new URL(String(input)), method=init?.method??'GET';requests.push({url,method,body:init?.body?JSON.parse(String(init.body)):null});
  return new Response(method==='DELETE'?null:JSON.stringify(method==='GET'?[]:{body:'answer',updated_at:'now'}),{status:method==='DELETE'?204:200,headers:{'content-type':'application/json'}});
 }}});
 const store=answerStore(client), key={user_id:'A',question_id:'Q0099',locale:'zh-TW' as const}, signal=new AbortController().signal;
 assert.equal(await store.load(key,signal),null);assert.equal((await store.save(key,'answer',signal)).body,'answer');await store.remove(key,signal);
 assert.deepEqual(requests.map(r=>r.method),['GET','POST','DELETE']);
 for(const {url} of requests){assert.equal(url.pathname,'/rest/v1/personal_answers');for(const [name,value] of Object.entries(key))assert.equal(url.searchParams.get(name),`eq.${value}`);}
 assert.equal(requests[1].url.searchParams.get('on_conflict'),'user_id,question_id,locale');assert.deepEqual(requests[1].body,{...key,body:'answer'});
});
