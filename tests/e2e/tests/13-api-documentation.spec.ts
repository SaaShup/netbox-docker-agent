import { test, expect, Page } from '@playwright/test';

function operation(page: Page, method: string, path: string) {
  return page.locator(`.opblock-${method}`).filter({has:page.locator('.opblock-summary-path').getByText(path,{exact:true})});
}
async function tryOperation(page: Page, method: string, path: string) {
  const block=operation(page,method,path);
  await block.locator('.opblock-summary-control').click();
  await block.getByRole('button',{name:'Try it out',exact:true}).click();
  return block;
}

test('Swagger UI loads all operations locally without script or CSP errors',async({page})=>{
  const errors:string[]=[],external:string[]=[];
  page.on('pageerror',error=>errors.push(error.message));
  const origin=new URL(String(test.info().project.use.baseURL)).origin;
  page.on('request',request=>{if(/^https?:/.test(request.url())&&new URL(request.url()).origin!==origin)external.push(request.url());});
  await page.addInitScript(()=>{
    Reflect.set(window,'cspViolations',[]);
    document.addEventListener('securitypolicyviolation',event=>Reflect.get(window,'cspViolations').push(`${event.violatedDirective}: ${event.blockedURI}`));
  });
  await page.goto('/doc');
  await expect(page.locator('#swagger-ui .opblock').first()).toBeVisible();
  const spec=await(await page.request.get('/openapi.json')).json();
  const count=Object.values(spec.paths).flatMap((methods:any)=>Object.keys(methods).filter(method=>['get','post','put','patch','delete','head'].includes(method))).length;
  await expect(page.locator('#swagger-ui .opblock')).toHaveCount(count);
  await expect(page.getByRole('button',{name:'Authorize',exact:true}).first()).toBeVisible();
  expect(errors).toEqual([]);expect(external).toEqual([]);expect(await page.evaluate(()=>Reflect.get(window,'cspViolations'))).toEqual([]);
  expect(await page.evaluate(()=>({persist:Reflect.get(window,'ui').getConfigs().persistAuthorization,validator:Reflect.get(window,'ui').getConfigs().validatorUrl}))).toEqual({persist:false,validator:null});
});

test('Try it out executes a real authenticated GET and displays its status and response',async({page})=>{
  await page.goto('/doc');
  const block=await tryOperation(page,'get','/info');
  const response=page.waitForResponse(r=>new URL(r.url()).pathname==='/info'&&r.request().method()==='GET');
  await block.getByRole('button',{name:'Execute',exact:true}).click();
  expect((await response).status()).toBe(200);
  await expect(block.locator('.live-responses-table')).toContainText('200');
  await expect(block.locator('.live-responses-table')).toContainText('netbox-saashup-agent');
  await expect(block.locator('.curl-command')).toContainText('/info');
});

test('path parameters produce the correct GET logs request',async({page})=>{
  let requested='';
  await page.route('**/api/engine/containers/swagger-container/logs',route=>{requested=route.request().method();return route.fulfill({contentType:'text/plain',body:'swagger log output'});});
  await page.goto('/doc');const block=await tryOperation(page,'get','/api/engine/containers/{containerId}/logs');
  await block.locator('.parameters-col_description input').fill('swagger-container');
  await block.getByRole('button',{name:'Execute',exact:true}).click();
  await expect(block.locator('.live-responses-table')).toContainText('swagger log output');expect(requested).toBe('GET');
});

