import { test, expect, Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
const publicKey = readFileSync(`${__dirname}/../fixtures/ssh-key.pub`, 'utf8').trim();
const key = { id: 'a'.repeat(64), type: 'ssh-ed25519', fingerprint: 'SHA256:test-fingerprint', comment: '<img src=x onerror="window.pwned=1">', options: 'restrict', publicKey };
async function enabled(page: Page, value=true) {
  const info=await(await page.request.get('/info')).json();
  await page.route('**/info', route => route.fulfill({json:{...info,sshKeysEnabled:value}}));
}
test('disabled management does not prompt for credentials or access the mounted file',async({page})=>{
  await enabled(page,false); let contacted=false;
  await page.route('**/api/ssh-keys',route=>{contacted=true;return route.fulfill({status:500});});
  await page.goto('/#ssh-keys');
  await expect(page.locator('#ssh-status')).toContainText('disabled');
  await expect(page.locator('#ssh_num')).toHaveText('0');
  await expect(page.locator('#ssh-unlock-form')).toHaveCount(0); await expect(page.locator('#ssh-management')).toBeHidden();
  expect(contacted).toBe(false);
});

test('keys load automatically with dashboard authentication and render metadata safely',async({page})=>{
  await enabled(page);let requests=0;
  await page.route('**/api/ssh-keys',route=>{requests++;return route.fulfill({json:{account:'hostuser',revision:'b'.repeat(64),keys:[key]}});});
  await page.goto('/#ssh-keys');
  await expect(page.locator('#ssh-status')).toContainText('hostuser');await expect(page.locator('#ssh-keys-list')).toContainText(key.comment);
  await expect(page.locator('#ssh-keys-list img')).toHaveCount(0);expect(await page.evaluate(()=>Reflect.get(window,'pwned'))).toBeUndefined();
  await expect(page.locator('#ssh-keys-list')).toContainText('Restrictions: restrict');
  await expect(page.locator('#ssh_num')).toHaveText('1');
  await expect(page.locator('#ssh-unlock-form, #ssh-password, #ssh-lock')).toHaveCount(0);
  await page.reload();await expect(page.locator('#ssh-management')).toBeVisible();expect(requests).toBe(2);
  expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);
});

test('authentication and file errors allow reloading without a separate sign-in form',async({page})=>{
  await enabled(page);let status=401;
  await page.route('**/api/ssh-keys',route=>route.fulfill({status,json:status===200?{account:'hostuser',revision:'a'.repeat(64),keys:[]}:{message:status===401?'Unauthorized':'Mounted authorized_keys file is unavailable'}}));
  await page.goto('/#ssh-keys');await expect(page.locator('#ssh-error')).toHaveText('Unauthorized');await expect(page.locator('#ssh_num')).toHaveText('—');
  await expect(page.locator('#ssh-management')).toBeHidden();await expect(page.locator('#ssh-unlock-form')).toHaveCount(0);
  status=502;await page.getByRole('button',{name:'Reload keys'}).click();await expect(page.locator('#ssh-error')).toContainText('unavailable');
  status=200;await page.getByRole('button',{name:'Reload keys'}).click();await expect(page.locator('#ssh-management')).toBeVisible();await expect(page.locator('#ssh-error')).toBeHidden();
});

test('add and remove require confirmation, use revisions, refresh keys and show backups',async({page})=>{
  await enabled(page); let keys:typeof key[]=[],revision='0'.repeat(64);const mutations:any[]=[];
  await page.route('**/api/ssh-keys',route=>{
    const request=route.request();
    if(request.method()==='GET')return route.fulfill({json:{account:'hostuser',revision,keys}});
    mutations.push(request.postDataJSON());expect(request.postDataJSON().revision).toBe(revision);
    if(request.method()==='POST'){expect(request.postDataJSON().publicKey).toBe(publicKey);keys=[key];revision='1'.repeat(64);}
    else {expect(request.method()).toBe('DELETE');expect(request.postDataJSON().id).toBe(key.id);keys=[];revision='2'.repeat(64);}
    return route.fulfill({json:{backup:'authorized_keys.agent-backup-test',revision}});
  });
  await page.goto('/#ssh-keys');await expect(page.locator('#ssh-management')).toBeVisible();
  await page.locator('#ssh-public-key').fill(publicKey);
  page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Add public key'}).click();expect(mutations).toHaveLength(0);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Add public key'}).click();
  await expect(page.locator('#ssh-keys-list .card')).toHaveCount(1);await expect(page.locator('#ssh_num')).toHaveText('1');await expect(page.locator('#ssh-public-key')).toHaveValue('');
  await expect(page.locator('#modalNotificationContent')).toContainText('authorized_keys.agent-backup-test');
  page.once('dialog',dialog=>dialog.dismiss());await page.getByRole('button',{name:'Remove key'}).click();expect(mutations).toHaveLength(1);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Remove key'}).click();
  await expect(page.locator('#ssh-keys-list .card')).toHaveCount(0);await expect(page.locator('#ssh_num')).toHaveText('0');expect(mutations).toHaveLength(2);
});

