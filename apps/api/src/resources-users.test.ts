import { expect, test } from "vitest";
import { fixture } from "./test-helper.js";

test("edição de usuário preserva senha vazia e revoga sessões somente quando necessário", async () => {
  const f = await fixture();
  const email = `${f.suffix}@users-resource.test`;
  const originalPassword = "SenhaOriginal!2026";
  const newPassword = "SenhaAtualizada!2026";
  try {
    const created = await f.app.inject({
      method: "POST",
      url: "/api/usuarios",
      headers: f.headers,
      payload: {
        nome: "Usuário de regressão",
        email,
        senha: originalPassword,
        ativo: true,
      },
    });
    expect(created.statusCode).toBe(201);
    const userId = created.json<{ id: string }>().id;

    const login = await f.app.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: { origin: f.headers.origin },
      payload: { email, senha: originalPassword },
    });
    expect(login.statusCode).toBe(200);
    expect(await f.db.sessao.count({ where: { usuarioId: userId } })).toBe(1);

    const unchangedPassword = await f.app.inject({
      method: "PUT",
      url: `/api/usuarios/${userId}`,
      headers: f.headers,
      payload: {
        nome: "Usuário de regressão editado",
        email,
        ativo: true,
      },
    });
    expect(unchangedPassword.statusCode).toBe(200);
    expect(await f.db.sessao.count({ where: { usuarioId: userId } })).toBe(1);

    const changedPassword = await f.app.inject({
      method: "PUT",
      url: `/api/usuarios/${userId}`,
      headers: f.headers,
      payload: {
        nome: "Usuário de regressão editado",
        email,
        senha: newPassword,
        ativo: true,
      },
    });
    expect(changedPassword.statusCode).toBe(200);
    expect(await f.db.sessao.count({ where: { usuarioId: userId } })).toBe(0);

    expect(
      (
        await f.app.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: { origin: f.headers.origin },
          payload: { email, senha: newPassword },
        })
      ).statusCode,
    ).toBe(200);
  } finally {
    await f.app.close();
  }
});
