import {test,expect} from '@playwright/test';
test('missing sync config preserves public study, contributions and all locales',async({page})=>{
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));
 for(const locale of ['en','zh-TW','ja']){
  await page.goto(`/${locale}/questions/Q0001/`);await expect(page.locator('#answer-button')).toBeEnabled();
  await expect(page.locator('#personal-login')).toBeDisabled();await expect(page.locator('#personal-body')).toBeDisabled();
  await expect(page.locator('.contribute')).toBeVisible();await page.locator('#answer-button').click();await expect(page.locator('#answer-panel')).toBeVisible();
 }
 expect(errors).toEqual([]);
});
