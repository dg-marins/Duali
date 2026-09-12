import dotenv from "dotenv";
import { PrismaClient } from "@duali/database";
dotenv.config({ path: "../../.env" });
const db = new PrismaClient();

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return result;
}

const docs = await db.documentoVinculo.findMany({
  where: { tipo: { in: ["TCE", "RENOVACAO"] }, vinculo: { tipo: "ESTAGIO" } },
  select: { id: true, tipo: true, inicioVigencia: true, fimVigencia: true },
});
let updated = 0;
let pending = 0;
for (const doc of docs) {
  if (doc.fimVigencia || !doc.inicioVigencia) {
    if (!doc.inicioVigencia) pending++;
    continue;
  }
  await db.documentoVinculo.update({
    where: { id: doc.id },
    data: { fimVigencia: addMonths(doc.inicioVigencia, 6) },
  });
  updated++;
}
console.log(JSON.stringify({ scanned: docs.length, updated, pending }));
await db.$disconnect();
