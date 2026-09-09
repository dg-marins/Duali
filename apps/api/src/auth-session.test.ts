import { expect, test } from "vitest";
import { fixture } from "./test-helper.js";

test("sessões válidas, expiradas, revogadas e de usuário inativo são distintas", async () => {
  const f = await fixture();
  try {
    expect(
      (await f.app.inject({ url: "/api/pessoas", headers: f.headers }))
        .statusCode,
    ).toBe(200);

    const invalidLogin = await f.app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: f.headers.origin },
      payload: { email: f.user.email, senha: "senha-incorreta" },
    });
    expect(invalidLogin.statusCode).toBe(401);
    expect(invalidLogin.json()).toMatchObject({
      error: { code: "DOMAIN", message: "E-mail ou senha inválidos." },
    });

    await f.db.sessao.updateMany({
      where: { usuarioId: f.user.id },
      data: { expiraEm: new Date(Date.now() - 1000) },
    });
    const expired = await f.app.inject({
      url: "/api/pessoas",
      headers: f.headers,
    });
    expect(expired.statusCode).toBe(401);
    expect(expired.json()).toMatchObject({
      error: { code: "DOMAIN", message: "Sessão expirada." },
    });

    await f.db.sessao.updateMany({
      where: { usuarioId: f.user.id },
      data: { expiraEm: new Date(Date.now() + 60_000) },
    });
    await f.db.usuario.update({
      where: { id: f.user.id },
      data: { ativo: false },
    });
    expect(
      (await f.app.inject({ url: "/api/pessoas", headers: f.headers }))
        .statusCode,
    ).toBe(401);

    await f.db.usuario.update({
      where: { id: f.user.id },
      data: { ativo: true },
    });
    await f.db.sessao.deleteMany({ where: { usuarioId: f.user.id } });
    expect(
      (await f.app.inject({ url: "/api/pessoas", headers: f.headers }))
        .statusCode,
    ).toBe(401);
  } finally {
    await f.app.close();
  }
});

test("logout válido revoga a sessão e expira o cookie", async () => {
  const f = await fixture();
  try {
    const response = await f.app.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: f.headers,
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    expect(await f.db.sessao.count({ where: { usuarioId: f.user.id } })).toBe(
      0,
    );
    expect(response.headers["set-cookie"]).toMatch(/duali_session=;/);
  } finally {
    await f.app.close();
  }
});
