import Fastify, { LogController } from "fastify";
import cookie from "@fastify/cookie";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { PrismaClient, Prisma } from "@duali/database";
import { z } from "@duali/shared";
import { readConfig } from "./config.js";
import { DomainError } from "./core.js";
import { registerAuth } from "./modules/auth.js";
import { registerPeople } from "./modules/resources.js";
import { registerInternship, internshipAlerts } from "./modules/internship.js";
import { registerLeave, leaveAlerts } from "./modules/leave.js";
import { synchronize } from "./modules/leave-domain.js";
import { registerBenefits, benefitAlerts } from "./modules/benefits.js";
import { registerImports } from "./modules/imports.js";
import { registerReporting } from "./modules/reporting.js";
import { registerOperational } from "./modules/operational.js";
export async function createApp(
  db = new PrismaClient(),
  config = readConfig(),
) {
  const app = Fastify({
    logger:
      config.NODE_ENV === "test"
        ? false
        : {
            redact: [
              "req.headers.cookie",
              "req.headers.authorization",
              "res.headers.set-cookie",
            ],
          },
    logController: new LogController({ disableRequestLogging: true }),
    trustProxy: ["127.0.0.1", "::1"],
    bodyLimit: 1048576,
  });
  await app.register(cookie);
  await app.register(helmet);
  await app.register(rateLimit, { global: false });
  app.setErrorHandler((error, req, reply) => {
    if (error instanceof z.ZodError)
      return reply.code(422).send({
        error: {
          code: "VALIDATION",
          message: "Confira os campos informados.",
          fields: error.flatten(),
        },
      });
    if (error instanceof DomainError)
      return reply
        .code(error.status)
        .send({ error: { code: "DOMAIN", message: error.message } });
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002")
        return reply.code(409).send({
          error: {
            code: "CONFLICT",
            message: "Já existe registro com estes dados únicos.",
          },
        });
      if (["P2003", "P2025"].includes(error.code))
        return reply.code(422).send({
          error: {
            code: "REFERENCE",
            message: "Registro relacionado inválido ou inexistente.",
          },
        });
      if (error.code === "P2034")
        return reply.code(409).send({
          error: {
            code: "CONFLICT",
            message:
              "Dados alterados simultaneamente. Recarregue e tente novamente.",
          },
        });
    }
    const candidate =
      error instanceof Error && "statusCode" in error ? error.statusCode : 500;
    const status =
      typeof candidate === "number" && candidate >= 400 && candidate < 500
        ? candidate
        : 500;
    if (status === 500)
      app.log.error(
        {
          requestId: req.id,
          errorType: error instanceof Error ? error.name : "Unknown",
        },
        "Falha interna",
      );
    return reply.code(status).send({
      error: {
        code: status === 429 ? "RATE_LIMIT" : "REQUEST",
        message:
          status === 429
            ? "Muitas tentativas. Aguarde antes de tentar novamente."
            : status === 500
              ? "Não foi possível concluir a operação."
              : "Requisição inválida.",
      },
    });
  });
  await registerAuth(app, db, config);
  app.get("/health", async (_req, reply) => {
    try {
      await db.$queryRaw`SELECT 1`;
      return { status: "ok" };
    } catch {
      return reply.code(503).send({ status: "unavailable" });
    }
  });
  registerPeople(app, db);
  registerInternship(app, db);
  registerLeave(app, db);
  registerBenefits(app, db);
  await registerImports(app, db);
  registerReporting(app, db);
  registerOperational(app, db);
  app.get("/api/alertas", async () => [
    ...(await internshipAlerts(db)),
    ...(await leaveAlerts(db)),
    ...(await benefitAlerts(db)),
  ]);
  app.addHook("onClose", async () => {
    await db.$disconnect();
  });
  if (config.NODE_ENV !== "test") {
    let timer: ReturnType<typeof setInterval> | undefined;
    app.addHook("onReady", async () => {
      await synchronize(db, null);
      timer = setInterval(() => {
        void synchronize(db, null).catch(() =>
          app.log.error("Falha na aquisição periódica de direitos"),
        );
      }, 3600000);
      timer.unref();
    });
    app.addHook("onClose", async () => {
      if (timer) clearInterval(timer);
    });
  }
  return app;
}
