import { defineConfig } from "@playwright/test";
import { testDatabaseUrl } from "./apps/api/src/test-helper.js";
process.env.DATABASE_URL = testDatabaseUrl();
process.env.NODE_ENV = "test";
process.env.API_PORT = "3300";
process.env.APP_ORIGIN = "http://localhost:5179";
process.env.API_PROXY_TARGET = "http://127.0.0.1:3300";
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
export default defineConfig({
  testDir: "apps/api/e2e",
  workers: 1,
  timeout: 60000,
  use: {
    baseURL: "http://localhost:5179",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: "node apps/api/dist/server.js",
      url: "http://127.0.0.1:3300/health",
      reuseExistingServer: false,
      timeout: 30000,
    },
    {
      command: pnpm + " --filter @duali/web dev --port 5179 --strictPort",
      url: "http://localhost:5179",
      reuseExistingServer: false,
      timeout: 30000,
    },
  ],
});
