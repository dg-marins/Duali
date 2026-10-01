import { describe, expect, it } from "vitest";
import { importStepperFor, stableImportGroups } from "./ImportsPage";

const sheet = { nome: "Dados", colunas: ["Nome"], linhas: 1, previa: [] };

describe("importStepperFor", () => {
  it("represents the generic persisted flow without clickable history", () => {
    expect(
      importStepperFor(null).map((step) => [step.label, step.status]),
    ).toEqual([
      ["Preparação", "current"],
      ["Mapeamento", "upcoming"],
      ["Revisão", "upcoming"],
      ["Resultado", "upcoming"],
    ]);
    expect(
      importStepperFor({
        id: "1",
        nomeArquivo: "dados.csv",
        status: "UPLOAD",
        abas: [sheet],
      }).map((step) => [step.label, step.status]),
    ).toEqual([
      ["Preparação", "complete"],
      ["Mapeamento", "current"],
    ]);
  });

  it("skips mapping for specialized review and result states", () => {
    expect(
      importStepperFor({
        id: "1",
        nomeArquivo: "ferias.xlsx",
        status: "REVISAO",
        abas: [sheet],
      }).map((step) => step.label),
    ).toEqual(["Preparação", "Revisão"]);
    expect(
      importStepperFor({
        id: "1",
        nomeArquivo: "beneficios.xlsx",
        status: "CONFIRMADA",
        abas: [sheet],
      }).map((step) => [step.label, step.status]),
    ).toEqual([
      ["Preparação", "complete"],
      ["Revisão", "complete"],
      ["Resultado", "current"],
    ]);
  });
});

describe("stableImportGroups", () => {
  it("only changes when the effective mapping changes", () => {
    const groups = [{ nome: "Pessoas", dominio: "pessoas", campos: {} }];
    expect(stableImportGroups(groups)).toBe(
      stableImportGroups(structuredClone(groups)),
    );
    expect(
      stableImportGroups([
        {
          nome: "Pessoas",
          dominio: "pessoas",
          campos: { nomeCompleto: { coluna: "Nome" } },
        },
      ]),
    ).not.toBe(stableImportGroups(groups));
  });
});
