import { test, expect } from "@playwright/test";
import { pullNginx, createContainer, startContainer, waitForState, removeContainer } from "./helpers";

// P7 — the notification modal. It pops up for an operation with a title and a
// "please wait" message, then auto-dismisses once the operation completes.

test.describe("operation notifications", () => {
  test.beforeAll(async ({ request }) => {
    await pullNginx(request);
  });

  test("an operation shows the notification modal, then auto-dismisses", async ({ page, request }) => {
    const name = "e2e-notif";
    await removeContainer(request, name);
    await createContainer(request, name);
    await startContainer(request, name);

    try {
      await page.goto("/");
      await page.locator("#nav-containers-btn").click();
      const card = page.locator("#containers-list .card").filter({ hasText: name }).first();
      await expect(card).toBeVisible();

      await card.locator('button[onclick^="stopContainer"]').click();

      const modal = page.locator("#modalNotification");
      await expect(modal).toBeVisible();
      await expect(page.locator("#modalNotificationTitle")).toContainText("stop");
      await expect(page.locator("#modalNotificationContent")).toContainText("ongoing");

      // The agent dismisses the modal once the operation finishes.
      await expect(modal).toBeHidden({ timeout: 12_000 });
      await waitForState(request, name, "exited");
    } finally {
      await removeContainer(request, name);
    }
  });
});
