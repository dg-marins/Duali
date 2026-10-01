import { describe, expect, it } from "vitest";
import { buildRecordPayload } from "./components";
import { screens } from "./resources";

describe("RecordForm payload compatibility", () => {
  it("preserva conversões de vazio, número e checkbox", () => {
    const screen = screens.find((item) => item.path === "unidades")!;
    expect(
      buildRecordPayload(screen, {
        nome: "Unidade Centro",
        sigla: "CTR",
        cidade: "",
        uf: "RJ",
        diasAlerta: "30",
        ativa: false,
      }),
    ).toMatchObject({
      nome: "Unidade Centro",
      sigla: "CTR",
      cidade: null,
      uf: "RJ",
      diasAlerta: 30,
      ativa: false,
    });
  });

  it("omite senha vazia durante edição de usuário", () => {
    const screen = screens.find((item) => item.path === "usuarios")!;
    expect(
      buildRecordPayload(screen, {
        nome: "Administrador",
        email: "admin@example.test",
        senha: "",
        ativo: true,
      }),
    ).toEqual({
      nome: "Administrador",
      email: "admin@example.test",
      ativo: true,
    });
  });

  it("mantém nova senha no payload quando informada", () => {
    const screen = screens.find((item) => item.path === "usuarios")!;
    expect(
      buildRecordPayload(screen, {
        nome: "Administrador",
        email: "admin@example.test",
        senha: "senha-segura-123",
        ativo: true,
      }),
    ).toEqual({
      nome: "Administrador",
      email: "admin@example.test",
      senha: "senha-segura-123",
      ativo: true,
    });
  });
});
