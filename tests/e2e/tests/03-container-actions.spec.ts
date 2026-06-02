import { test, expect, Page } from "@playwright/test";
import {
  pullNginx,
  createContainer,
  startContainer,
  waitForState,
  removeContainer,
} from "./helpers";

// P3 — container action buttons drive real operations through the agent and
// the daemon. We click the button in the UI, confirm the notification modal,
// and verify the resulting daemon state via the API.

// Card action buttons are addressed by their onclick handler — the visible
// label is decorated with a font-awesome icon, and "disabled" is a CSS class
// (not the attribute), so role+name matching is unreliable here.
const HANDLER: Record<string, string> = {
  start: "startContainer",
  stop: "stopContainer",
  kill: "killContainer",
  restart: "restartContainer",
};

async function clickCardAction(page: Page, name: string, op: keyof typeof HANDLER): Promise<void> {
  await page.goto("/");
  await page.locator("#nav-containers-btn").click();
  const card = page.locator("#containers-list .card").filter({ hasText: name }).first();
  await expect(card).toBeVisible();
  const button = card.locator(`button[onclick^="${HANDLER[op]}"]`);
  await button.click();
  // The agent populates and shows a notification modal for the operation; its
  // title is set synchronously on click ("Operation <op>").
  await expect(page.locator("#modalNotificationTitle")).toContainText(op);
}

test.describe("container actions via the UI", () => {
  test.beforeAll(async ({ request }) => {
    await pullNginx(request);
  });

  test("Start moves a stopped container to running", async ({ page, request }) => {
    const name = "e2e-start";
    await removeContainer(request, name);
    await createContainer(request, name); // created, not running
    try {
      await clickCardAction(page, name, "start");
      await waitForState(request, name, "running");
    } finally {
      await removeContainer(request, name);
    }
  });

  test("Stop moves a running container to exited", async ({ page, request }) => {
    const name = "e2e-stop";
    await removeContainer(request, name);
    await createContainer(request, name);
    await startContainer(request, name);
    try {
      await clickCardAction(page, name, "stop");
      await waitForState(request, name, "exited");
    } finally {
      await removeContainer(request, name);
    }
  });

  test("Kill moves a running container to exited", async ({ page, request }) => {
    const name = "e2e-kill";
    await removeContainer(request, name);
    await createContainer(request, name);
    await startContainer(request, name);
    try {
      await clickCardAction(page, name, "kill");
      await waitForState(request, name, "exited");
    } finally {
      await removeContainer(request, name);
    }
  });

  test("Restart keeps a running container running", async ({ page, request }) => {
    const name = "e2e-restart";
    await removeContainer(request, name);
    await createContainer(request, name);
    await startContainer(request, name);
    try {
      await clickCardAction(page, name, "restart");
      await waitForState(request, name, "running");
    } finally {
      await removeContainer(request, name);
    }
  });
});
