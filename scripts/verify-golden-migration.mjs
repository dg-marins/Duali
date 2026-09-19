/* global process, URL, console */
import { createRequire } from "node:module";
import { readFileSync, readdirSync } from "node:fs";
const require = createRequire(
  new URL("../packages/database/package.json", import.meta.url),
);
const { PrismaClient } = require("@prisma/client");
const base = new URL(process.env.DATABASE_URL);
const admin = new PrismaClient({ datasourceUrl: base.toString() });
const name = process.env.GOLDEN_DATABASE_NAME ?? "duali_golden_test";
if (!["localhost", "127.0.0.1"].includes(base.hostname))
  throw new Error("Migration verification requires local PostgreSQL.");
if (!/^duali_golden_[a-z0-9_]+$/.test(name))
  throw new Error("Use a dedicated duali_golden_* database name.");
await admin.$executeRawUnsafe('CREATE DATABASE "' + name + '"');
base.pathname = "/" + name;
const db = new PrismaClient({ datasourceUrl: base.toString() });
const folder = new URL(
  "../packages/database/prisma/migrations/",
  import.meta.url,
);
try {
  const migrations = readdirSync(folder)
    .filter((name) => /^20/.test(name))
    .sort();
  for (const migration of migrations.filter(
    (name) => name !== "20260916000000_unique_current_employment",
  )) {
    const sql = readFileSync(
      new URL(migration + "/migration.sql", folder),
      "utf8",
    );
    // Prisma raw prepared queries do not accept multi-statement migrations.
    const { execFileSync } = await import("node:child_process");
    execFileSync(
      "docker",
      [
        "exec",
        "-i",
        "duali-db-1",
        "psql",
        "-U",
        "duali",
        "-d",
        name,
        "-v",
        "ON_ERROR_STOP=1",
      ],
      { input: sql, stdio: ["pipe", "pipe", "pipe"] },
    );
  }
  const unit = await db.unidade.create({
    data: { nome: "Upgrade fixture", sigla: "UPGRADE", uf: "RJ" },
  });
  const person = await db.pessoa.create({
    data: { nomeCompleto: "Historical fixture" },
  });
  const old = await db.vinculo.create({
    data: {
      pessoaId: person.id,
      unidadeId: unit.id,
      tipo: "ESTAGIO",
      status: "DESLIGADO",
      dataAdmissao: new Date("2020-01-01"),
      dataDesligamento: new Date("2021-01-01"),
    },
  });
  const current = await db.vinculo.create({
    data: {
      pessoaId: person.id,
      unidadeId: unit.id,
      tipo: "CLT",
      dataAdmissao: new Date("2022-01-01"),
    },
  });
  const { execFileSync } = await import("node:child_process");
  const sql = readFileSync(
    new URL("20260916000000_unique_current_employment/migration.sql", folder),
    "utf8",
  );
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "duali-db-1",
      "psql",
      "-U",
      "duali",
      "-d",
      name,
      "-v",
      "ON_ERROR_STOP=1",
    ],
    { input: sql, stdio: ["pipe", "pipe", "pipe"] },
  );
  if (
    (await db.vinculo.findUniqueOrThrow({ where: { id: old.id } })).status !==
    "DESLIGADO"
  )
    throw new Error("History changed");
  try {
    await db.vinculo.create({
      data: {
        pessoaId: person.id,
        unidadeId: unit.id,
        tipo: "TRAINEE",
        status: "AFASTADO",
        dataAdmissao: new Date("2023-01-01"),
      },
    });
    throw new Error("Duplicate accepted");
  } catch (e) {
    if (e.code !== "P2002") throw e;
  }
  await db.vinculo.update({
    where: { id: current.id },
    data: { status: "DESLIGADO", dataDesligamento: new Date("2023-01-01") },
  });
  await db.vinculo.create({
    data: {
      pessoaId: person.id,
      unidadeId: unit.id,
      tipo: "TRAINEE",
      status: "AFASTADO",
      dataAdmissao: new Date("2023-01-02"),
    },
  });
  console.log(
    "APROVADO: clean database, upgrade fixtures, history preservation and database uniqueness.",
  );
  console.log("Dedicated gate database: " + name);
} finally {
  await db.$disconnect();
  await admin.$disconnect();
}
