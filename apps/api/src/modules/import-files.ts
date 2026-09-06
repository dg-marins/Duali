import ExcelJS from "exceljs";
import { parse } from "csv-parse/sync";
import yauzl from "yauzl";
import { DomainError, type Row } from "../core.js";
export interface Sheet {
  nome: string;
  colunas: string[];
  linhas: { numero: number; dados: Row }[];
}
const MAX_ROWS = 5000,
  MAX_COLS = 200;
async function validateZip(buffer: Buffer) {
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(
      buffer,
      { lazyEntries: true, validateEntrySizes: true },
      (error, zip) => {
        if (error || !zip) {
          reject(new DomainError(422, "XLSX inválido."));
          return;
        }
        let bytes = 0,
          entries = 0,
          done = false;
        const fail = () => {
          if (done) return;
          done = true;
          zip.close();
          reject(
            new DomainError(
              422,
              "XLSX excede limites ou contém arquivo inválido.",
            ),
          );
        };
        zip.on("error", fail);
        zip.on("end", () => {
          if (!done) {
            done = true;
            resolve();
          }
        });
        zip.on("entry", (entry) => {
          if (
            ++entries > 2000 ||
            entry.uncompressedSize > 40 * 1024 * 1024 ||
            entry.generalPurposeBitFlag & 1
          ) {
            fail();
            return;
          }
          if (entry.fileName.endsWith("/")) {
            zip.readEntry();
            return;
          }
          zip.openReadStream(entry, (err, stream) => {
            if (err || !stream) {
              fail();
              return;
            }
            stream.on("error", fail);
            stream.on("data", (chunk: Buffer) => {
              bytes += chunk.length;
              if (bytes > 40 * 1024 * 1024) {
                stream.destroy();
                fail();
              }
            });
            stream.on("end", () => {
              if (!done) zip.readEntry();
            });
          });
        });
        zip.readEntry();
      },
    );
  });
}
function sheet(name: string, rows: unknown[][]): Sheet {
  if (rows.length > MAX_ROWS + 1 || rows.some((r) => r.length > MAX_COLS))
    throw new DomainError(422, "Limite: 5.000 linhas e 200 colunas por aba.");
  const columns = (rows[0] ?? []).map((v) => String(v ?? "").trim());
  if (
    !columns.length ||
    columns.some((c) => !c) ||
    new Set(columns).size !== columns.length
  )
    throw new DomainError(
      422,
      "A primeira linha deve ter cabeçalhos preenchidos e únicos.",
    );
  return {
    nome: name,
    colunas: columns,
    linhas: rows
      .slice(1)
      .map((r, i) => ({
        numero: i + 2,
        dados: Object.fromEntries(
          columns.map((c, index) => [c, r[index] ?? ""]),
        ),
      }))
      .filter((r) => Object.values(r.dados).some((v) => v !== "")),
  };
}
export async function readSpreadsheet(
  filename: string,
  buffer: Buffer,
): Promise<Sheet[]> {
  if (!buffer.length || buffer.length > 10 * 1024 * 1024)
    throw new DomainError(422, "Arquivo vazio ou maior que 10 MB.");
  try {
    if (filename.toLowerCase().endsWith(".csv")) {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
      const first = text.split(/\r?\n/)[0] ?? "";
      const delimiter =
        first.split(";").length > first.split(",").length ? ";" : ",";
      const rows = parse(text, {
        bom: true,
        delimiter,
        skip_empty_lines: false,
        relax_column_count: false,
        max_record_size: 1024 * 1024,
      }) as unknown[][];
      while (rows.length && rows.at(-1)?.every((v) => v === "")) rows.pop();
      return [sheet("CSV", rows)];
    }
    if (!filename.toLowerCase().endsWith(".xlsx"))
      throw new DomainError(422, "Use arquivo XLSX ou CSV UTF-8.");
    await validateZip(buffer);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    if (workbook.worksheets.length > 20)
      throw new DomainError(422, "Limite de 20 abas.");
    return workbook.worksheets
      .filter((ws) => ws.rowCount > 0)
      .map((ws) => {
        if (ws.rowCount > MAX_ROWS + 1 || ws.columnCount > MAX_COLS)
          throw new DomainError(422, "Aba excede limites de linhas/colunas.");
        const rows: unknown[][] = [];
        for (let i = 1; i <= ws.rowCount; i++) {
          const cells: unknown[] = [];
          for (let j = 1; j <= ws.columnCount; j++) {
            const value = ws.getRow(i).getCell(j).value;
            if (value instanceof Date)
              cells.push(value.toISOString().slice(0, 10));
            else if (value && typeof value === "object") {
              if ("formula" in value || "sharedFormula" in value)
                cells.push(
                  "=" +
                    String(
                      "formula" in value ? value.formula : value.sharedFormula,
                    ),
                );
              else if ("richText" in value)
                cells.push(value.richText.map((t) => t.text).join(""));
              else if ("text" in value) cells.push(value.text);
              else cells.push(String("error" in value ? value.error : ""));
            } else cells.push(value ?? "");
          }
          rows.push(cells);
        }
        return sheet(ws.name, rows);
      });
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError(
      422,
      "Não foi possível ler o arquivo. Confira formato, cabeçalhos e codificação UTF-8.",
    );
  }
}
