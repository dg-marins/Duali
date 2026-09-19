import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient, type TipoBeneficio } from "@duali/database";
import {
  z,
  fornecedorSchema,
  configuracaoBeneficioSchema,
  beneficioVinculoSchema,
  competenciaSchema,
  beneficioAjusteSchema,
  beneficioAjusteDistribuicaoSchema,
  beneficioPeriodoSchema,
  beneficioLoteSchema,
  fechamentoBeneficioSchema,
  reabrirBeneficioSchema,
} from "@duali/shared";
import {
  audit,
  dateData,
  DomainError,
  paramsId,
  transaction,
  type Row,
  type Tx,
} from "../core.js";
import { registerResource, saveResource, type Resource } from "./resources.js";
import { transportCalculation } from "./transport.js";
const recurringComponent = "__RECORRENTE__";
const monthEnd = (month: Date) =>
  new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
const weekdayIndexes: Record<string, number> = {
  DOMINGO: 0,
  SEGUNDA: 1,
  TERCA: 2,
  QUARTA: 3,
  QUINTA: 4,
  SEXTA: 5,
  SABADO: 6,
};
function suggestedTransportDays(
  link: { tipoEscala: string | null; diasSemana: string[] },
  month: Date,
) {
  if (link.tipoEscala !== "DIAS_SEMANA" || !link.diasSemana.length) return null;
  const selected = new Set(link.diasSemana.map((day) => weekdayIndexes[day]));
  let count = 0;
  for (let day = 1; day <= monthEnd(month).getUTCDate(); day++) {
    const current = new Date(
      Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), day),
    );
    if (selected.has(current.getUTCDay())) count++;
  }
  return count;
}

export function idempotencyKey(req: {
  headers: Record<string, string | string[] | undefined>;
}) {
  const value = req.headers["idempotency-key"];
  if (!value) return null;
  if (Array.isArray(value) || value.length < 8 || value.length > 180)
    throw new DomainError(422, "Chave de idempotência inválida.");
  return value;
}

