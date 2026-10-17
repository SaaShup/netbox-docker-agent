import { test, expect } from "@playwright/test";
import { pullNginx, createContainer, startContainer, removeContainer } from "./helpers";

// P5 — the in-browser exec features:
//  - the "Exec" tab runs a one-shot command (HTTP) and shows stdout, and
//  - the "Terminal" tab opens an interactive xterm.js console over the
//    websocket exec channel.

test.describe("container exec & terminal", () => {
  test.beforeAll(async ({ request }) => {
    await pullNginx(request);
  });

  test("Exec tab runs a command and shows its output", async ({ page, request }) => {
    const name = "e2e-exec";
    await removeContainer(request, name);
    await createContainer(request, name);
    await startContainer(request, name);

    try {
      await page.goto("/");
      await page.locator("#nav-containers-btn").click();
      const card = page.locator("#containers-list .card").filter({ hasText: name }).first();
      await expect(card).toBeVisible();

      await card.getByRole("button", {name:"Exec", exact:true}).click();
      const pane = card.locator(".pane");
      await pane.getByRole("textbox", {name:"Command"}).fill("echo ui-exec-test");
      await pane.getByRole("button", {name:"Run command"}).click();

      await expect(pane.locator("pre")).toContainText("ui-exec-test");
    } finally {
      await removeContainer(request, name);
    }
  });

  test("Terminal tab opens an interactive shell and echoes a command", async ({ page, request }) => {
    const cspErrors: string[] = [];
    page.on('console', msg => { if (msg.text().includes('Content Security Policy')) cspErrors.push(msg.text()); });
    const name = "e2e-term";
    await removeContainer(request, name);
    await createContainer(request, name);
    await startContainer(request, name);

    try {
      await page.goto("/");
      await page.locator("#nav-containers-btn").click();
      const card = page.locator("#containers-list .card").filter({ hasText: name }).first();
      await expect(card).toBeVisible();

      await card.getByRole("button", {name:"Terminal", exact:true}).click();
      const pane = card.locator(".pane");
      // nginx:alpine has /bin/sh, not /bin/bash.
      await pane.getByRole("combobox", {name:"Shell"}).selectOption("/bin/sh");
      await pane.getByRole("button", {name:"Open terminal"}).click();

      // xterm defers rendering offscreen terminals, including its accessible
      // text rows. Visibility assertions alone do not scroll into view.
      const rows = card.locator(".terminal-screen");
      await rows.scrollIntoViewIfNeeded();
      await expect(rows).toBeVisible({ timeout: 20_000 });
      // Wait for the shell prompt before typing, or early keystrokes are
      // dropped before the PTY is ready.
      await expect(rows).toContainText("#", { timeout: 20_000 });

      await card.locator(".terminal-screen").click();
      await page.keyboard.type("echo term-xyz", { delay: 60 });
      await page.keyboard.press("Enter");

      await expect(rows).toContainText("term-xyz", { timeout: 15_000 });
      expect(cspErrors).toEqual([]);
    } finally {
      await removeContainer(request, name);
    }
  });
});
