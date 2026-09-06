import { test, expect } from "vitest";
import { entitlements, addMonthsClamped, periodoSchema } from "./leave.js";
test("anniversary acquisitions clamp leap dates without drift", () => {
  expect(
    addMonthsClamped(new Date("2020-02-29"), 12).toISOString().slice(0, 10),
  ).toBe("2021-02-28");
  const events = entitlements(
    new Date("2020-02-29"),
    "CLT",
    new Date("2024-02-29"),
  );
  expect(events).toHaveLength(4);
  expect(events[3]!.dataAquisicao.toISOString().slice(0, 10)).toBe(
    "2024-02-29",
  );
  expect(events.reduce((n, e) => n + e.quantidadeDias, 0)).toBe(120);
});
test("internship acquisition requires six complete months and stops at termination", () => {
  expect(
    entitlements(new Date("2024-08-31"), "ESTAGIO", new Date("2025-02-27")),
  ).toHaveLength(0);
  expect(
    entitlements(
      new Date("2024-08-31"),
      "ESTAGIO",
      new Date("2026-08-31"),
      new Date("2025-03-01"),
    ),
  ).toHaveLength(1);
});
test("different day counting requires justification", () => {
  expect(
    periodoSchema.safeParse({
      vinculoId: "550e8400-e29b-41d4-a716-446655440000",
      dataInicio: "2026-01-01",
      dataFim: "2026-01-10",
      quantidadeDias: 5,
      tipo: "FERIAS",
    }).success,
  ).toBe(false);
});