export async function idempotent<T>(
  tx: Tx,
  key: string | null,
  operation: string,
  payload: unknown,
  work: () => Promise<T>,
  context: { userId?: string | null; scope?: string } = {},
): Promise<T> {
  if (!key) return work();
  const hash = createHash("sha256")
    .update(JSON.stringify(payload))
    .digest("hex");
  const existing = await tx.chaveIdempotencia.findFirst({
    where: {
      chave: key,
      operacao: operation,
      escopo: context.scope ?? "global",
      usuarioId: context.userId ?? null,
    },
  });
  if (existing) {
    if (existing.hashPayload !== hash)
      throw new DomainError(409, "Esta chave já foi usada com outra operação.");
    return existing.resposta as T;
  }
  const result = await work();
  await tx.chaveIdempotencia.create({
    data: {
      chave: key,
      operacao: operation,
      escopo: context.scope ?? "global",
      usuarioId: context.userId ?? null,
      hashPayload: hash,
      resposta: result as Prisma.InputJsonValue,
    },
  });
  return result;
}
export function benefitCalculation(row: Row): Row {
  if (
    (row.beneficioVinculo as Row | undefined)?.tipo === "TRANSPORTE" &&
    row.transporteItens
  )
    return transportCalculation(row);
  const quantity = row.quantidadeDias ?? row.quantidade;
  const ajustes = (row.ajustes ?? []) as Row[];
  const adjustment = ajustes.reduce(
    (sum, r) =>
      r.tipo === "CREDITO"
        ? sum.plus(String(r.valor))
        : sum.minus(String(r.valor)),
    new Prisma.Decimal(0),
  );
  const base =
    quantity != null && row.valorUnitario != null
      ? new Prisma.Decimal(String(quantity))
          .times(String(row.valorUnitario))
          .toDecimalPlaces(2)
      : null;
  const final = base?.plus(adjustment).toDecimalPlaces(2) ?? null;
  return {
    ...row,
    valorBaseCalculado: base?.toFixed(2) ?? null,
    valorCalculado: base?.toFixed(2) ?? null,
    totalAjustes: adjustment.toFixed(2),
    valorFinal: final?.toFixed(2) ?? null,
    divergencia:
      final && row.valorInformado != null
        ? new Prisma.Decimal(String(row.valorInformado)).minus(final).toFixed(2)
        : null,
  };
}
async function ensureOpen(tx: Tx, unidadeId: string, competencia: Date) {
  const closing = await tx.fechamentoCompetenciaBeneficio.findUnique({
    where: { unidadeId_competencia: { unidadeId, competencia } },
  });
  if (closing?.status === "FECHADA")
    throw new DomainError(
      409,
      "Reabra a competência antes de alterar lançamentos.",
    );
}
export const benefitResources: Resource[] = [
  {
    path: "fornecedores",
    model: "fornecedor",
    schema: fornecedorSchema,
    search: "nome",
  },
  {
    path: "configuracoes-beneficios",
    model: "configuracaoBeneficio",
    schema: configuracaoBeneficioSchema,
    filters: ["unidadeId", "fornecedorId", "tipo"],
    include: { unidade: true, fornecedor: true },
  },
  {
    path: "beneficios-vinculo",
    model: "beneficioVinculo",
    schema: beneficioVinculoSchema,
    dates: ["inicioVigencia", "fimVigencia"],
    filters: ["vinculoId", "tipo", "status"],
    include: { vinculo: { include: { pessoa: true } } },
    before: async (tx, data, previous) => {
      if (
        previous &&
        (data.vinculoId !== previous.vinculoId || data.tipo !== previous.tipo)
      )
        throw new DomainError(409, "Vínculo e tipo históricos são imutáveis.");
      if (data.valorDiario != null && data.tipo !== "ALIMENTACAO")
        throw new DomainError(
          422,
          "Valor diário recorrente é permitido somente para alimentação.",
        );
      if (
        data.tipo === "ALIMENTACAO" &&
        (data.quantidadeRecorrente != null ||
          data.valorUnitarioRecorrente != null)
      )
        throw new DomainError(
          422,
          "Alimentação usa valor diário e dias da competência.",
        );
      if (
        data.tipo === "TRANSPORTE" &&
        (data.valorDiario != null ||
          data.quantidadeRecorrente != null ||
          data.valorUnitarioRecorrente != null)
      )
        throw new DomainError(
          422,
          "Transporte usa itens de condução e fornecedor.",
        );
      if (data.configuracaoRecorrenteId) {
        const [config, benefit] = await Promise.all([
          tx.configuracaoBeneficio.findUnique({
            where: { id: String(data.configuracaoRecorrenteId) },
            include: { fornecedor: true },
          }),
          tx.vinculo.findUnique({ where: { id: String(data.vinculoId) } }),
        ]);
        if (
          !config ||
          !benefit ||
          config.unidadeId !== benefit.unidadeId ||
          config.tipo !== data.tipo ||
          !config.ativa ||
          !config.fornecedor.ativo
        )
          throw new DomainError(
            422,
            "Fornecedor recorrente incompatível com vínculo e benefício.",
          );
      }

      const overlapping = await tx.beneficioVinculo.findFirst({
        where: {
          ...(previous ? { id: { not: String(previous.id) } } : {}),
          vinculoId: String(data.vinculoId),
          tipo: String(data.tipo) as TipoBeneficio,
          ...(data.fimVigencia
            ? { inicioVigencia: { lte: data.fimVigencia as Date } }
            : {}),
          OR: [
            { fimVigencia: null },
            { fimVigencia: { gte: data.inicioVigencia as Date } },
          ],
        },
        select: { id: true },
      });
      if (overlapping)
        throw new DomainError(
          409,
          "J\u00e1 existe uma ades\u00e3o desse tipo com vig\u00eancia sobreposta.",
        );

      if (previous) {
        const protectedFields = [
          "configuracaoRecorrenteId",
          "valorDiario",
          "quantidadeRecorrente",
          "valorUnitarioRecorrente",
          "inicioVigencia",
          "fimVigencia",
          "status",
        ];
        const normalized = (value: unknown) =>
          value instanceof Date
            ? value.toISOString()
            : value == null
              ? null
              : String(value);
        const changesHistory = protectedFields.some(
          (field) => normalized(data[field]) !== normalized(previous[field]),
        );
        if (changesHistory) {
          const competencies = await tx.beneficioCompetencia.findMany({
            where: { beneficioVinculoId: String(previous.id) },
            select: {
              competencia: true,
              _count: { select: { aquisicaoItens: true } },
            },
          });
          if (competencies.some((item) => item._count.aquisicaoItens > 0))
            throw new DomainError(
              409,
              "N\u00e3o altere uma ades\u00e3o que j\u00e1 possui pedido ou compra.",
            );
          if (competencies.length) {
            const benefit = await tx.vinculo.findUniqueOrThrow({
              where: { id: String(previous.vinculoId) },
              select: { unidadeId: true },
            });
            const closed = await tx.fechamentoCompetenciaBeneficio.findFirst({
              where: {
                unidadeId: benefit.unidadeId,
                competencia: {
                  in: competencies.map((item) => item.competencia),
                },
                status: "FECHADA",
              },
              select: { id: true },
            });
            if (closed)
              throw new DomainError(
                409,
                "Reabra as compet\u00eancias fechadas antes de alterar a ades\u00e3o.",
              );
          }
        }
      }
    },
  },
  {
    path: "competencias",
    model: "beneficioCompetencia",
    schema: competenciaSchema,
    dates: ["competencia"],
    include: {
      beneficioVinculo: { include: { vinculo: { include: { pessoa: true } } } },
      configuracao: { include: { fornecedor: true } },
      ajustes: { include: { distribuicoes: true } },
      transporteItens: { include: { fornecedor: true } },
    },
    present: benefitCalculation,
    filters: ["status"],
    before: async (tx, data, previous) => {
      if (!previous && data.status !== "PENDENTE")
        throw new DomainError(
          422,
          "Uma nova competência deve iniciar como pendente.",
        );
      if (
        previous &&
        [
          "beneficioVinculoId",
          "configuracaoId",
          "componente",
          "competencia",
        ].some((key) => String(data[key]) !== String(previous[key]))
      )
        throw new DomainError(
          409,
          "Identificação da competência é histórica; cancele e crie outro registro.",
        );
      if (previous?.status === "CANCELADO" || previous?.status === "PAGO")
        throw new DomainError(
          409,
          "Competência cancelada ou paga é somente para consulta.",
        );
      if (previous) data.status = "PENDENTE";
      const benefit = await tx.beneficioVinculo.findUniqueOrThrow({
        where: { id: String(data.beneficioVinculoId) },
        include: { vinculo: true },
      });
      const config = await tx.configuracaoBeneficio.findUniqueOrThrow({
        where: { id: String(data.configuracaoId) },
        include: { fornecedor: true },
      });
      if (
        config.unidadeId !== benefit.vinculo.unidadeId ||
        config.tipo !== benefit.tipo
      )
        throw new DomainError(
          422,
          "Configuração incompatível com unidade/tipo do benefício.",
        );
      if (!config.ativa || !config.fornecedor.ativo)
        throw new DomainError(
          422,
          "Selecione configuração e fornecedor ativos.",
        );
      if (previous) {
        const acquisitions = await tx.aquisicaoBeneficioItem.count({
          where: { competenciaId: String(previous.id) },
        });
        if (acquisitions)
          throw new DomainError(
            409,
            "Não altere competência com pedido ou compra emitidos.",
          );
      }
      const month = data.competencia as Date,
        last = new Date(
          Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
        );
      if (
        last < benefit.inicioVigencia ||
        (benefit.fimVigencia && month > benefit.fimVigencia)
      )
        throw new DomainError(
          422,
          "Competência fora da vigência do benefício.",
        );
      await ensureOpen(tx, benefit.vinculo.unidadeId, month);
    },
  },
  {
    path: "ajustes-beneficios",
    model: "beneficioAjuste",
    schema: beneficioAjusteSchema,
    include: { competencia: true },
    before: async (tx, data, previous, userId) => {
      if (previous)
        throw new DomainError(
          409,
          "Ajustes são históricos. Registre uma compensação.",
        );
      const competence = await tx.beneficioCompetencia.findUniqueOrThrow({
        where: { id: String(data.competenciaId) },
        include: { beneficioVinculo: { include: { vinculo: true } } },
      });
      if (competence.beneficioVinculo.tipo === "TRANSPORTE")
        throw new DomainError(
          422,
          "Use o ajuste distribuído para transporte, informando os itens afetados.",
        );
      await ensureOpen(
        tx,
        competence.beneficioVinculo.vinculo.unidadeId,
        competence.competencia,
      );
      data.criadoPor = userId;
    },
  },
  {
    path: "beneficios-periodos-historicos",
    model: "beneficioPeriodoHistorico",
    schema: beneficioPeriodoSchema,
    dates: ["dataEvento"],
    filters: ["beneficioVinculoId", "status"],
    include: {
      beneficioVinculo: { include: { vinculo: { include: { pessoa: true } } } },
    },
  },
];
export function registerBenefits(app: FastifyInstance, db: PrismaClient) {
  app.post("/api/configuracoes-beneficios/multiunidade", async (req) => {
    const body = configuracaoBeneficioSchema
      .omit({ unidadeId: true })
      .extend({
        unidadeIds: z
          .array(z.string().uuid())
          .min(1)
          .max(100)
          .refine(
            (ids) => new Set(ids).size === ids.length,
            "Unidades repetidas.",
          ),
      })
      .strict()
      .parse(req.body);
    return transaction(db, async (tx) => {
      const { unidadeIds, ...configuration } = body;
      const result = [];
      const resource = benefitResources.find(
        (item) => item.path === "configuracoes-beneficios",
      )!;
      for (const unidadeId of unidadeIds) {
        const existing = await tx.configuracaoBeneficio.findUnique({
          where: {
            unidadeId_tipo_fornecedorId: {
              unidadeId,
              tipo: body.tipo,
              fornecedorId: body.fornecedorId,
            },
          },
        });
        result.push(
          existing
            ? { id: existing.id, criada: false, ativa: existing.ativa }
            : {
                ...(await saveResource(
                  tx,
                  resource,
                  { ...configuration, unidadeId },
                  req.userId!,
                )),
                criada: true,
              },
        );
      }
      return { items: result };
    });
  });
  for (const resource of benefitResources) registerResource(app, db, resource);
  app.post("/api/competencias/:id/conferir", async (req) => {
    const { id } = paramsId.parse(req.params);
    return transaction(db, async (tx) => {
      const previous = await tx.beneficioCompetencia.findUnique({
        where: { id },
        include: {
          aquisicaoItens: true,
          beneficioVinculo: { include: { vinculo: true } },
        },
      });
      if (!previous) throw new DomainError(404, "Competência não encontrada.");
      if (previous.status !== "PENDENTE")
        throw new DomainError(
          409,
          "Somente competências pendentes podem ser conferidas.",
        );
      if (previous.aquisicaoItens.length)
        throw new DomainError(
          409,
          "Não altere competência com pedido ou compra emitidos.",
        );
      await ensureOpen(
        tx,
        previous.beneficioVinculo.vinculo.unidadeId,
        previous.competencia,
      );
      const current = await tx.beneficioCompetencia.update({
        where: { id },
        data: { status: "CONFERIDO" },
      });
      await audit(
        tx,
        req.userId,
        "CONFERIR_COMPETENCIA_BENEFICIO",
        "beneficioCompetencia",
        id,
        previous,
        current,
      );
      return benefitCalculation(current);
    });
  });
  app.post("/api/competencias/:id/cancelar", async (req) => {
    const { id } = paramsId.parse(req.params);
    return transaction(db, async (tx) => {
      const previous = await tx.beneficioCompetencia.findUnique({
        where: { id },
        include: {
          aquisicaoItens: true,
          beneficioVinculo: { include: { vinculo: true } },
        },
      });
      if (!previous) throw new DomainError(404, "Competência não encontrada.");
      if (!(["PENDENTE", "CONFERIDO"] as string[]).includes(previous.status))
        throw new DomainError(
          409,
          "Somente competências pendentes ou conferidas podem ser canceladas.",
        );
      if (previous.aquisicaoItens.length)
        throw new DomainError(
          409,
          "Não cancele competência com pedido ou compra emitidos.",
        );
      await ensureOpen(
        tx,
        previous.beneficioVinculo.vinculo.unidadeId,
        previous.competencia,
      );
      const current = await tx.beneficioCompetencia.update({
        where: { id },
        data: { status: "CANCELADO" },
      });
      await audit(
        tx,
        req.userId,
        "CANCELAR_COMPETENCIA_BENEFICIO",
        "beneficioCompetencia",
        id,
        previous,
        current,
      );
      return benefitCalculation(current);
    });
  });
  app.post("/api/beneficios-vinculo/:id/encerrar", async (req) => {
    const { id } = paramsId.parse(req.params);
    const body = z
      .object({
        fimVigencia: z.string().date(),
        motivo: z.string().trim().min(3).max(500),
      })
      .strict()
      .parse(req.body);
    return transaction(db, async (tx) => {
      const previous = await tx.beneficioVinculo.findUnique({
        where: { id },
        include: {
          vinculo: true,
          transporteItens: true,
          competencias: { include: { aquisicaoItens: true } },
        },
      });
      if (!previous) throw new DomainError(404, "Benefício não encontrado.");
      if (previous.status !== "ATIVO")
        throw new DomainError(409, "Este benefício já está encerrado.");
      const end = new Date(`${body.fimVigencia}T00:00:00.000Z`);
      if (end < previous.inicioVigencia)
        throw new DomainError(
          422,
          "O encerramento não pode ser anterior ao início.",
        );
      if (
        previous.competencias.some(
          (item) => item.competencia > end || item.aquisicaoItens.length > 0,
        )
      )
        throw new DomainError(
          409,
          "Cancele competências futuras e resolva pedidos ou compras antes de encerrar o benefício.",
        );
      if (
        previous.transporteItens.some(
          (item) => item.ativo && item.inicioVigencia > end,
        )
      )
        throw new DomainError(
          409,
          "Há itens futuros de transporte. Revise as vigências antes de encerrar o benefício.",
        );
      const current = await tx.beneficioVinculo.update({
        where: { id },
        data: { status: "ENCERRADO", fimVigencia: end },
      });
      if (previous.tipo === "TRANSPORTE")
        await tx.beneficioTransporteItem.updateMany({
          where: {
            beneficioVinculoId: id,
            ativo: true,
            inicioVigencia: { lte: end },
          },
          data: { ativo: false, fimVigencia: end },
        });
      await audit(
        tx,
        req.userId,
        "ENCERRAR_BENEFICIO",
        "beneficioVinculo",
        id,
        previous,
        { ...current, motivoEncerramento: body.motivo },
      );
      return current;
    });
  });
  app.get("/api/beneficios/lote/opcoes", async (req) => {
    const query = z
      .object({
        unidadeId: z.string().uuid(),
        competencia: z.string().date(),
        tipo: z.enum([
          "TRANSPORTE",
          "ALIMENTACAO",
          "CESTA_BASICA",
          "PREMIACAO",
          "OUTRO",
        ]),
      })
      .parse(req.query);
    const optionMonth = new Date(query.competencia);
    const [vinculos, configuracoes] = await Promise.all([
      db.vinculo.findMany({
        where: { unidadeId: query.unidadeId, status: "ATIVO" },
        include: {
          pessoa: true,
          beneficios: {
            where: {
              tipo: query.tipo,
              status: "ATIVO",
              inicioVigencia: { lte: monthEnd(optionMonth) },
              OR: [
                { fimVigencia: null },
                { fimVigencia: { gte: optionMonth } },
              ],
            },
            include: {
              configuracaoRecorrente: { include: { fornecedor: true } },
              transporteItens: {
                where: {
                  ativo: true,
                  inicioVigencia: { lte: optionMonth },
                  OR: [
                    { fimVigencia: null },
                    { fimVigencia: { gte: optionMonth } },
                  ],
                },
                include: { fornecedor: true },
                orderBy: { inicioVigencia: "desc" },
              },
            },
            orderBy: { inicioVigencia: "desc" },
          },
        },
        orderBy: { pessoa: { nomeCompleto: "asc" } },
      }),
      db.configuracaoBeneficio.findMany({
        where: {
          unidadeId: query.unidadeId,
          tipo: query.tipo,
          ativa: true,
          fornecedor: { ativo: true },
        },
        include: { fornecedor: true },
        orderBy: { fornecedor: { nome: "asc" } },
      }),
    ]);
    return {
      vinculos: vinculos.map((link) => ({
        ...link,
        sugestaoDiasTransporte: suggestedTransportDays(link, optionMonth),
      })),
      configuracoes,
    };
  });
  app.post("/api/beneficios/lote", async (req, reply) => {
    const body = beneficioLoteSchema.parse(req.body);
    const month = new Date(body.competencia);
    const previousDay = new Date(
      Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 0),
    );
    const result = await transaction(db, async (tx) =>
      idempotent(
        tx,
        idempotencyKey(req),
        "CADASTRAR_BENEFICIO_EM_LOTE",
        body,
        async () => {
          await ensureOpen(tx, body.unidadeId, month);
          const transportSupplierIds = [
            ...new Set(
              body.itens.flatMap((item) =>
                item.transporteItens.map((transport) => transport.fornecedorId),
              ),
            ),
          ];
          const validConfigs = await tx.configuracaoBeneficio.findMany({
            where:
              body.tipo === "TRANSPORTE"
                ? {
                    unidadeId: body.unidadeId,
                    tipo: body.tipo,
                    ativa: true,
                    fornecedor: { ativo: true },
                    fornecedorId: { in: transportSupplierIds },
                  }
                : {
                    id: body.configuracaoId!,
                    unidadeId: body.unidadeId,
                    tipo: body.tipo,
                    ativa: true,
                    fornecedor: { ativo: true },
                  },
          });
          const config =
            body.tipo === "TRANSPORTE" && body.configuracaoId
              ? validConfigs.find((row) => row.id === body.configuracaoId)
              : validConfigs[0];
          if (
            !config ||
            (body.tipo === "TRANSPORTE" &&
              validConfigs.length !== transportSupplierIds.length)
          )
            throw new DomainError(
              422,
              "Selecione fornecedores ativos de transporte configurados para a unidade.",
            );
          const ids = body.itens.map((item) => item.vinculoId);
          if (new Set(ids).size !== ids.length)
            throw new DomainError(
              422,
              "Não repita vínculos na mesma operação.",
            );
          const links = await tx.vinculo.findMany({
            where: {
              id: { in: ids },
              unidadeId: body.unidadeId,
              status: "ATIVO",
            },
          });
          if (links.length !== ids.length)
            throw new DomainError(
              422,
              "Selecione apenas vínculos ativos da unidade.",
            );
          const created: string[] = [];
          for (const item of body.itens) {
            if (
              body.tipo === "ALIMENTACAO" &&
              (item.valorDiario == null || item.quantidadeDias == null)
            )
              throw new DomainError(
                422,
                "Informe valor diário e dias para alimentação.",
              );
            if (
              body.tipo === "TRANSPORTE" &&
              (!item.quantidadeDias || !item.transporteItens.length)
            )
              throw new DomainError(
                422,
                "Informe dias e ao menos um transporte por pessoa.",
              );
            if (
              !["ALIMENTACAO", "TRANSPORTE"].includes(body.tipo) &&
              (item.quantidade == null || item.valorUnitario == null)
            )
              throw new DomainError(
                422,
                "Informe quantidade e valor unitário.",
              );
            const active = await tx.beneficioVinculo.findMany({
              where: {
                vinculoId: item.vinculoId,
                tipo: body.tipo,
                status: "ATIVO",
                inicioVigencia: { lte: month },
                OR: [{ fimVigencia: null }, { fimVigencia: { gte: month } }],
              },
              orderBy: { inicioVigencia: "desc" },
            });
            let benefit = active.find(
              (row) => row.inicioVigencia.getTime() === month.getTime(),
            );
            if (!benefit) {
              const protectedHistory = await tx.beneficioCompetencia.count({
                where: {
                  beneficioVinculoId: { in: active.map((row) => row.id) },
                  aquisicaoItens: { some: {} },
                },
              });
              if (protectedHistory)
                throw new DomainError(
                  409,
                  "Não substitua adesão que possui pedido ou compra emitidos. Cancele ou reverta pelo fluxo de aquisição.",
                );
              for (const current of active) {
                const closed = await tx.beneficioVinculo.update({
                  where: { id: current.id },
                  data: { fimVigencia: previousDay, status: "ENCERRADO" },
                });
                await audit(
                  tx,
                  req.userId,
                  "ENCERRAR_BENEFICIO_POR_SUBSTITUICAO",
                  "beneficioVinculo",
                  current.id,
                  current,
                  closed,
                );
              }
              benefit = await tx.beneficioVinculo.create({
                data: {
                  vinculoId: item.vinculoId,
                  tipo: body.tipo,
                  inicioVigencia: month,
                  configuracaoRecorrenteId:
                    body.tipo === "TRANSPORTE" ? null : config.id,
                  ...(body.tipo === "ALIMENTACAO"
                    ? { valorDiario: item.valorDiario ?? null }
                    : {}),
                  ...(!["ALIMENTACAO", "TRANSPORTE"].includes(body.tipo)
                    ? {
                        quantidadeRecorrente: item.quantidade ?? null,
                        valorUnitarioRecorrente: item.valorUnitario ?? null,
                      }
                    : {}),
                },
              });
              created.push(benefit.id);
            } else {
              const before = benefit;
              benefit = await tx.beneficioVinculo.update({
                where: { id: benefit.id },
                data: {
                  configuracaoRecorrenteId:
                    body.tipo === "TRANSPORTE" ? null : config.id,
                  ...(body.tipo === "ALIMENTACAO"
                    ? { valorDiario: item.valorDiario ?? null }
                    : {}),
                  ...(!["ALIMENTACAO", "TRANSPORTE"].includes(body.tipo)
                    ? {
                        quantidadeRecorrente: item.quantidade ?? null,
                        valorUnitarioRecorrente: item.valorUnitario ?? null,
                      }
                    : {}),
                },
              });
              await audit(
                tx,
                req.userId,
                "ALTERAR_BENEFICIO_EM_LOTE",
                "beneficioVinculo",
                benefit.id,
                before,
                benefit,
              );
            }
            const allCompetences = await tx.beneficioCompetencia.findMany({
              where: {
                beneficioVinculoId: benefit.id,
                competencia: month,
              },
              include: { aquisicaoItens: true },
            });
            if (allCompetences.some((row) => row.aquisicaoItens.length))
              throw new DomainError(
                409,
                "Não altere benefício com aquisição já emitida nesta competência.",
              );
            const existing =
              allCompetences.find(
                (row) => row.componente === recurringComponent,
              ) ?? allCompetences.find((row) => row.componente === "Principal");
            const data = {
              configuracaoId: config.id,
              quantidadeDias: ["ALIMENTACAO", "TRANSPORTE"].includes(body.tipo)
                ? (item.quantidadeDias ?? null)
                : null,
              quantidade: !["ALIMENTACAO", "TRANSPORTE"].includes(body.tipo)
                ? (item.quantidade ?? null)
                : null,
              valorUnitario:
                body.tipo === "ALIMENTACAO"
                  ? (item.valorDiario ?? null)
                  : !["TRANSPORTE"].includes(body.tipo)
                    ? (item.valorUnitario ?? null)
                    : null,
            };
            const competence = existing
              ? await tx.beneficioCompetencia.update({
                  where: { id: existing.id },
                  data,
                })
              : await tx.beneficioCompetencia.create({
                  data: {
                    beneficioVinculoId: benefit.id,
                    competencia: month,
                    componente: recurringComponent,
                    ...data,
                  },
                });
            if (body.tipo === "TRANSPORTE") {
              const currentTransportItems =
                await tx.beneficioTransporteItem.findMany({
                  where: {
                    beneficioVinculoId: benefit.id,
                    ativo: true,
                    inicioVigencia: { lte: month },
                    OR: [
                      { fimVigencia: null },
                      { fimVigencia: { gte: month } },
                    ],
                  },
                });
              if (
                await tx.beneficioTransporteItem.count({
                  where: {
                    beneficioVinculoId: benefit.id,
                    ativo: true,
                    inicioVigencia: { gt: month },
                  },
                })
              )
                throw new DomainError(
                  409,
                  "Há uma configuração futura de transporte. Revise as vigências antes de aplicar o lote.",
                );
              const replacementIds = new Set<string>();
              const createdTransportItems = [];
              for (const transport of item.transporteItens) {
                const sameMonth = currentTransportItems.find(
                  (current) =>
                    current.inicioVigencia.getTime() === month.getTime() &&
                    current.tipoConducao === transport.tipoConducao &&
                    current.fornecedorId === transport.fornecedorId,
                );
                const createdItem = sameMonth
                  ? await tx.beneficioTransporteItem.update({
                      where: { id: sameMonth.id },
                      data: { valorDiario: transport.valorDiario },
                    })
                  : await tx.beneficioTransporteItem.create({
                      data: {
                        ...transport,
                        beneficioVinculoId: benefit.id,
                        inicioVigencia: month,
                      },
                    });
                replacementIds.add(createdItem.id);
                createdTransportItems.push(createdItem);
                await audit(
                  tx,
                  req.userId,
                  sameMonth
                    ? "ALTERAR_TRANSPORTE_EM_LOTE"
                    : "CRIAR_TRANSPORTE_EM_LOTE",
                  "beneficioTransporteItem",
                  createdItem.id,
                  sameMonth,
                  createdItem,
                );
              }
              for (const current of currentTransportItems) {
                if (replacementIds.has(current.id)) continue;
                const closed = await tx.beneficioTransporteItem.update({
                  where: { id: current.id },
                  data: {
                    ativo: false,
                    fimVigencia:
                      current.inicioVigencia.getTime() === month.getTime()
                        ? month
                        : previousDay,
                  },
                });
                await audit(
                  tx,
                  req.userId,
                  "ENCERRAR_TRANSPORTE_EM_LOTE",
                  "beneficioTransporteItem",
                  current.id,
                  current,
                  closed,
                );
              }
              await tx.beneficioTransporteCompetenciaItem.deleteMany({
                where: { competenciaId: competence.id },
              });
              for (const source of createdTransportItems) {
                await tx.beneficioTransporteCompetenciaItem.create({
                  data: {
                    competenciaId: competence.id,
                    origemItemId: source.id,
                    tipoConducao: source.tipoConducao,
                    fornecedorId: source.fornecedorId,
                    valorDiario: source.valorDiario,
                  },
                });
              }
            }
            await audit(
              tx,
              req.userId,
              "CADASTRAR_BENEFICIO_EM_LOTE",
              "beneficioVinculo",
              benefit.id,
              undefined,
              benefit,
            );
          }
          return { criados: created.length, processados: body.itens.length };
        },
        {
          userId: req.userId,
          scope: `${body.unidadeId}:${body.competencia}:${body.tipo}`,
        },
      ),
    );
    reply.code(201);
    return result;
  });
  app.post("/api/ajustes-beneficios/distribuido", async (req, reply) => {
    const body = beneficioAjusteDistribuicaoSchema.parse(req.body);
    const result = await transaction(db, async (tx) =>
      idempotent(
        tx,
        idempotencyKey(req),
        "CRIAR_AJUSTE_TRANSPORTE_DISTRIBUIDO",
        body,
        async () => {
          const competence = await tx.beneficioCompetencia.findUniqueOrThrow({
            where: { id: body.competenciaId },
            include: {
              beneficioVinculo: { include: { vinculo: true } },
              transporteItens: true,
            },
          });
          if (competence.beneficioVinculo.tipo !== "TRANSPORTE")
            throw new DomainError(
              422,
              "Distribuição por item é exclusiva de transporte.",
            );
          await ensureOpen(
            tx,
            competence.beneficioVinculo.vinculo.unidadeId,
            competence.competencia,
          );
          const ids = new Set(
            competence.transporteItens.map((item) => item.id),
          );
          if (
            !body.distribuicoes.length ||
            body.distribuicoes.some(
              (item) => !ids.has(item.transporteCompetenciaItemId),
            )
          )
            throw new DomainError(
              422,
              "Informe apenas itens de transporte desta competência.",
            );
          if (
            new Set(
              body.distribuicoes.map(
                (item) => item.transporteCompetenciaItemId,
              ),
            ).size !== body.distribuicoes.length
          )
            throw new DomainError(422, "Não repita item na distribuição.");
          const total = body.distribuicoes.reduce(
            (sum, item) => sum.plus(item.valor),
            new Prisma.Decimal(0),
          );
          if (!total.equals(body.valor))
            throw new DomainError(
              422,
              "A distribuição deve totalizar o ajuste.",
            );
          const adjustment = await tx.beneficioAjuste.create({
            data: {
              competenciaId: body.competenciaId,
              tipo: body.tipo,
              valor: body.valor,
              motivo: body.motivo,
              criadoPor: req.userId!,
            },
          });
          await tx.beneficioAjusteTransporteItem.createMany({
            data: body.distribuicoes.map((item) => ({
              ajusteId: adjustment.id,
              transporteCompetenciaItemId: item.transporteCompetenciaItemId,
              valor: item.valor,
            })),
          });
          await audit(
            tx,
            req.userId,
            "CRIAR_AJUSTE_TRANSPORTE_DISTRIBUIDO",
            "beneficioAjuste",
            adjustment.id,
            undefined,
            adjustment,
          );
          return adjustment;
        },
        { userId: req.userId, scope: body.competenciaId },
      ),
    );
    reply.code(201);
    return result;
  });
  app.get("/api/beneficios/fechamentos", async (req) => {
    const query = fechamentoBeneficioSchema.partial().parse(req.query);
    return db.fechamentoCompetenciaBeneficio.findMany({
      where: {
        ...(query.unidadeId ? { unidadeId: query.unidadeId } : {}),
        ...(query.competencia
          ? { competencia: new Date(query.competencia) }
          : {}),
      },
      include: { unidade: true },
      orderBy: [{ competencia: "desc" }, { unidade: { nome: "asc" } }],
    });
  });
  const detail = async (id: string) => {
    const closing = await db.fechamentoCompetenciaBeneficio.findUniqueOrThrow({
      where: { id },
      include: { unidade: true },
    });
    const rows = await db.beneficioCompetencia.findMany({
      where: {
        competencia: closing.competencia,
        beneficioVinculo: { vinculo: { unidadeId: closing.unidadeId } },
        status: { not: "CANCELADO" },
      },
      include: {
        ajustes: true,
        configuracao: { include: { fornecedor: true } },
        beneficioVinculo: {
          include: { vinculo: { include: { pessoa: true } } },
        },
        transporteItens: { include: { fornecedor: true } },
      },
    });
    const totals = Object.fromEntries(
      ["TRANSPORTE", "ALIMENTACAO", "CESTA_BASICA", "PREMIACAO", "OUTRO"].map(
        (type) => [
          type,
          rows
            .filter((r) => r.configuracao.tipo === type)
            .reduce(
              (sum, row) =>
                sum.plus(String(benefitCalculation(row).valorFinal ?? 0)),
              new Prisma.Decimal(0),
            )
            .toFixed(2),
        ],
      ),
    );
    return {
      ...closing,
      lancamentos: rows.map((row) => benefitCalculation(row)),
      pessoasCobertas: new Set(
        rows.map((r) => r.beneficioVinculo.vinculo.pessoaId),
      ).size,
      pendencias: rows.filter(
        (r) =>
          r.status === "PENDENTE" ||
          Number(benefitCalculation(r).divergencia ?? 0) !== 0,
      ).length,
      totais: {
        ...totals,
        total: Object.values(totals)
          .reduce((s, v) => s.plus(v), new Prisma.Decimal(0))
          .toFixed(2),
      },
    };
  };
  app.get("/api/beneficios/fechamentos/:id", async (req) =>
    detail(paramsId.parse(req.params).id),
  );
  app.post("/api/beneficios/fechamentos", async (req, reply) => {
    const body = fechamentoBeneficioSchema.parse(req.body);
    const result = await transaction(db, async (tx) => {
      const row = await tx.fechamentoCompetenciaBeneficio.upsert({
        where: {
          unidadeId_competencia: {
            unidadeId: body.unidadeId,
            competencia: new Date(body.competencia),
          },
        },
        create: dateData(body, ["competencia"]) as never,
        update: {},
      });
      await audit(
        tx,
        req.userId,
        "CRIAR_FECHAMENTO_BENEFICIO",
        "fechamentoCompetenciaBeneficio",
        row.id,
        undefined,
        row,
      );
      return row;
    });
    reply.code(201);
    return result;
  });
  const transition = (path: "revisar" | "fechar") =>
    app.post(`/api/beneficios/fechamentos/:id/${path}`, async (req) => {
      const { id } = paramsId.parse(req.params);
      reabrirBeneficioSchema.partial().parse(req.body);
      return transaction(db, async (tx) => {
        const before =
          await tx.fechamentoCompetenciaBeneficio.findUniqueOrThrow({
            where: { id },
          });
        const status = path === "fechar" ? "FECHADA" : "EM_REVISAO";
        if (path === "fechar" && before.status !== "EM_REVISAO")
          throw new DomainError(
            409,
            "Coloque a competência em revisão antes de fechar.",
          );
        if (path === "revisar" && before.status !== "ABERTA")
          throw new DomainError(
            409,
            "Somente competência aberta pode entrar em revisão.",
          );
        if (path === "fechar") {
          const pendingPurchases = await tx.aquisicaoBeneficio.count({
            where: {
              unidadeId: before.unidadeId,
              competencia: before.competencia,
              status: "PENDENTE",
            },
          });
          if (pendingPurchases)
            throw new DomainError(
              409,
              "Resolva ou cancele os pedidos de aquisição pendentes antes de fechar.",
            );
        }
        const row = await tx.fechamentoCompetenciaBeneficio.update({
          where: { id },
          data: {
            status,
            ...(status === "FECHADA"
              ? { fechadoEm: new Date(), fechadoPor: req.userId }
              : {}),
          },
        });
        await audit(
          tx,
          req.userId,
          status === "FECHADA"
            ? "FECHAR_COMPETENCIA_BENEFICIO"
            : "REVISAR_COMPETENCIA_BENEFICIO",
          "fechamentoCompetenciaBeneficio",
          id,
          before,
          row,
        );
        return row;
      });
    });
  transition("revisar");
  transition("fechar");
  app.post("/api/beneficios/fechamentos/:id/reabrir", async (req) => {
    const { id } = paramsId.parse(req.params);
    const { motivo } = reabrirBeneficioSchema.parse(req.body);
    return transaction(db, async (tx) => {
      const before = await tx.fechamentoCompetenciaBeneficio.findUniqueOrThrow({
        where: { id },
      });
      if (before.status !== "FECHADA")
        throw new DomainError(409, "A competência não está fechada.");
      const row = await tx.fechamentoCompetenciaBeneficio.update({
        where: { id },
        data: { status: "ABERTA", fechadoEm: null, fechadoPor: null },
      });
      await audit(
        tx,
        req.userId,
        "REABRIR_COMPETENCIA_BENEFICIO",
        "fechamentoCompetenciaBeneficio",
        id,
        before,
        { ...row, motivo },
      );
      return row;
    });
  });
}
export async function benefitAlerts(db: PrismaClient) {
  const rows = await db.beneficioCompetencia.findMany({
    where: { status: { not: "CANCELADO" } },
    include: {
      ajustes: true,
      beneficioVinculo: { include: { vinculo: { include: { pessoa: true } } } },
      transporteItens: { include: { fornecedor: true } },
    },
  });
  return rows.flatMap((row) => {
    const calc = benefitCalculation(row);
    if (
      row.status !== "PENDENTE" &&
      calc.valorCalculado !== null &&
      (calc.divergencia === null || Number(calc.divergencia) === 0)
    )
      return [];
    const v = row.beneficioVinculo.vinculo;
    return [
      {
        id: row.id,
        vinculoId: v.id,
        pessoa: v.pessoa.nomeCompleto,
        unidadeId: v.unidadeId,
        tipo: "BENEFICIO",
        mensagem:
          calc.divergencia !== null && Number(calc.divergencia) !== 0
            ? "Benefício com valor divergente"
            : "Benefício pendente de cálculo ou conferência",
        prazo: row.competencia,
      },
    ];
  });
}
