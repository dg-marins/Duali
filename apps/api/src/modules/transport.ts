import type { FastifyInstance } from "fastify";
import { Prisma, type PrismaClient } from "@duali/database";
import {
  beneficioVinculoSchema,
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
    items: z.array(transporteItemInputSchema).max(100),
  })
  .strict();
const transportConfigurationSchema = z
  .object({
    beneficio: beneficioVinculoSchema.refine(
      (value) => value.tipo === "TRANSPORTE",
      "Informe um benefício de transporte.",
    ),
    items: z.array(transporteItemInputSchema).min(1).max(100),
  })
  .strict();
const snapshotInputSchema = z
  .object({
    tipoConducao: z.enum(["ONIBUS", "ONIBUS_INTER", "BARCA", "METRO"]),
    fornecedorId: z.string().uuid(),
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
async function validateSupplier(tx: Tx, benefit: Row, id: string) {
  const config = await tx.configuracaoBeneficio.findFirst({
    where: {
      unidadeId: String((benefit.vinculo as Row).unidadeId),
      tipo: "TRANSPORTE",
      fornecedorId: id,
      ativa: true,
      fornecedor: { ativo: true },
    },
    include: { fornecedor: true },
  });
  if (!config)
    throw new DomainError(
      422,
      "Selecione um fornecedor de transporte ativo e configurado para a unidade.",
    );
  return config;
}
async function ensureConfig(tx: Tx, benefit: Row, configuracaoId: string) {
  const config = await tx.configuracaoBeneficio.findUnique({
    where: { id: configuracaoId },
    include: { fornecedor: true },
  });
  if (
    !config ||
    !config.ativa ||
    !config.fornecedor.ativo ||
    config.tipo !== "TRANSPORTE" ||
    config.unidadeId !== String((benefit.vinculo as Row).unidadeId)
  )
    throw new DomainError(
      422,
      "Configuração de transporte incompatível com o vínculo.",
    );
  return config;
}
async function saveItems(
  tx: Tx,
  benefit: Row,
  items: z.infer<typeof updateItemsSchema>["items"],
  userId: string | null,
) {
  const id = String(benefit.id);
  const existing = await tx.beneficioTransporteItem.findMany({
    where: { beneficioVinculoId: id },
  });
  const existingIds = new Set(existing.map((item) => item.id));
  if (items.some((item) => item.id && !existingIds.has(item.id)))
    throw new DomainError(
      422,
      "O item de transporte não pertence a este benefício.",
    );
  const incomingIds = new Set(
    items.flatMap((item) => (item.id ? [item.id] : [])),
  );
  for (const old of existing.filter(
    (item) => item.ativo && !incomingIds.has(item.id),
  )) {
    const today = new Date();
    const row = await tx.beneficioTransporteItem.update({
      where: { id: old.id },
      data: {
        ativo: false,
        fimVigencia:
          old.inicioVigencia.getTime() > today.getTime()
            ? old.inicioVigencia
            : today,
      },
    });
    await audit(
      tx,
      userId,
      "ALTERAR",
      "beneficioTransporteItem",
      old.id,
      old,
      row,
    );
  }
  const rows = [];
  for (const item of items) {
    await validateSupplier(tx, benefit, item.fornecedorId);
    const data = dateData(item, ["inicioVigencia", "fimVigencia"]);
    const before = item.id
      ? existing.find((current) => current.id === item.id)
      : undefined;
    const row = item.id
      ? await tx.beneficioTransporteItem.update({
          where: { id: item.id },
          data: { ...data, beneficioVinculoId: id } as never,
          include: { fornecedor: true },
        })
      : await tx.beneficioTransporteItem.create({
          data: { ...data, beneficioVinculoId: id } as never,
          include: { fornecedor: true },
        });
    rows.push(row);
    await audit(
      tx,
      userId,
      item.id ? "ALTERAR" : "CRIAR",
      "beneficioTransporteItem",
      row.id,
      before,
      row,
    );
  }
  return rows;
}
export function transportCalculation(row: Row): Row {
  const days = new Prisma.Decimal(String(row.quantidadeDias ?? 0));
  const items = (row.transporteItens ?? []) as Row[];
  const bySupplier = new Map<string, Prisma.Decimal>(),
    byType = new Map<string, Prisma.Decimal>();
  let daily = new Prisma.Decimal(0);
  for (const item of items) {
    const value = new Prisma.Decimal(String(item.valorDiario));
    daily = daily.plus(value);
    const supplier = String(
      (item.fornecedor as Row | undefined)?.nome ??
        item.fornecedorNome ??
        item.fornecedorId ??
        "Não informado",
    );
    bySupplier.set(
      supplier,
      (bySupplier.get(supplier) ?? new Prisma.Decimal(0)).plus(value),
    );
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
    transportePorFornecedorDiario: Object.fromEntries(
      [...bySupplier].map(([key, amount]) => [key, amount.toFixed(2)]),
    ),
    transportePorFornecedorMensal: Object.fromEntries(
      [...bySupplier].map(([key, amount]) => [
        key,
        amount.times(days).toDecimalPlaces(2).toFixed(2),
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
  app.get("/api/beneficios-vinculo/:id/transporte", async (req) => {
    const id = z
      .string()
      .uuid()
      .parse((req.params as { id: string }).id);
    return db.beneficioTransporteItem.findMany({
      where: { beneficioVinculoId: id },
      include: { fornecedor: true },
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
      const benefit = await benefitFor(tx, id);
      return saveItems(tx, benefit, body.items, req.userId);
    });
  });
  app.post("/api/configuracoes-transporte", async (req, reply) => {
    const body = transportConfigurationSchema.parse(req.body);
    if (body.items.some((item) => item.id))
      throw new DomainError(
        422,
        "Um novo transporte não aceita itens existentes.",
      );
    const result = await transaction(db, async (tx) => {
      const benefit = await tx.beneficioVinculo.create({
        data: {
          ...dateData(body.beneficio, ["inicioVigencia", "fimVigencia"]),
          configuracaoRecorrenteId: null,
        } as never,
        include: { vinculo: true },
      });
      await audit(
        tx,
        req.userId,
        "CRIAR",
        "beneficioVinculo",
        benefit.id,
        undefined,
        benefit,
      );
      const items = await saveItems(
        tx,
        benefit as unknown as Row,
        body.items,
        req.userId,
      );
      return { ...benefit, transporteItens: items };
    });
    reply.code(201);
    return result;
  });
  app.put("/api/configuracoes-transporte/:id", async (req) => {
    const id = z
      .string()
      .uuid()
      .parse((req.params as { id: string }).id);
    const body = transportConfigurationSchema.parse(req.body);
    return transaction(db, async (tx) => {
      const before = await benefitFor(tx, id);
      if (String(before.vinculoId) !== body.beneficio.vinculoId)
        throw new DomainError(
          422,
          "O vínculo da configuração de transporte não pode ser alterado.",
        );
      const benefit = await tx.beneficioVinculo.update({
        where: { id },
        data: {
          ...dateData(body.beneficio, ["inicioVigencia", "fimVigencia"]),
          vinculoId: undefined,
          tipo: undefined,
          configuracaoRecorrenteId: null,
        } as never,
        include: { vinculo: true },
      });
      await audit(
        tx,
        req.userId,
        "ALTERAR",
        "beneficioVinculo",
        id,
        before,
        benefit,
      );
      const items = await saveItems(
        tx,
        benefit as unknown as Row,
        body.items,
        req.userId,
      );
      return { ...benefit, transporteItens: items };
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
        include: { fornecedor: true },
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
            fornecedorId: item.fornecedorId,
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
          transporteItens: {
            include: { fornecedor: true },
          },
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
      if (
        await tx.aquisicaoBeneficioItem.count({ where: { competenciaId: id } })
      )
        throw new DomainError(
          409,
          "Não altere competência com pedido ou compra emitidos.",
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
          transporteItens: { include: { fornecedor: true } },
          ajustes: true,
        },
      });
      if (body.itens) {
        await tx.beneficioTransporteCompetenciaItem.deleteMany({
          where: { competenciaId: id },
        });
        for (const item of body.itens) {
          await validateSupplier(
            tx,
            before.beneficioVinculo as unknown as Row,
            item.fornecedorId,
          );
          await tx.beneficioTransporteCompetenciaItem.create({
            data: {
              competenciaId: id,
              tipoConducao: item.tipoConducao,
              fornecedorId: item.fornecedorId,
              valorDiario: item.valorDiario,
            },
          });
        }
      }
      const current = await tx.beneficioCompetencia.findUniqueOrThrow({
        where: { id },
        include: {
          transporteItens: {
            include: { fornecedor: true },
          },
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
