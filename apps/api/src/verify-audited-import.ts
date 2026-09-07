import "dotenv/config";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { readAuditedWorkbook } from "./modules/audited-import-profiles.js";

const files = process.argv.slice(2).filter((file) => file !== "--");
if (!files.length) {
  console.error("Uso: pnpm verify:audited-import -- <arquivo1.xlsx> [...]");
  process.exitCode = 2;
} else {
  for (const file of files) {
    try {
      const workbook = readAuditedWorkbook(
        basename(file),
        await readFile(file),
      );
      console.log(
        JSON.stringify({
          arquivo: basename(file),
          perfil: workbook?.profile ?? "GENERICO",
          abas:
            workbook?.sheets.map((sheet) => ({
              nome: sheet.nome,
              linhas: sheet.linhas.length,
            })) ?? [],
        }),
      );
    } catch (error) {
      console.error(
        JSON.stringify({
          arquivo: basename(file),
          erro: error instanceof Error ? error.message : "Falha desconhecida",
        }),
      );
      process.exitCode = 1;
    }
  }
}