test('stale changes preserve input and can be reloaded before retrying',async({page})=>{
  await enabled(page);let gets=0;
  await page.route('**/api/ssh-keys',route=>{
    if(route.request().method()==='GET'){gets++;return route.fulfill({json:{account:'hostuser',revision:'a'.repeat(64),keys:[]}});}
    return route.fulfill({status:409,json:{message:'SSH keys changed; reload before trying again'}});
  });
  await page.goto('/#ssh-keys');await page.locator('#ssh-public-key').fill(publicKey);
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Add public key'}).click();
  await expect(page.locator('#ssh-error')).toContainText('reload');await expect(page.locator('#ssh-public-key')).toHaveValue(publicKey);
  await expect(page.getByRole('button',{name:'Add public key'})).toBeEnabled();
  await page.getByRole('button',{name:'Reload keys'}).click();await expect(page.locator('#ssh-error')).toBeHidden();expect(gets).toBe(2);
});

test('real mounted host file adds and removes a key through existing dashboard authentication',async({page,request})=>{
  test.skip(process.env.SSH_KEYS_E2E !== '1', 'Opt in only with a temporary mounted file');
  const info=await(await request.get('/info')).json();test.skip(!info.sshKeysEnabled,'Requires an isolated mounted test file');
  await page.goto('/#ssh-keys');await expect(page.locator('#ssh-management')).toBeVisible();
  await page.locator('#ssh-public-key').fill(publicKey);page.once('dialog',dialog=>dialog.accept());
  await page.getByRole('button',{name:'Add public key'}).click();await expect(page.locator('#ssh-keys-list .card')).toHaveCount(1);
  await expect(page.locator('#ssh-keys-list')).toContainText('test-only');
  page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Remove key'}).click();
  await expect(page.locator('#ssh-keys-list .card')).toHaveCount(0);
});


test('SSH management remains usable when Docker resource reads fail',async({page})=>{
  await enabled(page);await page.route('**/api/containers',route=>route.fulfill({status:502,json:{message:'Docker unavailable'}}));
  await page.route('**/api/ssh-keys',route=>route.fulfill({json:{account:'hostuser',revision:'a'.repeat(64),keys:[]}}));
  await page.goto('/#ssh-keys');await expect(page.locator('#ssh-unlock-form')).toHaveCount(0);
  await expect(page.locator('#ssh-status')).toContainText('hostuser');await expect(page.locator('#ssh-management')).toBeVisible();
});


test('SSH menu count loads on Overview and opening the tab refreshes it',async({page})=>{
  await enabled(page);let requests=0;
  await page.route('**/api/ssh-keys',route=>{requests++;return route.fulfill({json:{account:'hostuser',revision:'a'.repeat(64),keys:[key]}});});
  await page.goto('/');await expect(page.locator('#info-list')).toContainText('Agent Version');await expect(page.locator('#ssh_num')).toHaveText('1');expect(requests).toBe(1);
  await page.locator('#nav-ssh-keys-btn').click();await expect(page.locator('#ssh-management')).toBeVisible();await expect.poll(()=>requests).toBe(2);
  await page.getByRole('link',{name:'Overview',exact:true}).click();await page.locator('#nav-ssh-keys-btn').click();
  await expect.poll(()=>requests).toBe(3);
});