test('request bodies are editable and explicit API authorization reaches the request',async({page})=>{
  let submitted:any,authorization:string|undefined;
  await page.route('**/api/engine/networks',route=>{submitted=route.request().postDataJSON();authorization=route.request().headers().authorization;return route.fulfill({status:202,json:submitted});});
  await page.goto('/doc');
  await page.getByRole('button',{name:'Authorize',exact:true}).first().click();
  const dialog=page.locator('.dialog-ux'),auth=dialog.locator('.auth-container').first();
  await auth.locator('input[type="text"]').fill('swagger-user');await auth.locator('input[type="password"]').fill('swagger-password');
  await auth.getByRole('button',{name:'Apply credentials',exact:true}).click();
  await dialog.getByRole('button',{name:'Close',exact:true}).first().click();
  const block=await tryOperation(page,'post','/api/engine/networks');
  const data={data:{name:'swagger-network',driver:'bridge',state:'creating'}};
  await block.locator('textarea.body-param__text').fill(JSON.stringify(data));
  await block.getByRole('button',{name:'Execute',exact:true}).click();
  await expect(block.locator('.live-responses-table')).toContainText('202');
  expect(submitted).toEqual(data);expect(authorization).toBe('Basic '+Buffer.from('swagger-user:swagger-password').toString('base64'));
  expect(await page.evaluate(()=>Object.keys(localStorage))).toEqual([]);
});

test('HTTP failures remain visible with the returned error body',async({page})=>{
  await page.route('**/system/usage',route=>route.fulfill({status:502,json:{message:'Docker engine unavailable'}}));
  await page.goto('/doc');const block=await tryOperation(page,'get','/system/usage');
  await block.getByRole('button',{name:'Execute',exact:true}).click();
  await expect(block.locator('.live-responses-table')).toContainText('502');
  await expect(block.locator('.live-responses-table')).toContainText('Docker engine unavailable');
});

test('query parameters are encoded into the executed request',async({page})=>{
  let sent:URL|undefined;
  await page.route('**/api/engine/endpoint?*',route=>{sent=new URL(route.request().url());return route.fulfill({status:202,json:{}});});
  await page.goto('/doc');const block=await tryOperation(page,'get','/api/engine/endpoint');
  const inputs=block.locator('.parameters-col_description input');
  await inputs.nth(0).fill('https://manager.example.com');await inputs.nth(1).fill('42');await inputs.nth(2).fill('example token');
  await block.getByRole('button',{name:'Execute',exact:true}).click();
  await expect(block.locator('.live-responses-table')).toContainText('202');
  expect(sent?.searchParams.get('url')).toBe('https://manager.example.com');expect(sent?.searchParams.get('id')).toBe('42');expect(sent?.searchParams.get('token')).toBe('example token');
});

test('DELETE operations send the edited JSON request body',async({page})=>{
  let sent:any;
  await page.route('**/api/engine/volumes',route=>{expect(route.request().method()).toBe('DELETE');sent=route.request().postDataJSON();return route.fulfill({status:202,json:sent});});
  await page.goto('/doc');const block=await tryOperation(page,'delete','/api/engine/volumes');
  const data={data:{name:'swagger-volume'}};await block.locator('textarea.body-param__text').fill(JSON.stringify(data));
  await block.getByRole('button',{name:'Execute',exact:true}).click();
  await expect(block.locator('.live-responses-table')).toContainText('202');expect(sent).toEqual(data);
});

test('configuration operations share the single API authorization scheme',async({page})=>{
  let authorization:string|undefined;
  await page.route('**/admin/config',route=>{authorization=route.request().headers().authorization;return route.fulfill({json:{netbox_url:'https://manager.example.com'}});});
  await page.goto('/doc');await page.getByRole('button',{name:'Authorize',exact:true}).first().click();
  const dialog=page.locator('.dialog-ux');await expect(dialog.locator('.auth-container')).toHaveCount(1);
  const auth=dialog.locator('.auth-container');
  await auth.locator('input[type="text"]').fill('dashboard');await auth.locator('input[type="password"]').fill('dashboard-secret');
  await auth.getByRole('button',{name:'Apply credentials',exact:true}).click();await dialog.getByRole('button',{name:'Close',exact:true}).click();
  const block=await tryOperation(page,'get','/admin/config');await block.getByRole('button',{name:'Execute',exact:true}).click();
  await expect(block.locator('.live-responses-table')).toContainText('200');expect(authorization).toBe('Basic '+Buffer.from('dashboard:dashboard-secret').toString('base64'));
});
