import { test, expect } from "vitest";
import { fixture } from "./test-helper.js";
import { exportRows, safeCell } from "./modules/reporting.js";
import ExcelJS from "exceljs";
test("exports preserve text without executing spreadsheet formulas", async () => {
  expect(safeCell('  =HYPERLINK("unsafe")')).toBe('\'  =HYPERLINK("unsafe")');
  const rows = [{ Nome: "=1+1", Valor: 20 }];
  const csv = await exportRows(rows, "csv");
  expect(csv.toString("utf8")).toContain("'=1+1");
  const xlsx = await exportRows(rows, "xlsx"),
    wb = new ExcelJS.Workbook();
  await wb.xlsx.load(xlsx as unknown as ExcelJS.Buffer);
  expect(wb.worksheets[0]!.getCell("A2").value).toBe("'=1+1");
});
test("report filters and export authentication and audit", async () => {
  const f = await fixture();
  try {
    expect(
      (await f.app.inject("/api/exportacoes/pessoas/csv")).statusCode,
    ).toBe(401);
    const response = await f.app.inject({
      url: "/api/exportacoes/pessoas/csv?q=" + f.suffix,
      headers: f.headers,
    });
    expect(response.statusCode, response.body).toBe(200);
    expect(response.headers["content-disposition"]).toContain("attachment");
    expect(
      await f.db.auditoria.count({
        where: { usuarioId: f.user.id, acao: "EXPORTAR" },
      }),
    ).toBe(1);
    const report = await f.app.inject({
      url: "/api/relatorios/pessoas?q=" + f.suffix,
      headers: f.headers,
    });
    expect(report.json<{ total: number }>().total).toBe(0);
    const dashboard = await f.app.inject({
      url: "/api/dashboard",
      headers: f.headers,
    });
    expect(dashboard.statusCode).toBe(200);
  } finally {
    await f.app.close();
  }
});
