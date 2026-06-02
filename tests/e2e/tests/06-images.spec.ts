import { test, expect } from "@playwright/test";
import { pullNginx, pullImage, hasImage } from "./helpers";

// P6 — the Images tab actions: the per-image "Pull" (re-pull) and "Remove"
// buttons drive real operations on the daemon.

test.describe("images tab actions", () => {
  test("Remove deletes an image from the daemon", async ({ page, request }) => {
    await pullImage(request, "busybox", "latest");

    await page.goto("/");
    await page.locator("#nav-images-btn").click();
    const card = page.locator("#images-list .card").filter({ hasText: "busybox" }).first();
    await expect(card).toBeVisible();

    await card.locator('button[onclick^="deleteImage"]').click();
    await expect(page.locator("#modalNotificationTitle")).toContainText("Delete image");

    await expect
      .poll(async () => hasImage(request, "busybox:latest"), { timeout: 20_000 })
      .toBe(false);
  });

  test("Pull re-pulls an existing image (it stays present)", async ({ page, request }) => {
    await pullNginx(request);

    await page.goto("/");
    await page.locator("#nav-images-btn").click();
    const card = page.locator("#images-list .card").filter({ hasText: "nginx" }).first();
    await expect(card).toBeVisible();

    await card.locator('button[onclick^="pullImage"]').click();
    await expect(page.locator("#modalNotificationTitle")).toContainText("Pulling image");

    // give the (forced) pull a moment, then confirm it is still there
    await expect.poll(async () => hasImage(request, "nginx:alpine"), { timeout: 20_000 }).toBe(true);
  });
});
