import { expect, test } from "vitest";
import type { PrismaClient } from "@duali/database";
import { createApp } from "./app.js";

test("startup does not wait for the periodic entitlement synchronization", async () => {
  const pending = new Promise<never>(() => undefined);
  const db = {
    vinculo: { findMany: () => pending },
    $disconnect: async () => undefined,
  } as unknown as PrismaClient;
  const app = await createApp(db, {
    NODE_ENV: "development",
    API_HOST: "127.0.0.1",
    API_PORT: 3000,
    APP_ORIGIN: "http://localhost:5001",
    DATABASE_URL: "postgresql://local:local@localhost:5432/local",
    SESSION_HOURS: 8,
  });

  const ready = await Promise.race([
    app.ready().then(() => true),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("startup timeout")), 500),
    ),
  ]);
  expect(ready).toBe(true);
  await app.close();
});
