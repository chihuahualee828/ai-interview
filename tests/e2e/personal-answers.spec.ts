import {test,expect,type Page} from '@playwright/test';
const base=(process.env.BASE_PATH||'/').replace(/\/$/,'')+'/';
const start=`${base}en/questions/Q0001/`;
const storageKey=`recall-personal:example.supabase.co:${base}`;
const userA='00000000-0000-4000-8000-000000000001', userB='00000000-0000-4000-8000-000000000002';
function session(id=userA){return {access_token:'test-access-token',refresh_token:'test-refresh-token',expires_at:Math.floor(Date.now()/1000)+3600,expires_in:3600,token_type:'bearer',user:{id,aud:'authenticated',role:'authenticated',email:'test@example.invalid',app_metadata:{provider:'github'},user_metadata:{},created_at:'2026-10-18T00:00:00Z'}};}
async function cloud(page:Page, signedIn=true){
 let record:string|null=null,fail=false;const writes:string[]=[];
 await page.route('https://example.supabase.co/**',async route=>{
  const req=route.request(),url=new URL(req.url());
  if(url.pathname==='/auth/v1/logout'){await route.fulfill({status:204});return;}
  if(url.pathname!=='/rest/v1/personal_answers'){await route.abort();return;}
  expect(url.searchParams.get('question_id')).toBe('eq.Q0001');expect(url.searchParams.get('locale')).toBe('eq.en');expect(url.searchParams.get('user_id')).toBe(`eq.${userA}`);
  if(fail){await route.fulfill({status:503,json:{message:'offline'}});return;}
  if(req.method()==='POST'){record=req.postDataJSON().body;writes.push(record!);await route.fulfill({json:{body:record,updated_at:'2026-10-18T00:00:00Z'}});}
  else if(req.method()==='DELETE'){record=null;await route.fulfill({status:204});}
  else await route.fulfill({json:record===null?[]:[{body:record,updated_at:'2026-10-18T00:00:00Z'}]});
 });
 if(signedIn) await page.addInitScript(({key,value})=>{if(!sessionStorage.getItem('seeded')){localStorage.setItem(key,JSON.stringify(value));sessionStorage.setItem('seeded','1');}},{key:storageKey,value:session()});
 return {writes,fail:(value:boolean)=>{fail=value;}};
}
test('signed-out browsing and contribution links work; login uses fixed callback and PKCE without extra scopes',async({page})=>{
 await cloud(page,false);await page.goto(start+'?tag=llm');
 await expect(page.locator('#personal-status')).toContainText('Sign in to save');await expect(page.locator('#personal-body')).toBeDisabled();
 await page.locator('#answer-button').click();await expect(page.locator('#answer-panel')).toBeVisible();await expect(page.locator('.contribute')).toBeVisible();
 const authRequest=page.waitForRequest(r=>r.url().includes('/auth/v1/authorize'));
 await page.locator('#personal-login').click();const url=new URL((await authRequest).url());
 expect(url.searchParams.get('provider')).toBe('github');expect(url.searchParams.has('scopes')).toBe(false);
 expect(url.searchParams.get('code_challenge_method')).toBe('s256');expect(url.searchParams.get('code_challenge')).toBeTruthy();
 expect(url.searchParams.get('redirect_to')).toBe(`http://127.0.0.1:4323${base}auth/callback/`);
});
test('plain-text autosave, keyboard isolation, reload, failure/retry, deletion and logout',async({page})=>{
 const mock=await cloud(page);await page.goto(start);const editor=page.locator('#personal-body');await expect(editor).toBeEnabled();
 const payload='<img src=x onerror="window.privateXss=true">';await editor.fill(payload);await editor.press('ArrowRight');await expect(page).toHaveURL(new RegExp('Q0001'));await expect(page.locator('#personal-status')).toHaveText('Saved');expect(mock.writes).toEqual([payload]);
 expect(await page.evaluate(()=>Object.hasOwn(window,'privateXss'))).toBe(false);await expect(page.locator('#personal-answer img')).toHaveCount(0);
 await page.reload();await expect(editor).toHaveValue(payload);
 mock.fail(true);await editor.fill('unsaved draft');await page.locator('#personal-save').click();await expect(page.locator('#personal-status')).toContainText('failed');await expect(editor).toHaveValue('unsaved draft');
 page.once('dialog',dialog=>dialog.dismiss());await page.locator('#next').click();await expect(page).toHaveURL(new RegExp('Q0001'));
 mock.fail(false);await page.locator('#personal-save').click();await expect(page.locator('#personal-status')).toHaveText('Saved');
 page.once('dialog',dialog=>dialog.accept());await page.locator('#personal-delete').click();await expect(editor).toHaveValue('');await expect(page.locator('#personal-status')).toContainText('deleted');
 await page.locator('#personal-logout').click();await expect(editor).toBeDisabled();await expect(page.locator('#personal-status')).toContainText('Sign in to save');
 expect(await page.evaluate(key=>localStorage.getItem(key),storageKey)).toBeNull();
});
test('account switch clears the previous answer before the next account load',async({page})=>{
 await cloud(page);await page.goto(start);await expect(page.locator('#personal-body')).toBeEnabled();await page.locator('#personal-body').fill('A secret');await page.locator('#personal-save').click();await expect(page.locator('#personal-status')).toHaveText('Saved');
 await page.route('**/rest/v1/personal_answers?**',async route=>{await new Promise(r=>setTimeout(r,400));await route.fulfill({json:[]});});
 await page.evaluate(({key,value})=>{localStorage.setItem(key,JSON.stringify(value));const channel=new BroadcastChannel(key);channel.postMessage({event:'SIGNED_IN',session:value});channel.close();},{key:storageKey,value:session(userB)});
 await expect(page.locator('#personal-body')).toHaveValue('');await expect(page.locator('#personal-body')).toBeEnabled();
});
test('callback exchanges PKCE, scrubs URL and provider credentials, and restores locale/filters',async({page})=>{
 await cloud(page,false);await page.goto(start+'?tag=llm');await expect(page.locator('#personal-login')).toBeEnabled();
 await page.route('**/auth/v1/authorize?**',route=>route.fulfill({contentType:'text/html',body:'OAuth provider fixture'}));
 await page.locator('#personal-login').click();await page.waitForURL(/auth\/v1\/authorize/);
 await page.route('**/auth/v1/token?**',async route=>{expect(route.request().postDataJSON().code_verifier).toBeTruthy();await route.fulfill({json:{...session(),provider_token:'test-github-provider',provider_refresh_token:'test-github-refresh'}});});
 await page.addInitScript(() => {
  const original = BroadcastChannel.prototype.postMessage;
  BroadcastChannel.prototype.postMessage = function(value) {
   if (value?.session?.provider_token || value?.session?.provider_refresh_token) sessionStorage.setItem('provider-broadcast-leak', 'yes');
   return original.call(this,value);
  };
 });
 await page.goto(`${base}auth/callback/?code=test-code`);await expect(page).toHaveURL(new RegExp('en/questions/Q0001/\\?tag=llm'));
 await expect(page.locator('#personal-body')).toBeEnabled();const stored=await page.evaluate(key=>localStorage.getItem(key),storageKey);expect(stored).toContain('test-access-token');expect(stored).not.toContain('test-github');expect(await page.evaluate(()=>sessionStorage.getItem('provider-broadcast-leak'))).toBeNull();
});
test('callback failure and malicious return path stay inside the static base',async({page})=>{
 await cloud(page,false);await page.goto(start);await page.evaluate(base=>sessionStorage.setItem(`recall-personal-return:${base}`,'//evil.test'),base);
 await page.goto(`${base}auth/callback/?error=access_denied&error_description=private#token`);
 await expect(page.locator('#callback-status')).toContainText('failed');await expect(page).toHaveURL(`http://127.0.0.1:4323${base}auth/callback/`);await expect(page.locator('#callback-return')).toHaveAttribute('href',start);
});
test('mobile editor fits the viewport',async({page})=>{
 await cloud(page);await page.setViewportSize({width:390,height:844});await page.goto(start);await expect(page.locator('#personal-body')).toBeEnabled();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('expired authentication preserves unsaved text until explicit sign-out',async({page})=>{
 await cloud(page);await page.goto(start);await expect(page.locator('#personal-body')).toBeEnabled();
 await page.route('**/rest/v1/personal_answers?**',route=>route.fulfill({status:401,json:{code:'PGRST301',message:'JWT expired'}}));
 await page.locator('#personal-body').fill('copy this draft');await page.locator('#personal-save').click();
 await expect(page.locator('#personal-status')).toContainText('Sign in required');await expect(page.locator('#personal-body')).toHaveValue('copy this draft');await expect(page.locator('#personal-body')).toHaveAttribute('readonly','');await expect(page.locator('#personal-body')).toBeEnabled();await expect(page.locator('#personal-login')).toBeVisible();
 page.once('dialog',d=>d.accept());await page.locator('#personal-logout').click();await expect(page.locator('#personal-body')).toHaveValue('');
});
test('failed sign-out keeps private content hidden and offers a retry',async({page})=>{
 await cloud(page);await page.goto(start);await expect(page.locator('#personal-body')).toBeEnabled();await page.locator('#personal-body').fill('private');await page.locator('#personal-save').click();await expect(page.locator('#personal-status')).toHaveText('Saved');
 await page.route('**/auth/v1/logout?**',route=>route.fulfill({status:400,json:{message:'test logout failure'}}));
 await page.locator('#personal-logout').click();await expect(page.locator('#personal-status')).toContainText('Sign-out could not');await expect(page.locator('#personal-body')).toHaveValue('');await expect(page.locator('#personal-body')).toBeDisabled();await expect(page.locator('#personal-logout')).toBeVisible();
 await page.route('**/auth/v1/logout?**',route=>route.fulfill({status:204}));await page.locator('#personal-logout').click();await expect(page.locator('#personal-status')).toContainText('Sign in to save');expect(await page.evaluate(key=>localStorage.getItem(key),storageKey)).toBeNull();
});
