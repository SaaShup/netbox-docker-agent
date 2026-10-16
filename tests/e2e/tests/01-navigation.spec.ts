import { test, expect } from "@playwright/test";

// P1 — page loads, no script errors, navigation works, Home renders the host
// info and the system-usage chart.

test.describe("navigation & load", () => {
  test("loads with the expected title and no page errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/");
    await expect(page).toHaveTitle(/^Docker Agent$/);
    expect(errors, "no uncaught JS errors on load").toEqual([]);
  });

  test("Home shows host info and the system-usage chart", async ({ page }) => {
    await page.goto("/");
    // No hash -> the page auto-activates the Home tab.
    await expect(page.locator("#info")).toBeVisible();
    await expect(page.getByText("ENGINE CONTROL CENTER", { exact: true })).toHaveCount(0);
    await expect(page.locator("#summary article")).toHaveCount(4);
    // Host info card is populated from /info.
    await expect(page.locator("#info-list")).toContainText("Agent Version");
    await expect(page.locator("#info-list")).toContainText("Docker Api");
    // Disk usage remains visible below the resource summary.
    await expect(page.locator("#system-usage-chart progress").first()).toBeVisible();
  });

  for (const { btn, section } of [
    { btn: "nav-containers-btn", section: "containers" },
    { btn: "nav-images-btn", section: "images" },
    { btn: "nav-networks-btn", section: "networks" },
    { btn: "nav-volumes-btn", section: "volumes" },
  ]) {
    test(`tab "${section}" shows its section and hides the others`, async ({ page }) => {
      await page.goto("/");
      await page.locator(`#${btn}`).click();
      await expect(page.locator(`#${section}`)).toBeVisible();
      await expect(page.locator("#info")).toBeHidden();
    });
  }

  test("nav badges reflect the resource counts", async ({ page, request }) => {
    const containers = await (await request.get("/api/containers")).json();
    await page.goto("/");
    await expect(page.locator("#containers_num")).toHaveText(String(containers.length));
  });
});


for (const sample of [
  {name:'days and sub-day durations', uptime:{system:183845.9,agent:65.8},system:'2d 3h 4m 5s',agent:'0h 1m 5s'},
  {name:'zero uptime',uptime:{system:0,agent:0},system:'0h 0m 0s',agent:'0h 0m 0s'},
  {name:'unavailable uptime',uptime:{system:null,agent:-1},system:'—',agent:'—'},
]) test(`Overview formats ${sample.name}`,async({page})=>{
  const info=await(await page.request.get('/info')).json();
  await page.route('**/info',route=>route.fulfill({json:{...info,uptime:sample.uptime}}));
  await page.goto('/');
  await expect(page.locator('#info-list dt').filter({hasText:/^System uptime$/}).locator('+ dd')).toHaveText(sample.system);
  await expect(page.locator('#info-list dt').filter({hasText:/^Agent uptime$/}).locator('+ dd')).toHaveText(sample.agent);
});
