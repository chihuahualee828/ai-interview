import {test} from 'node:test';
import assert from 'node:assert/strict';
import {publicConfig, safeReturn, sessionStorageWithoutProviderTokens, withoutProviderCredentials} from '../src/client/personal-security';
const origin = 'https://chihuahualee828.github.io', base = '/ai-interview/';
test('OAuth returns stay on same-origin question routes within the Pages base', () => {
 const fallback = `${base}en/questions/Q0001/`;
 for (const input of [null, '//evil.test/x', 'https://evil.test', '/other/en/questions/Q0001/', '/ai-interview-other/en/questions/Q0001/', '/ai-interview/../en/questions/Q0001/', '/ai-interview/%2e%2e/en/questions/Q0001/', '/\\evil.test', '/ai-interview/auth/callback/', '/ai-interview/en/questions/Q0001/%2f', '/ai-interview/en/questions/Q0001/\n']) assert.equal(safeReturn(input, origin, base), fallback);
 assert.equal(safeReturn('/ai-interview/ja/questions/Q9999/?tag=llm&code=private&mode=random#token',origin,base), '/ai-interview/ja/questions/Q9999/?tag=llm&mode=random');
 assert.equal(safeReturn('/zh-TW/questions/Q0001/?ready=1', 'http://127.0.0.1:4321', '/'), '/zh-TW/questions/Q0001/?ready=1');
});
test('public configuration rejects private keys and unsafe project URLs', () => {
 const url = 'https://example.supabase.co';
 assert.equal(publicConfig(undefined, undefined), null);
 assert.ok(publicConfig(url, 'sb_publishable_example'));
 for (const key of ['sb_secret_example','service_role','not-a-key']) assert.equal(publicConfig(url,key),null);
 const jwt = (role: string) => `header.${Buffer.from(JSON.stringify({role})).toString('base64url')}.signature`;
 assert.ok(publicConfig(url,jwt('anon')));
 assert.equal(publicConfig(url,jwt('service_role')), null);
 for (const target of ['http://example.supabase.co','https://evil.test','https://example.supabase.co.evil.test','https://user:pass@example.supabase.co','https://example.supabase.co/path']) assert.equal(publicConfig(target,'sb_publishable_example'),null);
});
test('storage drops provider tokens while preserving Supabase session and PKCE values', () => {
 const entries = new Map<string,string>();
 const storage = {getItem:(k:string)=>entries.get(k)??null,setItem:(k:string,v:string)=>{entries.set(k,v);},removeItem:(k:string)=>{entries.delete(k);}};
 const adapter = sessionStorageWithoutProviderTokens(storage);
 const session = {access_token:'test-access',refresh_token:'test-refresh',provider_token:'test-provider',provider_refresh_token:'test-provider-refresh',user:{id:'A'}};
 adapter.setItem('session', JSON.stringify(session));
 assert.deepEqual(JSON.parse(entries.get('session')!), {access_token:'test-access',refresh_token:'test-refresh',user:{id:'A'}});
 entries.set('legacy',JSON.stringify(session)); assert.ok(!adapter.getItem('legacy')!.includes('test-provider')); assert.ok(!entries.get('legacy')!.includes('test-provider'));
 adapter.setItem('verifier',JSON.stringify('pkce-verifier')); assert.equal(adapter.getItem('verifier'),'"pkce-verifier"');
 adapter.removeItem('session'); assert.equal(adapter.getItem('session'),null);
});
test('token responses are sanitized before SDK session notifications, other responses untouched', async () => {
 const data = {access_token:'test-access',refresh_token:'test-refresh',provider_token:'test-provider',provider_refresh_token:'test-provider-refresh'};
 const request = (async () => new Response(JSON.stringify(data),{headers:{'content-type':'application/json'}})) as typeof fetch;
 const wrapped = withoutProviderCredentials('https://example.supabase.co', request);
 assert.deepEqual(await (await wrapped('https://example.supabase.co/auth/v1/token?grant_type=pkce')).json(), {access_token:'test-access',refresh_token:'test-refresh'});
 assert.deepEqual(await (await wrapped('https://example.supabase.co/rest/v1/personal_answers')).json(),data);
 const failure = new Response('unavailable',{status:503});
 assert.equal(await withoutProviderCredentials('https://example.supabase.co', (async()=>failure) as typeof fetch)('https://example.supabase.co/auth/v1/token'),failure);
});
