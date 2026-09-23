import dotenv from "dotenv";
import { Prisma, PrismaClient } from "@duali/database";
import { audit, transaction } from "./core.js";
import {
  generateNextMonthForecasts,
  nextMonth,
} from "./modules/benefit-cycle.js";

dotenv.config({ path: "../../.env" });

const apply = process.argv.includes("--apply");
const db = new PrismaClient();

try {
  const [missingRequested, missingComposition, closedBases] = await Promise.all(
    [
      db.aquisicaoBeneficioItem.count({ where: { valorSolicitado: null } }),
      db.aquisicaoBeneficioItem.count({
        where: { composicao: { equals: Prisma.DbNull } },
      }),
      db.fechamentoCompetenciaBeneficio.findMany({
        where: { status: "FECHADA" },
        select: { unidadeId: true, competencia: true },
        orderBy: [{ competencia: "asc" }, { unidadeId: "asc" }],
      }),
    ],
  );
  const missingForecasts = [];
  for (const base of closedBases) {
    const target = nextMonth(base.competencia);
    const sourceTypes = await db.aquisicaoBeneficio.findMany({
      where: {
        unidadeId: base.unidadeId,
        competencia: base.competencia,
        status: { not: "CANCELADA" },
      },
      distinct: ["tipo"],
      select: { tipo: true },
    });
    for (const { tipo } of sourceTypes) {
      const exists = await db.previsaoBeneficioVersao.count({
        where: {
          unidadeId: base.unidadeId,
          tipo,
          competencia: target,
          vigente: true,
        },
      });
      if (!exists)
        missingForecasts.push({
          unidadeId: base.unidadeId,
          tipo,
          competenciaBase: base.competencia.toISOString().slice(0, 10),
          competenciaDestino: target.toISOString().slice(0, 10),
        });
    }
  }

  let generated = 0;
  let linkedOrders = 0;
  if (apply)
    for (const base of closedBases)
      await transaction(db, async (tx) => {
        const forecasts = await generateNextMonthForecasts(
          tx,
          base.unidadeId,
          base.competencia,
          "BACKFILL_INICIAL",
          null,
        );
        generated += forecasts.length;
        for (const forecast of forecasts) {
          const targetOrders = await tx.aquisicaoBeneficio.findMany({
            where: {
              unidadeId: forecast.unidadeId,
              tipo: forecast.tipo,
              competencia: forecast.competencia,
              status: { not: "CANCELADA" },
              previsaoVersaoId: null,
            },
            select: { id: true },
          });
          if (!targetOrders.length) continue;
          await tx.aquisicaoBeneficio.updateMany({
            where: { id: { in: targetOrders.map((order) => order.id) } },
            data: { previsaoVersaoId: forecast.id },
          });
          if (!forecast.congeladaEm)
            await tx.previsaoBeneficioVersao.update({
              where: { id: forecast.id },
              data: { congeladaEm: new Date() },
            });
          await audit(
            tx,
            null,
            "VINCULAR_PREVISAO_BACKFILL",
            "previsaoBeneficioVersao",
            forecast.id,
            undefined,
            { pedidos: targetOrders.map((order) => order.id) },
          );
          linkedOrders += targetOrders.length;
        }
      });

  console.log(
    JSON.stringify(
      {
        modo: apply ? "APLICACAO_CONTROLADA" : "DIAGNOSTICO_SOMENTE_LEITURA",
        itensPedidoSemValorSolicitado: missingRequested,
        itensPedidoSemComposicao: missingComposition,
        previsoesAusentes: missingForecasts,
        previsoesProcessadas: generated,
        pedidosVinculados: linkedOrders,
      },
      null,
      2,
    ),
  );
} finally {
  await db.$disconnect();
}
