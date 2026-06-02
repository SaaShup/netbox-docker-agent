import { APIRequestContext, expect } from "@playwright/test";

// Seed/inspect helpers that drive the agent's HTTP API directly, so the UI
// specs can set up state and verify side effects without going through the UI.
// The `request` fixture inherits baseURL + httpCredentials from the config.

const IMAGE = { name: "nginx", version: "alpine" };

export async function pullNginx(request: APIRequestContext): Promise<void> {
  await request.post("/api/engine/images", {
    data: { data: { id: 1, name: IMAGE.name, version: IMAGE.version, size: 0, ImageID: null } },
  });
  await expect
    .poll(
      async () => {
        const imgs = await (await request.get("/api/images")).json();
        return imgs.some((i: any) => (i.RepoTags || []).includes("nginx:alpine"));
      },
      { timeout: 120_000, intervals: [2000] }
    )
    .toBe(true);
}

export async function listContainers(request: APIRequestContext): Promise<any[]> {
  return (await request.get("/api/containers")).json();
}

export async function findContainer(request: APIRequestContext, name: string): Promise<any | undefined> {
  return (await listContainers(request)).find((c: any) => c.Name === `/${name}`);
}

export async function createContainer(request: APIRequestContext, name: string): Promise<void> {
  await request.post("/api/engine/containers", {
    data: { data: { id: 1, name, state: "none", image: IMAGE } },
  });
  await expect
    .poll(async () => Boolean(await findContainer(request, name)), { timeout: 30_000 })
    .toBe(true);
}

export async function operation(request: APIRequestContext, name: string, op: string): Promise<void> {
  await request.put("/api/engine/containers", {
    data: { data: { id: 1, ContainerID: name, operation: op, name, image: { name: IMAGE.name } } },
  });
}

export async function waitForState(request: APIRequestContext, name: string, status: string): Promise<void> {
  await expect
    .poll(async () => (await findContainer(request, name))?.State?.Status, { timeout: 30_000 })
    .toBe(status);
}

export async function startContainer(request: APIRequestContext, name: string): Promise<void> {
  await operation(request, name, "start");
  await waitForState(request, name, "running");
}

export async function removeContainer(request: APIRequestContext, name: string): Promise<void> {
  await request.delete("/api/engine/containers", {
    data: { data: { id: 1, ContainerID: name, name } },
  });
}
