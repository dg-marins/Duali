/* global process, URL */
import { spawnSync } from "node:child_process";
const url = new URL(process.env.DATABASE_URL);
if (!["localhost", "127.0.0.1"].includes(url.hostname))
  throw new Error("Local test database required");
url.pathname = "/" + (process.env.GOLDEN_DATABASE_NAME ?? "duali_golden_test");
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  TEST_DATABASE_URL: url.toString(),
  NODE_ENV: "test",
};
const commands = process.argv.slice(2);
for (const command of commands) {
  const result = spawnSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    command.split(" "),
    { env, stdio: "inherit", shell: process.platform === "win32" },
  );
  if (result.status !== 0) process.exit(result.status ?? 1);
}
