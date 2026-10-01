import { describe, expect, it } from "vitest";
import { requestedTotal, type MonthlyOrderDraft } from "./MonthlyOrderPage";

function draft(values: Partial<MonthlyOrderDraft> = {}): MonthlyOrderDraft {
  return {
    id: "link",
    vinculoId: "link",
    pessoa: "Pessoa teste",
    configuracaoId: "config",
    fornecedores: [],
    incluir: true,
    quantidadeDias: "22.00",
    quantidade: "2.00",
    valorUnitario: "75.00",
    valorMensalBase: "700.00",
    valorSolicitado: "999.99",
    modoAlimentacao: "DIAS_TRABALHADOS",
    motivoAfastado: "",
    transporteItens: [],
    ...values,
  };
}

describe("pedido mensal", () => {
  it.each(["CESTA_BASICA", "PREMIACAO", "OUTRO"])(
    "mantém %s autoritativo por quantidade vezes valor unitário",
    (type) => {
      const row = draft({
        quantidade: "3.00",
        valorUnitario: "12.50",
        valorSolicitado: "999.99",
      });
      expect(requestedTotal(row, type)).toBe("37.50");
    },
  );

  it("preserva os dois modos de alimentação", () => {
    expect(
      requestedTotal(
        draft({ quantidadeDias: "20", valorUnitario: "25.50" }),
        "ALIMENTACAO",
      ),
    ).toBe("510.00");
    expect(
      requestedTotal(
        draft({ modoAlimentacao: "VALOR_MENSAL", valorMensalBase: "700.00" }),
        "ALIMENTACAO",
      ),
    ).toBe("700.00");
  });

  it("preserva transporte com várias conduções e fornecedores", () => {
    expect(
      requestedTotal(
        draft({
          quantidadeDias: "22",
          transporteItens: [
            { tipoConducao: "ONIBUS", fornecedorId: "a", valorDiario: "11.20" },
            { tipoConducao: "METRO", fornecedorId: "b", valorDiario: "15.80" },
          ],
        }),
        "TRANSPORTE",
      ),
    ).toBe("594.00");
  });
});
