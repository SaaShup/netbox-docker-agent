import { test, expect } from '@playwright/test';

const resources = [
  { type: 'containers', page: 'containers', key: 'ContainersDeleted' },
  { type: 'images', page: 'images', key: 'ImagesDeleted' },
  { type: 'volumes', page: 'volumes', key: 'VolumesDeleted' },
  { type: 'networks', page: 'networks', key: 'NetworksDeleted' },
  { type: 'build-cache', page: 'info', key: 'CachesDeleted' },
];

for (const resource of resources) {
  test(`${resource.type} prune requires confirmation and reports completion`, async ({ page }) => {
    const requests: object[] = [];
    await page.route(`**/api/engine/${resource.type}/prune`, async route => {
      expect(route.request().method()).toBe('POST');
      requests.push(route.request().postDataJSON());
      await route.fulfill({ json: { [resource.key]: ['deleted-id'], SpaceReclaimed: 1048576 } });
    });
    await page.goto(`/#${resource.page}`);
    await page.locator(`[data-prune="${resource.type}"]`).click();
    await expect(page.locator('#prune-dialog')).toBeVisible();
    expect(requests).toHaveLength(0);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    expect(requests).toHaveLength(0);
    await page.locator(`[data-prune="${resource.type}"]`).click();
    const filters: Record<string, string[]> = {};
    const options: Record<string, unknown> = { filters };
    if (['images', 'volumes', 'build-cache'].includes(resource.type)) {
      await expect(page.locator('#prune-all')).not.toBeChecked();
      options.all = false;
    }
    if (resource.type !== 'volumes') {
      await page.locator('#prune-until').fill('24h'); filters.until = ['24h'];
    } else await expect(page.locator('#prune-until')).not.toBeVisible();
    if (resource.type !== 'build-cache') {
      await page.locator('#prune-label').fill('cleanup=true'); filters.label = ['cleanup=true'];
    } else {
      await expect(page.locator('#prune-label')).not.toBeVisible();
      await page.locator('#prune-storage').fill('4096'); options.keep_storage = 4096;
    }
    await page.locator('#confirm-prune').click();
    await expect(page.locator('#prune-dialog')).not.toBeVisible();
    expect(requests).toEqual([{ data: options }]);
    await expect(page.locator('#modalNotificationTitle')).toHaveText('Prune complete');
    await expect(page.locator('#modalNotificationContent')).toContainText('1.0 MB reclaimed');
  });
}

test('including named volumes requires explicit selection and failures stay visible', async ({ page }) => {
  let submitted: any;
  await page.route('**/api/engine/volumes/prune', async route => {
    submitted = route.request().postDataJSON();
    await route.fulfill({ status: 500, json: { message: 'Engine prune failed' } });
  });
  await page.goto('/#volumes');
  await page.locator('[data-prune="volumes"]').click();
  await expect(page.locator('#prune-description')).toContainText('anonymous');
  await page.locator('#prune-all').check();
  await page.locator('#confirm-prune').click();
  await expect(page.locator('#prune-error')).toHaveText('Engine prune failed');
  expect(submitted).toEqual({ data: { all: true, filters: {} } });
  await expect(page.locator('#prune-dialog')).toBeVisible();
  await expect(page.locator('#confirm-prune')).toBeEnabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.locator('[data-prune="volumes"]').click();
  await expect(page.locator('#prune-all')).not.toBeChecked();
});

test('prune completion notifications dismiss automatically and can be closed with the keyboard', async ({ page }) => {
  await page.clock.install();
  await page.route('**/api/engine/images/prune', route => route.fulfill({
    json: { ImagesDeleted: [{ Deleted: 'unused-image' }], SpaceReclaimed: 1048576 },
  }));
  await page.goto('/#images');
  const notice = page.locator('#modalNotification');
  const prune = async () => {
    await page.locator('[data-prune="images"]').click();
    await page.locator('#confirm-prune').click();
    await expect(page.locator('#modalNotificationTitle')).toHaveText('Prune complete');
    await expect(notice).toBeVisible();
    await expect(page.locator('main')).toHaveAttribute('aria-busy', 'false');
  };
  await prune();
  await page.clock.fastForward(6000);
  await expect(notice).toBeHidden();
  await prune();
  const close = page.getByRole('button', { name: 'Dismiss notification', exact: true });
  await close.focus();
  await page.keyboard.press('Enter');
  await expect(notice).toBeHidden();
});
