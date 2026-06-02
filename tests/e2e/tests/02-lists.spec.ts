import { test, expect } from "@playwright/test";
import { pullNginx, createContainer, removeContainer } from "./helpers";

// P2 — resource lists render real state. We seed via the agent API, then
// assert the UI reflects it.

test.describe("resource lists reflect real state", () => {
  test.beforeAll(async ({ request }) => {
    await pullNginx(request);
  });

  test("a seeded container appears in the Containers list with the right count", async ({
    page,
    request,
  }) => {
    const name = "e2e-list-container";
    await removeContainer(request, name);
    await createContainer(request, name);

    try {
      await page.goto("/");
      await page.locator("#nav-containers-btn").click();

      await expect(page.locator("#containers-list")).toContainText(name);
      // The section count badge is the number of containers.
      const count = (await (await request.get("/api/containers")).json()).length;
      await expect(page.locator("#containers-count")).toHaveText(String(count));
    } finally {
      await removeContainer(request, name);
    }
  });

  test("the pulled image appears in the Images list", async ({ page }) => {
    await page.goto("/");
    await page.locator("#nav-images-btn").click();
    await expect(page.locator("#images-list")).toContainText("nginx");
  });

  test("default networks appear in the Networks list", async ({ page }) => {
    await page.goto("/");
    await page.locator("#nav-networks-btn").click();
    await expect(page.locator("#networks-list")).toContainText("bridge");
  });
});
