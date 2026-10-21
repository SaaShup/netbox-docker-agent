import { test, expect } from '@playwright/test';
test('hostile Docker metadata renders as text and does not execute',async({page})=>{
 await page.route('**/api/containers',route=>route.fulfill({json:[{Id:'hostile',Name:'/<img src=x onerror="window.pwned=1">',Image:'sha256:test',Config:{Image:'<script>window.pwned=1</script>'},State:{Status:'created'},HostConfig:{},NetworkSettings:{},Mounts:[]}]}));
 await page.goto('/');await page.locator('#nav-containers-btn').click();await expect(page.locator('#containers-list')).toContainText('<img src=x');expect(await page.evaluate(()=>Reflect.get(window,'pwned'))).toBeUndefined();await expect(page.locator('#containers-list img')).toHaveCount(0);
});
test('dashboard remains usable on a narrow viewport',async({page})=>{
 await page.setViewportSize({width:390,height:844});await page.goto('/');await page.locator('#nav-containers-btn').click();await expect(page.locator('#containers')).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test('resource creation editor rejects malformed JSON visibly',async({page})=>{
 await page.goto('/#networks');await page.getByRole('button',{name:'Create network'}).click();await page.locator('#resource-data').fill('{bad');await page.getByRole('button',{name:'Submit',exact:true}).click();await expect(page.locator('#error')).toBeVisible();await expect(page.locator('#resource-dialog')).toBeVisible();
});
