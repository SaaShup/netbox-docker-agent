import { test, expect } from "@playwright/test";

// P1 — page loads, no script errors, navigation works, Home renders the host
// info and the system-usage chart.

test.describe("navigation & load", () => {
  test("loads with the expected title and no page errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await page.goto("/");
    await expect(page).toHaveTitle(/Netbox Docker Agent/i);
    expect(errors, "no uncaught JS errors on load").toEqual([]);
  });

  test("Home shows host info and the system-usage chart", async ({ page }) => {
    await page.goto("/");
    // No hash -> the page auto-activates the Home tab.
    await expect(page.locator("#info")).toBeVisible();
    // Host info card is populated from /info.
    await expect(page.locator("#info-list")).toContainText("Agent Version");
    await expect(page.locator("#info-list")).toContainText("Docker Api");
    // ApexCharts renders the usage chart (several SVG layers) into the container.
    await expect(page.locator("#system-usage-chart svg").first()).toBeVisible();
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
