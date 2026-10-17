import { test, expect } from "@playwright/test";

test("images and volumes show their containers and update after refresh", async ({ page }) => {
  const container = (name: string, status: string, image: string, mounts: object[]) => ({
    Id: name, Name: `/${name}`, Image: image, State: { Status: status },
    Config: { Image: "app:latest" }, Mounts: mounts,
  });
  let containers = [
    container("web", "running", "sha256:original", [{ Type: "volume", Name: "shared-data" }]),
    container("worker", "exited", "sha256:original", [{ Type: "volume", Name: "shared-data" }]),
    container("other", "running", "sha256:retagged", [{ Type: "bind", Name: "unused-data" }]),
  ];
  await page.route("**/info", route => route.fulfill({ json: {
    version: "2.0.0", docker: { Version: "29.5.2" }, configured: "nok",
  } }));
  await page.route("**/system/usage", route => route.fulfill({ json: {
    images: { size: 0 }, containers: { size_rootfs: 0 }, volumes: 0, build_cache: 0,
  } }));
  await page.route("**/api/*", route => {
    const resource = new URL(route.request().url()).pathname.split("/").pop();
    const resources = {
      containers,
      images: [
        { Id: "sha256:original", RepoTags: ["app:previous"] },
        { Id: "sha256:retagged", RepoTags: ["app:latest"] },
        { Id: "sha256:unused", RepoTags: ["unused:latest"] },
      ],
      volumes: { Volumes: [{ Name: "shared-data" }, { Name: "unused-data" }] },
      networks: [], registries: [],
    };
    return route.fulfill({ json: resources[resource as keyof typeof resources] });
  });

  await page.goto("/#images");
  const imageUsage = page.locator("#images-list .card").filter({ hasText: "app:previous" }).locator(".resource-usage");
  await expect(imageUsage).toContainText("Used by");
  await expect(imageUsage.locator("li")).toHaveText(["web (running)", "worker (exited)"]);
  await expect(page.locator("#images-list .card").filter({ hasText: "app:latest" }).locator(".resource-usage li")).toHaveText(["other (running)"]);
  await expect(page.locator("#images-list .card").filter({ hasText: "unused:latest" })).toContainText("No containers");

  await page.locator("#nav-volumes-btn").click();
  const volumeUsage = page.locator("#volumes-list .card").filter({ hasText: "shared-data" }).locator(".resource-usage");
  await expect(volumeUsage.locator("li")).toHaveText(["web (running)", "worker (exited)"]);
  await expect(page.locator("#volumes-list .card").filter({ hasText: "unused-data" })).toContainText("No containers");

  containers = [];
  await page.reload();
  await expect(volumeUsage).toContainText("No containers");
  await page.locator("#nav-images-btn").click();
  await expect(imageUsage).toContainText("No containers");
});
