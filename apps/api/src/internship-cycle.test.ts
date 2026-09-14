import { expect, test } from "vitest";
import {
  documentState,
  resolveDocumentCycle,
} from "./modules/internship-cycle.js";

test("document cycle keeps planned, awaiting signature and signed states distinct", () => {
  const now = new Date("2026-08-01T00:00:00.000Z");
  const current = {
    id: "current",
    tipo: "TCE",
    status: "PENDENTE",
    inicioVigencia: new Date("2026-08-01T00:00:00.000Z"),
    fimVigencia: new Date("2027-02-01T00:00:00.000Z"),
  };
  const next = {
    id: "next",
    tipo: "ADITIVO",
    status: "PENDENTE",
    inicioVigencia: new Date("2027-02-01T00:00:00.000Z"),
    fimVigencia: new Date("2027-08-01T00:00:00.000Z"),
  };
  expect(documentState(current, now)).toBe("AGUARDANDO_ASSINATURA");
  expect(documentState(next, now)).toBe("PLANEJADO");
  expect(resolveDocumentCycle([current, next], now)).toMatchObject({
    atual: { id: "current" },
    proximo: { id: "next" },
    sobreposto: false,
  });
});

test("cycle resolver identifies overlapping and unrenewed documents without changing history", () => {
  const now = new Date("2026-08-01T00:00:00.000Z");
  const shared = {
    status: "PENDENTE",
    inicioVigencia: new Date("2026-02-01T00:00:00.000Z"),
    fimVigencia: new Date("2026-09-01T00:00:00.000Z"),
  };
  expect(
    resolveDocumentCycle(
      [
        { id: "tce", tipo: "TCE", ...shared },
        { id: "aditivo", tipo: "ADITIVO", ...shared },
      ],
      now,
    ).sobreposto,
  ).toBe(true);
  expect(
    resolveDocumentCycle(
      [
        {
          id: "expired",
          tipo: "TCE",
          status: "VIGENTE",
          inicioVigencia: new Date("2025-08-01T00:00:00.000Z"),
          fimVigencia: new Date("2026-02-01T00:00:00.000Z"),
        },
      ],
      now,
    ).vencidoSemSucessor,
  ).toBe(true);
});

test("a renewal takes over at the shared boundary without a false overlap", () => {
  const boundary = new Date("2027-02-01T00:00:00.000Z");
  const cycle = resolveDocumentCycle(
    [
      {
        id: "tce",
        tipo: "TCE",
        status: "VIGENTE",
        inicioVigencia: new Date("2026-08-01T00:00:00.000Z"),
        fimVigencia: boundary,
      },
      {
        id: "aditivo",
        tipo: "ADITIVO",
        status: "PENDENTE",
        inicioVigencia: boundary,
        fimVigencia: new Date("2027-08-01T00:00:00.000Z"),
      },
    ],
    boundary,
  );
  expect(cycle).toMatchObject({ atual: { id: "aditivo" }, sobreposto: false });
});
