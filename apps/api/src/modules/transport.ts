import type { FastifyInstance } from "fastify";
import { Prisma, type PrismaClient } from "@duali/database";
import {
  cartaoTransporteSchema,
  transporteCompetenciaSchema,
  transporteItemInputSchema,
  z,
} from "@duali/shared";
import {
  audit,
  dateData,
  DomainError,
  transaction,
  type Row,
  type Tx,
} from "../core.js";

const updateItemsSchema = z
  .object({
    items: z
      .array(
        transporteItemInputSchema.extend({ id: z.string().uuid().optional() }),
      )
      .max(100),
  })
  .strict();
const snapshotInputSchema = z
  .object({
    tipoConducao: z.enum(["ONIBUS", "ONIBUS_INTER", "BARCA", "METRO"]),
    cartaoTransporteId: z.string().uuid(),
    valorDiario: z.coerce
      .number()
      .finite()
      .min(0)
      .max(9999999999.99)
      .multipleOf(0.01),
  })
  .strict();
const updateCompetenceSchema = z
  .object({
    quantidadeDias: z.coerce
      .number()
      .finite()
      .min(0)
      .max(99999)
      .multipleOf(0.01)
      .optional(),
    valorInformado: z.coerce
      .number()
      .finite()
      .min(0)
      .max(9999999999.99)
      .multipleOf(0.01)
      .nullable()
      .optional(),
    observacoes: z.string().trim().max(5000).nullable().optional(),
    itens: z.array(snapshotInputSchema).max(100).optional(),
  })
  .strict();

