import "./config.js";
import { PrismaClient } from "@duali/database";
import { randomUUID } from "node:crypto";
import argon2 from "argon2";
import { createApp } from "./app.js";
import { readConfig } from "./config.js";
export function testDatabaseUrl() {
  const url = new URL(
    process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL!,
  );
  if (
    !process.env.TEST_DATABASE_URL &&
    ["localhost", "127.0.0.1"].includes(url.hostname) &&
    url.port === "55432"
  )
    url.pathname = "/duali_test";
  if (!url.pathname.endsWith("_test"))
    throw new Error("Tests require a dedicated database ending in _test.");
  return url.toString();
}
export async function fixture() {
  const db = new PrismaClient({ datasourceUrl: testDatabaseUrl() });
  const suffix = randomUUID();
  const senha = randomUUID() + "!Aa9";
  const user = await db.usuario.create({
    data: {
      nome: "Administrador sintético",
      email: suffix + "@example.test",
      senhaHash: await argon2.hash(senha),
    },
  });
  const app = await createApp(db, { ...readConfig(), NODE_ENV: "test" });
  const login = await app.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: { origin: "http://localhost:5173" },
    payload: { email: user.email, senha },
  });
  const cookie = login.cookies[0]!;
  const headers = {
    "content-type": "application/json",
    origin: "http://localhost:5173",
    cookie: cookie.name + "=" + cookie.value,
    "x-csrf-token": login.json<{ csrf: string }>().csrf,
  };
  return { db, app, user, senha, headers, suffix };
}
