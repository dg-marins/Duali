import { describe, expect, it } from "vitest";
import { comparisonRows } from "./AuditPage";

describe("audit comparison", () => {
  it("keeps fields found on either side and preserves the existing display semantics", () => {
    expect(
      comparisonRows({
        dadosAnteriores: { nome: "Antes", removido: "Sim" },
        dadosNovos: { nome: "Depois", incluido: "Novo" },
      }),
    ).toEqual([
      { id: "nome", Campo: "nome", Antes: "Antes", Depois: "Depois" },
      { id: "removido", Campo: "removido", Antes: "Sim", Depois: "—" },
      { id: "incluido", Campo: "incluido", Antes: "—", Depois: "Novo" },
    ]);
  });
});
