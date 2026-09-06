import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@duali/database";
import { loginSchema } from "@duali/shared";
import { audit, DomainError, transaction } from "../core.js";
import type { readConfig } from "../config.js";
declare module "fastify" {
  interface FastifyRequest {
    userId: string | null;
    sessionHash: string | null;
  }
}
export const tokenHash = (s: string) =>
  createHash("sha256").update(s).digest("hex");
export async function registerAuth(
  app: FastifyInstance,
  db: PrismaClient,
  config: ReturnType<typeof readConfig>,
) {
  app.decorateRequest("userId", null);
  app.decorateRequest("sessionHash", null);
  const options = {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
  };
  const dummy = await argon2.hash(randomBytes(32).toString("hex"), {
    type: argon2.argon2id,
  });
  app.addHook("onRequest", async (req, reply) => {
    reply.header("Cache-Control", "no-store");
    const path = req.url.split("?")[0];
    if (path === "/health") return;
    if (
      ["POST", "PUT", "PATCH", "DELETE"].includes(req.method) &&
      req.headers.origin !== config.APP_ORIGIN
    )
      throw new DomainError(403, "Origem não autorizada.");
    if (path === "/api/auth/login") return;
    const token = req.cookies.duali_session;
    if (!token) throw new DomainError(401, "Entre para continuar.");
    const session = await db.sessao.findUnique({
      where: { tokenHash: tokenHash(token) },
      include: { usuario: true },
    });
    if (!session || session.expiraEm <= new Date() || !session.usuario.ativo)
      throw new DomainError(401, "Sessão expirada.");
    req.userId = session.usuarioId;
    req.sessionHash = session.tokenHash;
    if (["POST", "PUT", "PATCH", "DELETE"].includes(req.method)) {
      const csrf = req.headers["x-csrf-token"];
      if (
        typeof csrf !== "string" ||
        Buffer.byteLength(csrf) !== Buffer.byteLength(session.csrf) ||
        !timingSafeEqual(Buffer.from(csrf), Buffer.from(session.csrf))
      )
        throw new DomainError(403, "Token CSRF inválido.");
    }
  });
  app.post(
    "/api/auth/login",
    { config: { rateLimit: { max: 10, timeWindow: "15 minutes" } } },
    async (req, reply) => {
      const body = loginSchema.parse(req.body);
      const user = await db.usuario.findUnique({
        where: { email: body.email },
      });
      const valid = await argon2.verify(user?.senhaHash ?? dummy, body.senha);
      if (!user || !valid || !user.ativo) {
        await audit(db, null, "LOGIN_FALHOU", "usuario", null);
        throw new DomainError(401, "E-mail ou senha inválidos.");
      }
      const token = randomBytes(32).toString("hex"),
        csrf = randomBytes(32).toString("hex");
      await transaction(db, async (tx) => {
        const current = await tx.usuario.findUniqueOrThrow({
          where: { id: user.id },
        });
        if (!current.ativo || current.senhaHash !== user.senhaHash)
          throw new DomainError(401, "Credenciais alteradas. Entre novamente.");
        await tx.usuario.update({
          where: { id: user.id },
          data: { ultimoLoginEm: new Date() },
        });
        if (req.cookies.duali_session)
          await tx.sessao.deleteMany({
            where: { tokenHash: tokenHash(req.cookies.duali_session) },
          });
        await tx.sessao.create({
          data: {
            tokenHash: tokenHash(token),
            csrf,
            usuarioId: user.id,
            expiraEm: new Date(Date.now() + config.SESSION_HOURS * 3600000),
          },
        });
        await audit(tx, user.id, "LOGIN", "usuario", user.id);
      });
      reply.setCookie("duali_session", token, {
        ...options,
        maxAge: config.SESSION_HOURS * 3600,
      });
      return {
        usuario: {
          id: user.id,
          nome: user.nome,
          email: user.email,
          perfil: "ADMINISTRADOR",
        },
        csrf,
      };
    },
  );
  app.get("/api/auth/me", async (req) => {
    const session = await db.sessao.findUniqueOrThrow({
      where: { tokenHash: req.sessionHash! },
      include: { usuario: true },
    });
    return {
      usuario: {
        id: session.usuario.id,
        nome: session.usuario.nome,
        email: session.usuario.email,
        perfil: "ADMINISTRADOR",
      },
      csrf: session.csrf,
    };
  });
  app.post("/api/auth/logout", async (req, reply) => {
    await transaction(db, async (tx) => {
      await tx.sessao.deleteMany({ where: { tokenHash: req.sessionHash! } });
      await audit(tx, req.userId, "LOGOUT", "usuario", req.userId);
    });
    reply.clearCookie("duali_session", options);
    return { ok: true };
  });
}
