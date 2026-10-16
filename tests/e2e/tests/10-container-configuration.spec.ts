import { test, expect } from '@playwright/test';

const container = {
  Id: 'config-demo', Name: '/configured-app', Image: 'sha256:config-image',
  State: { Status: 'running' },
  Config: {
    Image: 'app:latest', Hostname: 'app-host', Entrypoint: ['/entrypoint.sh'],
    Cmd: ['serve', '--port=8080'], User: '1000', WorkingDir: '/srv/app',
    Env: ['MODE=production', 'WITH_EQUALS=a=b', 'HOSTILE=<img src=x onerror="window.pwned=1">'],
    Labels: { team: 'platform' }, ExposedPorts: { '8080/tcp': {}, '9090/tcp': {} },
    Healthcheck: { Test: ['CMD', 'healthcheck'], Interval: 30000000000 },
  },
  HostConfig: {
    RestartPolicy: { Name: 'unless-stopped', MaximumRetryCount: 0 },
    PortBindings: { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '18080' }] },
    Memory: 536870912, NanoCpus: 1500000000, CapDrop: ['NET_RAW'],
    ReadonlyRootfs: true, NetworkMode: 'app-net', SecurityOpt: ['no-new-privileges'],
    LogConfig: { Type: 'json-file', Config: { 'max-size': '10m' } },
  },
  NetworkSettings: {
    Ports: { '8080/tcp': [{ HostIp: '127.0.0.1', HostPort: '18080' }] },
    Networks: { 'app-net': { NetworkID: 'network-id', IPAddress: '172.20.0.2', Gateway: '172.20.0.1', Aliases: ['app'] } },
  },
  Mounts: [
    { Type: 'volume', Name: 'app-data', Destination: '/data', RW: true },
    { Type: 'bind', Source: '/etc/app', Destination: '/config', RW: false },
  ],
};

test.beforeEach(async ({ page }) => {
  await page.route('**/api/containers', route => route.fulfill({ json: [container] }));
  await page.goto('/#containers');
});

test('configuration groups show actual settings and render metadata safely', async ({ page }) => {
  const card = page.locator('#containers-list .card');
  const configuration = card.getByRole('button', { name: 'Configuration', exact: true });
  await configuration.click();
  await expect(configuration).toHaveAttribute('aria-pressed', 'true');
  const view = card.locator('.container-configuration');
  await expect(view).toContainText('/entrypoint.sh');
  await expect(view).toContainText('unless-stopped');
  await expect(view).toContainText('/srv/app');
  for (const title of ['Environment', 'Ports', 'Mounts', 'Networks', 'Labels', 'Resources', 'Security', 'Logging', 'Health check']) {
    await view.locator('summary').filter({ hasText: new RegExp(`^${title}$`) }).click();
  }
  for (const text of ['a=b', '127.0.0.1:18080', 'Not published', 'app-data', 'read-only', '172.20.0.2', 'platform', '536870912', '1.5', 'NET_RAW', 'max-size', '10m', 'healthcheck']) {
    await expect(view).toContainText(text);
  }
  await expect(view.locator('img')).toHaveCount(0);
  expect(await page.evaluate(() => Reflect.get(window, 'pwned'))).toBeUndefined();
  await card.getByRole('button', { name: 'Inspect', exact: true }).click();
  await expect(configuration).toHaveAttribute('aria-pressed', 'false');
  await expect(card.locator('.pane pre')).toContainText('app-data');
});

test('configuration editor submits changed supported settings through recreation', async ({ page }) => {
  const card = page.locator('#containers-list .card');
  await card.getByRole('button', { name: 'Configuration', exact: true }).click();
  await card.getByRole('button', { name: 'Edit configuration', exact: true }).click();
  await expect(page.locator('#resource-hint')).toContainText('recreates the container');
  const editor = page.locator('#resource-data');
  const data = JSON.parse(await editor.inputValue());
  expect(data.ContainerID).toBe(container.Id);
  expect(data.mounts[0].volume.name).toBe('app-data');
  expect(data.binds[0].read_only).toBe(true);
  expect(data.env.find((e: { var_name: string }) => e.var_name === 'WITH_EQUALS').value).toBe('a=b');
  data.env.find((e: { var_name: string }) => e.var_name === 'MODE').value = 'staging';
  await editor.fill(JSON.stringify(data));
  await page.route('**/api/engine/containers', route => route.fulfill({ status: 202, json: { data: route.request().postDataJSON().data } }));
  const request = page.waitForRequest(r => r.url().endsWith('/api/engine/containers') && r.method() === 'PUT');
  await page.getByRole('button', { name: 'Submit', exact: true }).click();
  expect((await request).postDataJSON().data).toMatchObject({
    ContainerID: 'config-demo', operation: 'recreate',
    env: expect.arrayContaining([{ var_name: 'MODE', value: 'staging' }]),
  });
  await expect(page.locator('#resource-dialog')).not.toBeVisible();
});

test('action icons retain accessible names and configuration fits mobile screens', async ({ page }) => {
  const card = page.locator('#containers-list .card');
  for (const name of ['start', 'stop', 'Remove', 'Configuration']) {
    const button = card.getByRole('button', { name, exact: true });
    await expect(button.locator('svg')).toHaveAttribute('aria-hidden', 'true');
  }
  await expect(card.getByRole('button', { name: 'start', exact: true })).toHaveClass(/action-positive/);
  await expect(card.getByRole('button', { name: 'Remove', exact: true })).toHaveClass(/action-danger/);
  await page.setViewportSize({ width: 390, height: 844 });
  await card.getByRole('button', { name: 'Configuration', exact: true }).click();
  await card.locator('summary').filter({ hasText: /^Environment$/ }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('the agent has no recreation controls while other containers remain editable', async ({ page }) => {
  const agentContainer = { ...container, Id: 'a'.repeat(64), Name: '/agent' };
  await page.route('**/info', async route => {
    const response = await route.fetch();
    await route.fulfill({ json: { ...await response.json(), containerId: agentContainer.Id.slice(0, 12) } });
  });
  await page.route('**/api/containers', route => route.fulfill({ json: [agentContainer, container] }));
  await page.reload();
  const agent = page.locator('#containers-list .card[data-name="/agent"]');
  await expect(agent.getByRole('button', { name: 'Recreate', exact: true })).toHaveCount(0);
  await agent.getByRole('button', { name: 'Configuration', exact: true }).click();
  await expect(agent).toContainText('The agent cannot recreate its own container.');
  await expect(agent.getByRole('button', { name: 'Edit configuration', exact: true })).toHaveCount(0);
  const app = page.locator('#containers-list .card[data-name="/configured-app"]');
  await app.getByRole('button', { name: 'Recreate', exact: true }).click();
  await expect(page.locator('#resource-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await app.getByRole('button', { name: 'Configuration', exact: true }).click();
  await expect(app.getByRole('button', { name: 'Edit configuration', exact: true })).toBeVisible();
});
