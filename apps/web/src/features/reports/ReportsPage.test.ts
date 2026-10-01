import { describe, expect, it } from "vitest";
import { REPORT_DEFINITIONS } from "./ReportsPage";

describe("report definitions", () => {
  it("keeps all six report contracts and their declared responsive strategies", () => {
    expect(Object.keys(REPORT_DEFINITIONS)).toEqual([
      "pessoas",
      "estagios",
      "descansos",
      "beneficios",
      "aquisicoes-beneficios",
      "inconsistencias",
    ]);
    expect(
      Object.fromEntries(
        Object.entries(REPORT_DEFINITIONS).map(([key, value]) => [
          key,
          value.strategy,
        ]),
      ),
    ).toEqual({
      pessoas: "expandable",
      estagios: "expandable",
      descansos: "scroll",
      beneficios: "scroll",
      "aquisicoes-beneficios": "scroll",
      inconsistencias: "expandable",
    });
  });

  it("aligns every financial report column without changing its label", () => {
    for (const kind of ["beneficios", "aquisicoes-beneficios"] as const) {
      const financial = REPORT_DEFINITIONS[kind].columns.filter(
        (column) => column.format === "money",
      );
      expect(financial.length).toBeGreaterThan(0);
      expect(financial.every((column) => column.label === column.key)).toBe(
        true,
      );
    }
  });
});
