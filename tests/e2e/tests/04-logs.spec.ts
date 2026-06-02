import { test, expect } from "@playwright/test";
import { pullNginx, createContainer, startContainer, removeContainer } from "./helpers";

// P4 — the Logs tab fetches and renders a container's logs.

test.describe("container logs viewer", () => {
  test.beforeAll(async ({ request }) => {
    await pullNginx(request);
  });

  test("Logs tab shows the container's log output", async ({ page, request }) => {
    const name = "e2e-logs";
    await removeContainer(request, name);
    await createContainer(request, name);
    await startContainer(request, name); // nginx writes startup logs

    try {
      await page.goto("/");
      await page.locator("#nav-containers-btn").click();
      const card = page.locator("#containers-list .card").filter({ hasText: name }).first();
      await expect(card).toBeVisible();

      // The Logs tab link triggers logs(); the output lands in the card's <pre>.
      await card.locator('a[onclick^="logs("]').click();
      const pre = card.locator('pre[id^="clogs_"][id$="_pre"]');
      // timestamps=true is requested, so each line is prefixed with an RFC3339 stamp.
      await expect(pre).toContainText(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    } finally {
      await removeContainer(request, name);
    }
  });
});
