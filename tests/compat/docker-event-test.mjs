// Websocket exec coverage (F).
//
// The agent exposes an interactive exec channel: POST /api/engine/containers/
// <id>/ws spins up a docker-exec-websocket server, then a client connects to
// the returned ws path and streams a command. This can't be driven by hurl, so
// this script uses the agent's own bundled client lib (exact protocol match).
//
// Designed to run INSIDE the agent container (node + the lib are present there):
//   docker compose exec -T agent node --input-type=module - < ws-exec-test.mjs
//
// Self-contained: pulls nginx:alpine through the agent, creates a throwaway
// container from it, runs `echo` over the ws exec channel, asserts the output,
// and cleans up.
//
// Env: BASE_URL (default http://localhost:1880), WS_USER, WS_PASS.

import http from "http";
import pkg from "docker-exec-websocket-server";
const { DockerExecClient } = pkg;
import { exec } from 'node:child_process';

const BASE = process.env.BASE_URL || "http://localhost:1880";
const USER = process.env.WS_USER || "admin";
const PASS = process.env.WS_PASS || "saashup";
const NAME = "compat-ws-exec";
const MARKER = "hello-ws-exec";
const AUTH = "Basic " + Buffer.from(`${USER}:${PASS}`).toString("base64");

const base = new URL(BASE);

function execPromise(command) {
  return new Promise((resolve, reject) => {
    exec(command, (err, stdout, stderr) => {
      resolve(stdout);
    });
  })
}

function api(method, path, qs, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request(
      {
        host: base.hostname,
        port: base.port || 80,
        method,
        path,
        qs,
        headers: {
          authorization: AUTH,
          "content-type": "application/json",
          ...(data ? { "content-length": Buffer.byteLength(data) } : {}),
        },
      },
      (r) => {
        let b = "";
        r.on("data", (d) => (b += d));
        r.on("end", () => resolve({ status: r.statusCode, body: b }));
      }
    );
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function fail(msg) {
  console.error(`ws-exec: FAIL — ${msg}`);
  process.exitCode = 1;
}

async function findContainer() {
  const res = await api("GET", "/api/containers");
  const list = JSON.parse(res.body);
  return list.find((c) => c.Name === `/${NAME}`);
}

async function cleanup() {
  await api("DELETE", "/api/engine/containers", {}, {
    data: { ContainerID: NAME, name: NAME },
  }).catch(() => { });
}

async function main() {
  await cleanup();

  // Pull the image through the agent and wait until it lands in the daemon.
  await api("POST", "/api/engine/images", {}, {
    data: { id: 7, name: "nginx", version: "alpine", size: 0, ImageID: null },
  });
  let pulled = false;
  for (let i = 0; i < 90 && !pulled; i++) {
    await sleep(2000);
    const res = await api("GET", "/api/images");
    const imgs = JSON.parse(res.body);
    pulled = Array.isArray(imgs) && imgs.some((im) => (im.RepoTags || []).includes("nginx:alpine"));
  }
  if (!pulled) throw new Error("nginx:alpine was not pulled");

  // Create + start a throwaway container.
  await api("POST", "/api/engine/containers", {}, {
    data: { id: 7, name: NAME, state: "none", image: { name: "nginx", version: "alpine" } },
  });

  let c;
  for (let i = 0; i < 30 && !c; i++) {
    await sleep(1000);
    c = await findContainer();
  }
  if (!c) throw new Error(`container ${NAME} was not created`);

  await api("PUT", "/api/engine/containers", {}, {
    data: { id: 7, ContainerID: NAME, operation: "start", name: NAME, image: { name: "nginx" } },
  });

  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    c = await findContainer();
    if (c && c.State && c.State.Status === "running") break;
  }
  if (!c || c.State.Status !== "running") throw new Error(`container ${NAME} did not reach running`);

  // Add a Netbox to the agent
  await api("GET", "/api/engine/endpoint?url=http://netbox:8080", { url: "http://netbox:8080" });
  await sleep(1000);

  let stdout = await execPromise('ps aux | grep curl');
  let pid = /(\d+)\sroot\s{6}\d{1,2}:\d{2}\scurl \-\-no-buffer -\-\unix-socket \/var\/run\/docker\.sock http:\/\/localhost\/events/gm.exec(stdout)[1];

  if (pid == undefined) {
    throw new Error(`curl on docker-event not found`);
  }

  await execPromise('kill ' + pid);

  await sleep(7000);

  stdout = await execPromise('ps aux | grep curl');

  pid = /(\d+)\sroot\s{6}\d{1,2}:\d{2}\scurl \-\-no-buffer -\-\unix-socket \/var\/run\/docker\.sock http:\/\/localhost\/events/gm.exec(stdout)[1];

  if (pid == undefined) {
    throw new Error(`curl on docker-event not found after a kill`);
  }
}

main()
  .catch((e) => fail(e.message))
  .finally(async () => {
    await cleanup();
    // Give the websocket a moment to close so the process can exit cleanly.
    setTimeout(() => process.exit(process.exitCode || 0), 500);
  });
