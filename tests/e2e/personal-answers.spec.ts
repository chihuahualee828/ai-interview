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
 await expect(page.locator('.site-header #personal-login')).toBeVisible();
 await expect(page.locator('#personal-status')).toContainText('Sign in to save');await expect(page.locator('#personal-body')).toBeDisabled();
 await page.locator('#answer-button').click();await expect(page.locator('#answer-panel')).toBeVisible();await expect(page.locator('.contribute')).toBeVisible();
 const authRequest=page.waitForRequest(r=>r.url().includes('/auth/v1/authorize'));
 await page.locator('#personal-login').click();const url=new URL((await authRequest).url());
 expect(url.searchParams.get('provider')).toBe('github');expect(url.searchParams.has('scopes')).toBe(false);
 expect(url.searchParams.get('code_challenge_method')).toBe('s256');expect(url.searchParams.get('code_challenge')).toBeTruthy();
 expect(url.searchParams.get('redirect_to')).toBe(`http://127.0.0.1:4323${base}auth/callback/`);
});
test('double-click opens notes; only the Save button submits Markdown/math and closes the editor',async({page})=>{
 const mock=await cloud(page);await page.goto(start);
 const editor=page.locator('#personal-body'),preview=page.locator('#personal-preview');
 await expect(page.locator('#personal-edit')).toBeEnabled();await expect(editor).toBeHidden();
 await preview.dblclick();await expect(editor).toBeFocused();
 const note='## My reasoning\n\n**Attention** uses $O(n^2)$\n\n- Query\n- Key\n\n$$\n\\frac{QK^T}{\\sqrt{d_k}}\n$$';
 await editor.fill(note);await editor.press('ArrowRight');await expect(page).toHaveURL(new RegExp('Q0001'));
 await page.locator('#personal-title').click();await page.waitForTimeout(1200);expect(mock.writes).toEqual([]);
 await page.locator('#personal-save').click();await expect(editor).toBeHidden();await expect(page.locator('#personal-status')).toHaveText('Saved');
 expect(mock.writes).toEqual([note]);await expect(preview.locator('strong')).toHaveText('Attention');await expect(preview.locator('.katex')).toHaveCount(2);await expect(preview.locator('.katex-display')).toHaveCount(1);
 await page.reload();await expect(preview.locator('strong')).toHaveText('Attention');await expect(editor).toBeHidden();
 await preview.focus();await page.keyboard.press('Enter');await expect(editor).toBeFocused();await expect(editor).toHaveValue(note);
 await page.locator('#personal-save').click();await expect(editor).toBeHidden();expect(mock.writes).toEqual([note]);
});
test('Enter inserts newlines without saving or rendering; IME confirmation does not submit; cancellation restores the saved note',async({page})=>{
 const mock=await cloud(page);await page.goto(start);await page.locator('#personal-edit').click();const editor=page.locator('#personal-body');
 await editor.fill('first');await editor.press('End');await editor.press('Enter');await editor.press('a');await editor.press('Shift+Enter');await editor.press('b');await expect(editor).toHaveValue('first\na\nb');
 await editor.dispatchEvent('compositionstart');await editor.dispatchEvent('keydown',{key:'Enter'});await editor.dispatchEvent('compositionend');
 await editor.dispatchEvent('keydown',{key:'Enter',isComposing:true});await editor.dispatchEvent('keydown',{key:'Enter',keyCode:229});await editor.dispatchEvent('keydown',{key:'Enter',repeat:true});
 await page.waitForTimeout(1100);expect(mock.writes).toEqual([]);await expect(editor).toBeVisible();await expect(page.locator('#personal-preview')).toBeHidden();
 await page.locator('#personal-save').click();await expect(editor).toBeHidden();expect(mock.writes).toEqual(['first\na\nb']);
 await page.locator('#personal-edit').click();await editor.fill('discard this');page.once('dialog',d=>d.dismiss());await editor.press('Escape');await expect(editor).toHaveValue('discard this');
 page.once('dialog',d=>d.accept());await editor.press('Escape');await expect(editor).toBeHidden();await expect(page.locator('#personal-preview')).toContainText('first');expect(mock.writes).toEqual(['first\na\nb']);
});
test('save failures preserve the editor; retry, deletion and logout clear the right content',async({page})=>{
 const mock=await cloud(page);await page.goto(start);const editor=page.locator('#personal-body');await page.locator('#personal-edit').click();
 mock.fail(true);await editor.fill('unsaved draft');await page.locator('#personal-save').click();await expect(page.locator('#personal-status')).toContainText('failed');await expect(editor).toBeVisible();await expect(editor).toHaveValue('unsaved draft');
 page.once('dialog',dialog=>dialog.dismiss());await page.locator('#next').click();await expect(page).toHaveURL(new RegExp('Q0001'));
 mock.fail(false);await page.locator('#personal-save').click();await expect(page.locator('#personal-status')).toHaveText('Saved');await expect(editor).toBeHidden();expect(mock.writes).toEqual(['unsaved draft']);
 page.once('dialog',dialog=>dialog.accept());await page.locator('#personal-delete').click();await expect(editor).toHaveValue('');await expect(page.locator('#personal-status')).toContainText('deleted');await expect(page.locator('#personal-preview')).not.toContainText('unsaved draft');
 await page.locator('#personal-logout').click();await expect(editor).toBeDisabled();await expect(page.locator('#personal-status')).toContainText('Sign in to save');
 await expect.poll(()=>page.evaluate(key=>localStorage.getItem(key),storageKey)).toBeNull();
});
test('private Markdown blocks active HTML, unsafe links and remote images',async({page})=>{
 const mock=await cloud(page);await page.goto(start);await page.locator('#personal-edit').click();
 const payload='<img src=x onerror="window.privateXss=true">\n\n![tracking](https://tracker.invalid/pixel)\n\n[bad](javascript:alert%281%29)\n\n$\\includegraphics{https://tracker.invalid/math}$\n\n[reference](https://example.com)';
 const remoteRequests:string[]=[];page.on('request',r=>{if(r.url().includes('tracker.invalid'))remoteRequests.push(r.url());});
 await page.locator('#personal-body').fill(payload);await page.locator('#personal-save').click();
 await expect(page.locator('#personal-preview a[href="https://example.com"]')).toHaveAttribute('rel','noopener noreferrer');
 await expect(page.locator('#personal-preview')).toContainText('<img src=x');await expect(page.locator('#personal-preview img')).toHaveCount(0);await expect(page.locator('#personal-preview a[href^="javascript:"]')).toHaveCount(0);
 expect(await page.evaluate(()=>Object.hasOwn(window,'privateXss'))).toBe(false);expect(remoteRequests).toEqual([]);expect(mock.writes).toEqual([payload]);
});
test('account switch clears the previous answer before the next account load',async({page})=>{
 await cloud(page);await page.goto(start);await page.locator('#personal-edit').click();await page.locator('#personal-body').fill('A secret');await page.locator('#personal-save').click();await expect(page.locator('#personal-status')).toHaveText('Saved');
 await page.route('**/rest/v1/personal_answers?**',async route=>{await new Promise(r=>setTimeout(r,400));await route.fulfill({json:[]});});
 await page.evaluate(({key,value})=>{localStorage.setItem(key,JSON.stringify(value));const channel=new BroadcastChannel(key);channel.postMessage({event:'SIGNED_IN',session:value});channel.close();},{key:storageKey,value:session(userB)});
 await expect(page.locator('#personal-body')).toHaveValue('');await expect(page.locator('#personal-body')).toBeEnabled();await expect(page.locator('#personal-preview')).not.toContainText('A secret');await expect(page.locator('#personal-editor')).toBeHidden();
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
test('header account controls and long math notes fit narrow mobile screens',async({page})=>{
 await cloud(page);await page.setViewportSize({width:320,height:844});await page.goto(start);
 await page.locator('#personal-edit').click();await expect(page.locator('#personal-body')).toBeVisible();
 await page.locator('#personal-body').fill('$$\n'+('a+'.repeat(100))+'b\n$$');await page.locator('#personal-save').click();await expect(page.locator('#personal-preview .katex')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#personal-logout').click();await expect(page.locator('.site-header #personal-login')).toBeVisible();
 const login=await page.locator('#personal-login').boundingBox(),brand=await page.locator('.brand').boundingBox();expect(login!.x).toBeGreaterThan(brand!.x+brand!.width);expect(login!.y).toBeLessThan(80);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('expired authentication preserves unsaved text until explicit sign-out',async({page})=>{
 await cloud(page);await page.goto(start);await page.locator('#personal-edit').click();
 await page.route('**/rest/v1/personal_answers?**',route=>route.fulfill({status:401,json:{code:'PGRST301',message:'JWT expired'}}));
 await page.locator('#personal-body').fill('copy this draft');await page.locator('#personal-save').click();
 await expect(page.locator('#personal-status')).toContainText('Sign in required');await expect(page.locator('#personal-body')).toHaveValue('copy this draft');await expect(page.locator('#personal-body')).toHaveAttribute('readonly','');await expect(page.locator('#personal-body')).toBeEnabled();await expect(page.locator('#personal-login')).toBeVisible();
 page.once('dialog',d=>d.accept());await page.locator('#personal-logout').click();await expect(page.locator('#personal-body')).toHaveValue('');
});
test('failed sign-out keeps private content hidden and offers a retry',async({page})=>{
 await cloud(page);await page.goto(start);await page.locator('#personal-edit').click();await page.locator('#personal-body').fill('private');await page.locator('#personal-save').click();await expect(page.locator('#personal-status')).toHaveText('Saved');
 await page.route('**/auth/v1/logout?**',route=>route.fulfill({status:400,json:{message:'test logout failure'}}));
 await page.locator('#personal-logout').click();await expect(page.locator('#personal-status')).toContainText('Sign-out could not');await expect(page.locator('#personal-body')).toHaveValue('');await expect(page.locator('#personal-body')).toBeDisabled();await expect(page.locator('#personal-logout')).toBeVisible();
 await page.route('**/auth/v1/logout?**',route=>route.fulfill({status:204}));await page.locator('#personal-logout').click();await expect(page.locator('#personal-status')).toContainText('Sign in to save');await expect.poll(()=>page.evaluate(key=>localStorage.getItem(key),storageKey)).toBeNull();
});

test('saving waits for acknowledgement and ignores repeated submit actions',async({page})=>{
 await cloud(page);await page.goto(start);await page.locator('#personal-edit').click();
 let finish!:()=>void;const response=new Promise<void>(resolve=>{finish=resolve;});let writes=0;
 await page.route('**/rest/v1/personal_answers?**',async route=>{
  expect(route.request().method()).toBe('POST');writes++;await response;await route.fulfill({json:{body:'pending',updated_at:'2026-10-18T00:00:00Z'}});
 });
 const editor=page.locator('#personal-body');await editor.fill('pending');await page.locator('#personal-save').click();await expect(page.locator('#personal-status')).toHaveText('Saving…');await expect(editor).toBeVisible();await expect(editor).toBeDisabled();
 await editor.dispatchEvent('keydown',{key:'Enter'});await page.locator('#personal-save').dispatchEvent('click');expect(writes).toBe(1);
 finish();await expect(editor).toBeHidden();await expect(page.locator('#personal-status')).toHaveText('Saved');await expect(page.locator('#personal-preview')).toHaveText('pending');
});
test('failed initial load offers reload and never enables an accidental overwrite',async({page})=>{
 const mock=await cloud(page);
 await page.route('**/rest/v1/personal_answers?**',route=>route.fulfill({status:400,json:{message:'load failed'}}));await page.goto(start);
 await expect(page.locator('#personal-status')).toContainText('failed');await expect(page.locator('#personal-edit')).toBeDisabled();await expect(page.locator('#personal-body')).toBeHidden();
 await page.unroute('**/rest/v1/personal_answers?**');await page.locator('#personal-refresh').click();await expect(page.locator('#personal-edit')).toBeEnabled();await page.locator('#personal-edit').click();await expect(page.locator('#personal-body')).toBeVisible();expect(mock.writes).toEqual([]);
});

test('header login fits every locale at a narrow mobile width',async({page})=>{
 await cloud(page,false);await page.setViewportSize({width:320,height:844});
 for(const locale of ['en','zh-TW','ja']){
  await page.goto(`${base}${locale}/questions/Q0001/`);await expect(page.locator('.site-header #personal-login')).toBeEnabled();
  const login=await page.locator('#personal-login').boundingBox(),brand=await page.locator('.brand').boundingBox();
  expect(login!.x).toBeGreaterThan(brand!.x+brand!.width);expect(login!.y).toBeLessThan(80);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 }
});
test('late Markdown module loading cannot restore a note after sign-out',async({page})=>{
 await cloud(page);let release!:()=>void,requested=false;
 const ready=new Promise<void>(resolve=>{release=resolve;});
 await page.route('**/*personal-markdown*',async route=>{requested=true;await ready;await route.continue();});
 await page.goto(start);await page.locator('#personal-edit').click();await page.locator('#personal-body').fill('**private late render**');await page.locator('#personal-save').click();
 await expect.poll(()=>requested).toBe(true);
 await page.locator('#personal-logout').click();await expect(page.locator('#personal-status')).toContainText('Sign in to save');
 const response=page.waitForResponse(r=>r.url().includes('personal-markdown'));release();await response;
 await page.waitForTimeout(150);await expect(page.locator('#personal-preview')).not.toContainText('private late render');await expect(page.locator('#personal-body')).toHaveValue('');
});
