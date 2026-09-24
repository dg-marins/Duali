import { describe, expect, test } from "vitest";
import {
  buildPersonCreateRequest,
  initialPersonCreateState,
  validateCreateStep,
  type LinkType,
  type PersonCreateState,
} from "./personCreateModel";

function state(type: LinkType = "CLT"): PersonCreateState {
  return structuredClone({
    ...initialPersonCreateState,
    pessoa: { ...initialPersonCreateState.pessoa, nomeCompleto: "Ana Souza" },
    vinculo: {
      ...initialPersonCreateState.vinculo,
      tipo: type,
      unidadeId: "11111111-1111-4111-8111-111111111111",
      dataAdmissao: "2026-09-01",
    },
  });
}

describe("cadastro de pessoa", () => {
  test("produz payload equivalente para pessoa sem vínculo", () => {
    const value = state();
    value.incluirVinculo = false;
    const request = buildPersonCreateRequest(value);
    expect(request).toMatchObject({
      endpoint: "pessoas",
      payload: { nomeCompleto: "Ana Souza", ativa: true },
    });
    expect(request.payload).not.toHaveProperty("vinculo");
  });

  test.each(["CLT", "APRENDIZ", "TRAINEE"] as const)(
    "produz o vínculo %s sem dados de estágio",
    (type) => {
      const request = buildPersonCreateRequest(state(type));
      expect(request.endpoint).toBe("pessoas-com-vinculo");
      expect(request.payload).toMatchObject({
        vinculo: { tipo: type, dataAdmissao: "2026-09-01" },
      });
      expect(request.payload).not.toHaveProperty("estagio");
    },
  );

  test("produz o payload composto de estágio e preserva o Decimal como texto", () => {
    const value = state("ESTAGIO");
    value.estagio = {
      ...value.estagio,
      valorBolsa: "1800.50",
      dataTerminoPrevista: "2028-09-01",
      periodoAcademico: "4º semestre",
    };
    expect(buildPersonCreateRequest(value)).toMatchObject({
      endpoint: "pessoas-com-vinculo",
      payload: {
        estagio: {
          valorBolsa: "1800.50",
          dataTerminoPrevista: "2028-09-01",
          periodicidadeDocumentoMeses: 6,
          tceStatus: "AGUARDANDO_ASSINATURA",
        },
      },
    });
  });

  test("mantém estágio em memória, mas o omite quando o tipo final muda", () => {
    const value = state("ESTAGIO");
    value.estagio.valorBolsa = "1900.00";
    value.vinculo.tipo = "CLT";
    const request = buildPersonCreateRequest(value);
    expect(value.estagio.valorBolsa).toBe("1900.00");
    expect(request.payload).not.toHaveProperty("estagio");
    expect(validateCreateStep(value, "internship")).toEqual({});
  });

  test("valida progressivamente dados pessoais, vínculo e estágio", () => {
    const value = state("ESTAGIO");
    value.pessoa.nomeCompleto = "";
    expect(validateCreateStep(value, "personal")).toHaveProperty(
      "nomeCompleto",
    );
    value.vinculo.unidadeId = "";
    expect(validateCreateStep(value, "link")).toHaveProperty("unidadeId");
    value.estagio.dataTerminoPrevista = "2028-09-02";
    expect(validateCreateStep(value, "internship")).toHaveProperty(
      "dataTerminoPrevista",
    );
  });
});