function monthEnd(month: Date) {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
}
async function benefitFor(tx: Tx, id: string) {
  const benefit = await tx.beneficioVinculo.findUnique({
    where: { id },
    include: { vinculo: true },
  });
  if (!benefit) throw new DomainError(404, "Benefício não encontrado.");
  if (benefit.tipo !== "TRANSPORTE")
    throw new DomainError(422, "O benefício informado não é de transporte.");
  return benefit as Row;
}
async function validateCard(tx: Tx, id: string) {
  const card = await tx.cartaoTransporte.findUnique({ where: { id } });
  if (!card || !card.ativo)
    throw new DomainError(422, "Selecione um cartão de transporte ativo.");
  return card;
}
async function ensureConfig(tx: Tx, benefit: Row, configuracaoId: string) {
  const config = await tx.configuracaoBeneficio.findUnique({
    where: { id: configuracaoId },
  });
  if (
    !config ||
    !config.ativa ||
    config.tipo !== "TRANSPORTE" ||
    config.unidadeId !== String((benefit.vinculo as Row).unidadeId)
  )
    throw new DomainError(
      422,
      "Configuração de transporte incompatível com o vínculo.",
    );
  return config;
}
export function transportCalculation(row: Row): Row {
  const days = new Prisma.Decimal(String(row.quantidadeDias ?? 0));
  const items = (row.transporteItens ?? []) as Row[];
  const byCard = new Map<string, Prisma.Decimal>(),
    byType = new Map<string, Prisma.Decimal>();
  let daily = new Prisma.Decimal(0);
  for (const item of items) {
    const value = new Prisma.Decimal(String(item.valorDiario));
    daily = daily.plus(value);
    const card = String(
      (item.cartaoTransporte as Row | undefined)?.nome ??
        item.cartaoNome ??
        item.cartaoTransporteId,
    );
    byCard.set(card, (byCard.get(card) ?? new Prisma.Decimal(0)).plus(value));
    const type = String(item.tipoConducao);
    byType.set(type, (byType.get(type) ?? new Prisma.Decimal(0)).plus(value));
  }
  const monthly = daily.times(days).toDecimalPlaces(2);
  const adjustments = ((row.ajustes ?? []) as Row[]).reduce(
    (sum, item) =>
      item.tipo === "CREDITO"
        ? sum.plus(String(item.valor))
        : sum.minus(String(item.valor)),
    new Prisma.Decimal(0),
  );
  const final = monthly.plus(adjustments).toDecimalPlaces(2);
  return {
    ...row,
    transporteTotalDiario: daily.toFixed(2),
    transporteTotalMensal: monthly.toFixed(2),
    transportePorCartaoDiario: Object.fromEntries(
      [...byCard].map(([key, value]) => [key, value.toFixed(2)]),
    ),
    transportePorCartaoMensal: Object.fromEntries(
      [...byCard].map(([key, value]) => [
        key,
        value.times(days).toDecimalPlaces(2).toFixed(2),
      ]),
    ),
    transportePorConducaoDiario: Object.fromEntries(
      [...byType].map(([key, value]) => [key, value.toFixed(2)]),
    ),
    transportePorConducaoMensal: Object.fromEntries(
      [...byType].map(([key, value]) => [
        key,
        value.times(days).toDecimalPlaces(2).toFixed(2),
      ]),
    ),
    valorBaseCalculado: monthly.toFixed(2),
    valorCalculado: monthly.toFixed(2),
    totalAjustes: adjustments.toFixed(2),
    valorFinal: final.toFixed(2),
    divergencia:
      row.valorInformado != null
        ? new Prisma.Decimal(String(row.valorInformado)).minus(final).toFixed(2)
        : null,
  };
}
export function registerTransport(app: FastifyInstance, db: PrismaClient) {
  app.get("/api/cartoes-transporte", async () =>
    db.cartaoTransporte.findMany({
      where: { ativo: true },
      orderBy: { nome: "asc" },
    }),
  );
  app.post("/api/cartoes-transporte", async (req, reply) => {
    const body = cartaoTransporteSchema.parse(req.body);
    const result = await transaction(db, async (tx) => {
      const row = await tx.cartaoTransporte.create({ data: body });
      await audit(
        tx,
        req.userId,
        "CRIAR",
        "cartaoTransporte",
        row.id,
        undefined,
        row,
      );
      return row;
    });
    reply.code(201);
    return result;
  });
  app.put("/api/cartoes-transporte/:id", async (req) => {
    const id = z
      .string()
      .uuid()
      .parse((req.params as { id: string }).id);
    const body = cartaoTransporteSchema.parse(req.body);
    return transaction(db, async (tx) => {
      const before = await tx.cartaoTransporte.findUnique({ where: { id } });
      if (!before)
        throw new DomainError(404, "Cartão de transporte não encontrado.");
      const row = await tx.cartaoTransporte.update({
        where: { id },
        data: body,
      });
      await audit(
        tx,
        req.userId,
        "ALTERAR",
        "cartaoTransporte",
        id,
        before,
        row,
      );
      return row;
    });
  });
  app.get("/api/beneficios-vinculo/:id/transporte", async (req) => {
    const id = z
      .string()
      .uuid()
      .parse((req.params as { id: string }).id);
    return db.beneficioTransporteItem.findMany({
      where: { beneficioVinculoId: id },
      include: { cartaoTransporte: true },
      orderBy: [{ ativo: "desc" }, { inicioVigencia: "desc" }],
    });
  });
  app.put("/api/beneficios-vinculo/:id/transporte", async (req) => {
    const id = z
      .string()
      .uuid()
      .parse((req.params as { id: string }).id);
    const body = updateItemsSchema.parse(req.body);
    return transaction(db, async (tx) => {
      await benefitFor(tx, id);
      const existing = await tx.beneficioTransporteItem.findMany({
        where: { beneficioVinculoId: id, ativo: true },
      });
      const incomingIds = new Set(
        body.items.flatMap((item) => (item.id ? [item.id] : [])),
      );
      for (const old of existing.filter((item) => !incomingIds.has(item.id))) {
        const row = await tx.beneficioTransporteItem.update({
          where: { id: old.id },
          data: { ativo: false, fimVigencia: new Date() },
        });
        await audit(
          tx,
          req.userId,
          "ALTERAR",
          "beneficioTransporteItem",
          old.id,
          old,
          row,
        );
      }
      const rows = [];
      for (const item of body.items) {
        await validateCard(tx, item.cartaoTransporteId);
        const data = dateData(item, ["inicioVigencia", "fimVigencia"]);
        const row = item.id
          ? await tx.beneficioTransporteItem.update({
              where: { id: item.id },
              data: { ...data, beneficioVinculoId: id } as never,
              include: { cartaoTransporte: true },
            })
          : await tx.beneficioTransporteItem.create({
              data: { ...data, beneficioVinculoId: id } as never,
              include: { cartaoTransporte: true },
            });
        rows.push(row);
        await audit(
          tx,
          req.userId,
          item.id ? "ALTERAR" : "CRIAR",
          "beneficioTransporteItem",
          row.id,
          undefined,
          row,
        );
      }
      return rows;
    });
  });
  app.post("/api/competencias-transporte", async (req, reply) => {
    const body = transporteCompetenciaSchema.parse(req.body);
    const result = await transaction(db, async (tx) => {
      const benefit = await benefitFor(tx, body.beneficioVinculoId);
      const benefitId = String(benefit.id);
      const config = await ensureConfig(tx, benefit, body.configuracaoId);
      const month = new Date(body.competencia);
      const closing = await tx.fechamentoCompetenciaBeneficio.findUnique({
        where: {
          unidadeId_competencia: {
            unidadeId: String((benefit.vinculo as Row).unidadeId),
            competencia: month,
          },
        },
      });
      if (closing?.status === "FECHADA")
        throw new DomainError(
          409,
          "Reabra a competência antes de alterar lançamentos.",
        );
      const activeItems = await tx.beneficioTransporteItem.findMany({
        where: {
          beneficioVinculoId: benefitId,
          ativo: true,
          inicioVigencia: { lte: month },
          OR: [
            { fimVigencia: null },
            { fimVigencia: { gte: monthEnd(month) } },
          ],
        },
        include: { cartaoTransporte: true },
      });
      if (!activeItems.length)
        throw new DomainError(
          422,
          "Configure ao menos um transporte vigente antes de gerar a competência.",
        );
      const competence = await tx.beneficioCompetencia.create({
        data: {
          beneficioVinculoId: benefitId,
          configuracaoId: config.id,
          componente: "Transporte",
          competencia: month,
          quantidadeDias: body.quantidadeDias,
          ...(body.valorInformado !== undefined
            ? { valorInformado: body.valorInformado }
            : {}),
          status: body.status,
          ...(body.observacoes !== undefined
            ? { observacoes: body.observacoes }
            : {}),
          transporteRevisaoPendente: false,
        },
        include: { ajustes: true },
      });
      for (const item of activeItems)
        await tx.beneficioTransporteCompetenciaItem.create({
          data: {
            competenciaId: competence.id,
            origemItemId: item.id,
            tipoConducao: item.tipoConducao,
            cartaoTransporteId: item.cartaoTransporteId,
            valorDiario: item.valorDiario,
          },
        });
      await audit(
        tx,
        req.userId,
        "CRIAR",
        "beneficioCompetencia",
        competence.id,
        undefined,
        competence,
      );
      return tx.beneficioCompetencia.findUniqueOrThrow({
        where: { id: competence.id },
        include: {
          transporteItens: { include: { cartaoTransporte: true } },
          ajustes: true,
        },
      });
    });
    reply.code(201);
    return transportCalculation(result);
  });
  app.put("/api/competencias-transporte/:id", async (req) => {
    const id = z
      .string()
      .uuid()
      .parse((req.params as { id: string }).id);
    const body = updateCompetenceSchema.parse(req.body);
    return transaction(db, async (tx) => {
      const before = await tx.beneficioCompetencia.findUnique({
        where: { id },
        include: {
          beneficioVinculo: { include: { vinculo: true } },
          transporteItens: true,
        },
      });
      if (!before) throw new DomainError(404, "Competência não encontrada.");
      if (before.beneficioVinculo.tipo !== "TRANSPORTE")
        throw new DomainError(422, "A competência não é de transporte.");
      const closing = await tx.fechamentoCompetenciaBeneficio.findUnique({
        where: {
          unidadeId_competencia: {
            unidadeId: before.beneficioVinculo.vinculo.unidadeId,
            competencia: before.competencia,
          },
        },
      });
      if (closing?.status === "FECHADA")
        throw new DomainError(
          409,
          "Reabra a competência antes de alterar lançamentos.",
        );
      await tx.beneficioCompetencia.update({
        where: { id },
        data: {
          ...(body.quantidadeDias !== undefined
            ? { quantidadeDias: body.quantidadeDias }
            : {}),
          ...(body.valorInformado !== undefined
            ? { valorInformado: body.valorInformado }
            : {}),
          ...(body.observacoes !== undefined
            ? { observacoes: body.observacoes }
            : {}),
        },
        include: {
          transporteItens: { include: { cartaoTransporte: true } },
          ajustes: true,
        },
      });
      if (body.itens) {
        await tx.beneficioTransporteCompetenciaItem.deleteMany({
          where: { competenciaId: id },
        });
        for (const item of body.itens) {
          await validateCard(tx, item.cartaoTransporteId);
          await tx.beneficioTransporteCompetenciaItem.create({
            data: {
              competenciaId: id,
              tipoConducao: item.tipoConducao,
              cartaoTransporteId: item.cartaoTransporteId,
              valorDiario: item.valorDiario,
            },
          });
        }
      }
      const current = await tx.beneficioCompetencia.findUniqueOrThrow({
        where: { id },
        include: {
          transporteItens: { include: { cartaoTransporte: true } },
          ajustes: true,
        },
      });
      await audit(
        tx,
        req.userId,
        "ALTERAR",
        "beneficioCompetencia",
        id,
        before,
        current,
      );
      return transportCalculation(current);
    });
  });
}
