import { basename } from "node:path";
import { readFile } from "node:fs/promises";
import dotenv from "dotenv";
import { PrismaClient } from "@duali/database";
import { model, type Tx } from "./core.js";
import { importResource } from "./modules/imports.js";
import { readGeneralInternList } from "./modules/intern-import-profile.js";

dotenv.config({ path: "../../.env" });
const [filePath, requestedId] = process.argv
  .slice(2)
  .filter((arg) => arg !== "--");
if (!filePath)
  throw new Error("Uso: pnpm verify:intern-import -- <arquivo.xlsx> [lote-id]");

const db = new PrismaClient();
try {
  const parsed = await readGeneralInternList(await readFile(filePath));
  const batch = requestedId
    ? await db.importacao.findUniqueOrThrow({ where: { id: requestedId } })
    : await db.importacao.findFirstOrThrow({
        where: { nomeArquivo: basename(filePath) },
        orderBy: { criadoEm: "desc" },
      });
  const items = await db.importacaoItem.findMany({
    where: { importacaoId: batch.id },
    select: {
      dominio: true,
      status: true,
      acao: true,
      persistidoId: true,
      aba: true,
    },
  });
  const domains = [...new Set(items.map((item) => item.dominio))];
  const persistedByDomain = Object.fromEntries(
    await Promise.all(
      domains.map(async (domain) => {
        const ids = items
          .filter((item) => item.dominio === domain && item.persistidoId)
          .map((item) => item.persistidoId!);
        const existing = ids.length
          ? await model(
              db as unknown as Tx,
              importResource(domain).model,
            ).count({ where: { id: { in: ids } } })
          : 0;
        if (existing !== new Set(ids).size)
          throw new Error(
            `Registros persistidos ausentes no domínio ${domain}.`,
          );
        return [
          domain,
          {
            itens: items.filter((i) => i.dominio === domain).length,
            publicados: existing,
          },
        ];
      }),
    ),
  );
  const counts = (key: string, value: string) =>
    items.filter((item) => item[key as "status" | "acao"] === value).length;
  console.log(
    JSON.stringify(
      {
        lote: batch.id,
        status: batch.status,
        abas: parsed.sheets.map((sheet) => ({
          nome: sheet.nome,
          linhas: sheet.linhas.length,
        })),
        ocorrencias: parsed.records.length,
        movimentacoesSeguro: parsed.movements.length,
        dominios: persistedByDomain,
        publicados: items.filter((item) => item.persistidoId).length,
        pendentes: counts("acao", "PENDENTE"),
        aguardandoDependencia: counts("status", "AGUARDANDO_DEPENDENCIA"),
        rejeitados: counts("acao", "REJEITAR"),
      },
      null,
      2,
    ),
  );
} finally {
  await db.$disconnect();
}
