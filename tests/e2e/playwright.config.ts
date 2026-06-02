import { defineConfig } from "@playwright/test";

// The UI is behind basic auth and served by the agent. The harness points
// BASE_URL at the running agent (http://agent:1880 on the compose network).
export default defineConfig({
  testDir: "./tests",
  // Generous: tests seed real containers/images and drive a browser, so steps
  // can be slow when the daemon is busy.
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: process.env.BASE_URL || "http://agent:1880",
    httpCredentials: {
      username: process.env.UI_USER || "admin",
      password: process.env.UI_PASS || "saashup",
    },
    ignoreHTTPSErrors: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
