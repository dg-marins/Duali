import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@duali/database";
import {
  direitoSchema,
  periodoSchema,
  ajusteSchema,
  consumoSchema,
  z,
} from "@duali/shared";
import { DomainError, paramsId, type Row } from "../core.js";
import { registerResource, type Resource } from "./resources.js";
import { balance, synchronize } from "./leave-domain.js";
function immutableLink(data: Row, previous: Row | null) {
  if (previous && data.vinculoId !== previous.vinculoId)
    throw new DomainError(409, "O vínculo histórico é imutável.");
}
const immutable = async () => {
  throw new DomainError(
    409,
    "Registros de ajuste e consumo são históricos. Registre uma compensação ou cancele o período.",
  );
};
export const leaveResources: Resource[] = [
  {
    path: "direitos",
    model: "descansoDireito",
    schema: direitoSchema,
    dates: [
      "dataAquisicao",
      "inicioAquisitivo",
      "fimAquisitivo",
      "prazoConcessivo",
    ],
    filters: ["vinculoId"],
    before: async (_tx, data, previous) => {
      immutableLink(data, previous);
      if (!previous && (data.origem === "AUTOMATICA" || !data.observacoes))
        throw new DomainError(
          422,
          "Direito manual/importado exige origem e justificativa.",
        );
      if (previous) {
        for (const key of [
          "dataAquisicao",
          "inicioAquisitivo",
          "fimAquisitivo",
          "quantidadeDias",
          "origem",
        ])
          if (String(data[key] ?? "") !== String(previous[key] ?? ""))
            throw new DomainError(
              409,
              "Aquisição é histórica. Use ajuste para corrigir dias.",
            );
      }
    },
  },
  {
    path: "periodos",
    model: "descansoPeriodo",
    schema: periodoSchema,
    dates: ["dataInicio", "dataFim"],
    filters: ["vinculoId", "tipo", "status"],
    include: { vinculo: { include: { pessoa: true } } },
    before: async (tx, data, previous) => {
      immutableLink(data, previous);
      const v = await tx.vinculo.findUniqueOrThrow({
        where: { id: String(data.vinculoId) },
      });
      if ((v.tipo === "CLT") !== (data.tipo === "FERIAS"))
        throw new DomainError(
          422,
          "Tipo de período incompatível com o vínculo.",
        );
      if (previous) {
        const consumed = await tx.descansoConsumo.count({
          where: { periodoId: String(previous.id) },
        });
        if (
          consumed &&
          ["dataInicio", "dataFim", "quantidadeDias"].some(
            (key) => String(data[key]) !== String(previous[key]),
          )
        )
          throw new DomainError(
            409,
            "Período consumido deve ser cancelado e substituído para corrigir datas/dias.",
          );
      }
      if (data.status === "CANCELADO" && !data.motivo)
        throw new DomainError(422, "Cancelamento exige motivo.");
      if (data.status === "CONCLUIDO") {
        const sum = previous
          ? await tx.descansoConsumo.aggregate({
              where: { periodoId: String(previous.id) },
              _sum: { quantidadeDias: true },
            })
          : null;
        if (
          Number(sum?._sum.quantidadeDias ?? 0) !== Number(data.quantidadeDias)
        )
          throw new DomainError(
            422,
            "Registre o consumo completo antes de concluir.",
          );
      }
      const overlaps = await tx.descansoPeriodo.count({
        where: {
          vinculoId: String(data.vinculoId),
          status: { not: "CANCELADO" },
          dataInicio: { lte: data.dataFim as Date },
          dataFim: { gte: data.dataInicio as Date },
          ...(previous ? { id: { not: String(previous.id) } } : {}),
        },
      });
      if (overlaps && data.status !== "CANCELADO" && !data.motivo)
        throw new DomainError(
          422,
          "Período sobreposto: informe justificativa para a exceção.",
        );
    },
  },
  {
    path: "ajustes-descanso",
    model: "descansoAjuste",
    schema: ajusteSchema,
    dates: ["dataReferencia"],
    filters: ["vinculoId"],
    before: async (_tx, data, previous, userId) => {
      if (previous) await immutable();
      data.criadoPor = userId;
    },
  },
  {
    path: "consumos",
    model: "descansoConsumo",
    schema: consumoSchema,
    include: { periodo: true, direito: true },
    before: async (tx, data, previous, userId) => {
      if (previous) await immutable();
      const period = await tx.descansoPeriodo.findUniqueOrThrow({
        where: { id: String(data.periodoId) },
        include: { consumos: true },
      });
      if (period.status === "CANCELADO")
        throw new DomainError(422, "Período cancelado não pode ser consumido.");
      const total =
        period.consumos.reduce((sum, c) => sum + Number(c.quantidadeDias), 0) +
        Number(data.quantidadeDias);
      if (total > Number(period.quantidadeDias))
        throw new DomainError(422, "Consumo excede a quantidade do período.");
      if (data.direitoId) {
        const right = await tx.descansoDireito.findUniqueOrThrow({
          where: { id: String(data.direitoId) },
          include: {
            consumos: { where: { periodo: { status: { not: "CANCELADO" } } } },
          },
        });
        if (right.vinculoId !== period.vinculoId)
          throw new DomainError(422, "Direito pertence a outro vínculo.");
        if (right.dataAquisicao > new Date() && !data.motivo)
          throw new DomainError(422, "Antecipação exige motivo.");
        if (
          right.consumos.reduce((sum, c) => sum + Number(c.quantidadeDias), 0) +
            Number(data.quantidadeDias) >
            Number(right.quantidadeDias) &&
          !data.motivo
        )
          throw new DomainError(
            422,
            "Consumo superior ao direito exige motivo.",
          );
      } else if (!data.motivo)
        throw new DomainError(
          422,
          "Consumo sem alocação de direito exige justificativa.",
        );
      const ledger = await balance(tx, period.vinculoId);
      if (ledger.saldo < Number(data.quantidadeDias) && !data.motivo)
        throw new DomainError(422, "Saldo insuficiente: justifique a exceção.");
      data.criadoPor = userId;
    },
  },
];
export function registerLeave(app: FastifyInstance, db: PrismaClient) {
  for (const resource of leaveResources) registerResource(app, db, resource);
  app.get("/api/vinculos/:id/saldo", async (req) => {
    const { id } = paramsId.parse(req.params);
    return balance(db, id);
  });
  app.post("/api/descansos/sincronizar", async (req) => {
    z.object({}).strict().parse(req.body);
    return synchronize(db, req.userId);
  });
}
export async function leaveAlerts(db: PrismaClient) {
  const links = await db.vinculo.findMany({ select: { id: true } });
  const results = await Promise.all(links.map((v) => balance(db, v.id)));
  return results.flatMap((r) =>
    r.alertas.map((mensagem, index) => ({
      id: r.vinculoId + "-" + index,
      vinculoId: r.vinculoId,
      pessoa: r.pessoa,
      unidadeId: r.unidadeId,
      tipo: "DESCANSO",
      mensagem,
      prazo: null,
    })),
  );
}
