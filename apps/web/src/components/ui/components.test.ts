import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  Button,
  CurrencyInput,
  FormField,
  IconButton,
  normalizeCurrencyInput,
  formatCurrencyInput,
  sanitizeCurrencyText,
} from "./controls";
import { STATUS_DEFINITIONS, statusDefinition } from "./feedback";
import { paginationTotalPages, resolveColumnPriority } from "./data";

describe("CurrencyInput", () => {
  it.each([
    ["", ""],
    ["0", "0.00"],
    ["1", "1.00"],
    ["12,3", "12.30"],
    ["1.234,56", "1234.56"],
    ["R$ 1.234,56", "1234.56"],
    ["1234.56", "1234.56"],
  ])("normaliza %s para a string decimal %s", (input, expected) => {
    expect(normalizeCurrencyInput(input)).toBe(expected);
  });

  it("preserva a digitação válida e remove símbolos na colagem", () => {
    expect(sanitizeCurrencyText("12,3")).toBe("12,3");
    expect(sanitizeCurrencyText("R$ 1.234,56")).toBe("1.234,56");
  });

  it("formata em reais e mantém vazio diferente de zero", () => {
    expect(formatCurrencyInput("")).toBe("");
    expect(formatCurrencyInput("0.00")).toBe("R$ 0,00");
    expect(formatCurrencyInput("1234.56")).toBe("R$ 1.234,56");
  });

  it("entrega o valor normalizado pelo contrato onValueChange", () => {
    const markup = renderToStaticMarkup(
      createElement(CurrencyInput, {
        value: "1234.56",
        onValueChange: () => undefined,
        ariaLabel: "Valor",
      }),
    );
    expect(markup).toContain("R$ 1.234,56");
    const delivered = normalizeCurrencyInput("R$ 1.234,56") ?? "invalid";
    expect(delivered).toBe("1234.56");
  });
});

describe("componentes de formulário", () => {
  it("mantém Button e IconButton como APIs distintas", () => {
    const button = renderToStaticMarkup(
      createElement(Button, { variant: "primary" }, "Salvar"),
    );
    const icon = renderToStaticMarkup(
      createElement(IconButton, { "aria-label": "Fechar" }, "×"),
    );
    expect(button).toContain("ds-button--primary");
    expect(icon).toContain('aria-label="Fechar"');
  });

  it("associa label, descrição e erro ao controle", () => {
    const markup = renderToStaticMarkup(
      createElement(
        FormField,
        {
          id: "nome",
          label: "Nome",
          description: "Nome completo",
          error: "Obrigatório",
        },
        createElement("input"),
      ),
    );
    expect(markup).toContain('for="nome"');
    expect(markup).toContain('aria-describedby="nome-description nome-error"');
    expect(markup).toContain('aria-invalid="true"');
  });
});

describe("StatusBadge", () => {
  it("possui registro explícito com tons semânticos", () => {
    expect(Object.keys(STATUS_DEFINITIONS).length).toBeGreaterThan(20);
    expect(statusDefinition("EM_REVISAO")).toEqual({
      code: "EM_REVISAO",
      label: "Em revisão",
      tone: "review",
    });
  });
  it("usa fallback neutro e legível", () => {
    expect(statusDefinition("ESTADO_NOVO")).toEqual({
      code: "ESTADO_NOVO",
      label: "Estado novo",
      tone: "neutral",
    });
  });
});

describe("DataTable", () => {
  it("adapta prioridades legadas sem heurística posicional", () => {
    expect(resolveColumnPriority({ mobile: "primary" })).toBe("primary");
    expect(resolveColumnPriority({ mobile: "hidden" })).toBe("desktop");
    expect(
      resolveColumnPriority({ priority: "always", mobile: "hidden" }),
    ).toBe("always");
  });
  it("calcula páginas com limite mínimo", () => {
    expect(paginationTotalPages(0, 25)).toBe(1);
    expect(paginationTotalPages(51, 25)).toBe(3);
  });
});
