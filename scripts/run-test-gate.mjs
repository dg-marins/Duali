import { createHash } from "node:crypto";
import { existsSync, openSync, closeSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import process from "node:process";
import { URL } from "node:url";

const allowedGates = new Map([
  ["vitest", ["node_modules/vitest/vitest.mjs", "run"]],
  ["playwright", ["node_modules/@playwright/test/cli.js", "test"]],
]);

function envFileDatabaseUrl() {
  if (!existsSync(".env")) return undefined;
  return readFileSync(".env", "utf8")
    .split(/\r?\n/)
    .find((line) => line.startsWith("DATABASE_URL="))
    ?.slice("DATABASE_URL=".length);
}

function parseUrl(value, label) {
  if (!value) return undefined;
  try {
    return new URL(value);
  } catch {
    throw new Error(`${label} is not a valid URL.`);
  }
}

function resolveTestDatabase() {
  const envDatabase = parseUrl(
    process.env.DATABASE_URL ?? envFileDatabaseUrl(),
    "DATABASE_URL",
  );
  const explicitTest = parseUrl(
    process.env.TEST_DATABASE_URL,
    "TEST_DATABASE_URL",
  );
  const developmentName = envDatabase
    ? decodeURIComponent(envDatabase.pathname.slice(1))
    : undefined;
  const testDatabase = explicitTest ?? envDatabase;
  if (!testDatabase) throw new Error("A test database URL is required.");

  if (!explicitTest) {
    if (
      !["localhost", "127.0.0.1"].includes(testDatabase.hostname) ||
      testDatabase.port !== "55432"
    ) {
      throw new Error(
        "DATABASE_URL cannot be classified as the local Duali test environment.",
      );
    }
    testDatabase.pathname = "/duali_test";
  }

  const databaseName = decodeURIComponent(testDatabase.pathname.slice(1));
  if (testDatabase.protocol !== "postgresql:")
    throw new Error("Only PostgreSQL test databases are allowed.");
  if (!["localhost", "127.0.0.1"].includes(testDatabase.hostname))
    throw new Error("Only explicitly approved local test hosts are allowed.");
  if (testDatabase.port !== "55432")
    throw new Error("Only the local PostgreSQL test port 55432 is allowed.");
  if (!databaseName || !databaseName.endsWith("_test"))
    throw new Error("The database name must be non-empty and end in _test.");
  if (developmentName && databaseName === developmentName)
    throw new Error(
      "The test database must differ from the development database.",
    );

  return testDatabase.toString();
}

function runNode(args, env) {
  const result = spawnSync(process.execPath, args, {
    env,
    stdio: "inherit",
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

const [gate, ...forwardedArgs] = process.argv.slice(2);
const gateArgs = allowedGates.get(gate);
if (!gateArgs) throw new Error("Expected gate vitest or playwright.");

const repository = resolve(".");
const lockName = createHash("sha256")
  .update(repository)
  .digest("hex")
  .slice(0, 16);
const lockPath = resolve(tmpdir(), `duali-test-gate-${lockName}.lock`);
let lock;
try {
  lock = openSync(lockPath, "wx");
} catch {
  throw new Error(
    `Another Duali test gate may be running. Remove the stale lock manually only after confirming no suite is active: ${lockPath}`,
  );
}

try {
  const databaseUrl = resolveTestDatabase();
  const env = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    TEST_DATABASE_URL: databaseUrl,
    NODE_ENV: "test",
  };
  const resetStatus = runNode(
    [
      "packages/database/node_modules/prisma/build/index.js",
      "migrate",
      "reset",
      "--force",
      "--skip-generate",
      "--schema",
      "packages/database/prisma/schema.prisma",
    ],
    env,
  );
  if (resetStatus !== 0) process.exitCode = resetStatus;
  else process.exitCode = runNode([...gateArgs, ...forwardedArgs], env);
} finally {
  if (lock !== undefined) closeSync(lock);
  rmSync(lockPath, { force: true });
}
