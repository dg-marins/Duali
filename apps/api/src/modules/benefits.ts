import type { FastifyInstance } from "fastify";
import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@duali/database";
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
import { registerResource, type Resource } from "./resources.js";
import { transportCalculation } from "./transport.js";
const recurringComponent = "__RECORRENTE__";

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
          "Transporte usa itens de condução e cartão.",
        );
      if (data.configuracaoRecorrenteId) {
        const [config, benefit] = await Promise.all([
          tx.configuracaoBeneficio.findUnique({
            where: { id: String(data.configuracaoRecorrenteId) },
          }),
          tx.vinculo.findUnique({ where: { id: String(data.vinculoId) } }),
        ]);
        if (
          !config ||
          !benefit ||
          config.unidadeId !== benefit.unidadeId ||
          config.tipo !== data.tipo
        )
          throw new DomainError(
            422,
            "Fornecedor recorrente incompatível com vínculo e benefício.",
          );
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
      transporteItens: { include: { cartaoTransporte: true } },
    },
    present: benefitCalculation,
    filters: ["status"],
    before: async (tx, data, previous) => {
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
  for (const resource of benefitResources) registerResource(app, db, resource);
  app.get("/api/beneficios/lote/opcoes", async (req) => {
    const query = z
      .object({
        unidadeId: z.string().uuid(),
        tipo: z.enum([
          "TRANSPORTE",
          "ALIMENTACAO",
          "CESTA_BASICA",
          "PREMIACAO",
          "OUTRO",
        ]),
      })
      .parse(req.query);
    const [vinculos, configuracoes, cartoes] = await Promise.all([
      db.vinculo.findMany({
        where: { unidadeId: query.unidadeId, status: "ATIVO" },
        include: {
          pessoa: true,
          beneficios: {
            where: { tipo: query.tipo, status: "ATIVO" },
            include: {
              configuracaoRecorrente: { include: { fornecedor: true } },
            },
            orderBy: { inicioVigencia: "desc" },
          },
        },
        orderBy: { pessoa: { nomeCompleto: "asc" } },
      }),
      db.configuracaoBeneficio.findMany({
        where: { unidadeId: query.unidadeId, tipo: query.tipo, ativa: true },
        include: { fornecedor: true },
        orderBy: { fornecedor: { nome: "asc" } },
      }),
      query.tipo === "TRANSPORTE"
        ? db.cartaoTransporte.findMany({
            where: { ativo: true },
            orderBy: { nome: "asc" },
          })
        : Promise.resolve([]),
    ]);
    return { vinculos, configuracoes, cartoes };
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
          const config = await tx.configuracaoBeneficio.findFirst({
            where: {
              id: body.configuracaoId,
              unidadeId: body.unidadeId,
              tipo: body.tipo,
              ativa: true,
              fornecedor: { ativo: true },
            },
          });
          if (!config)
            throw new DomainError(
              422,
              "Selecione um fornecedor ativo da unidade e categoria.",
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
                  configuracaoRecorrenteId: config.id,
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
                  configuracaoRecorrenteId: config.id,
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
              const cardIds = [
                ...new Set(
                  item.transporteItens.map(
                    (transport) => transport.cartaoTransporteId,
                  ),
                ),
              ];
              const cards = await tx.cartaoTransporte.count({
                where: {
                  id: { in: cardIds },
                  ativo: true,
                },
              });
              if (cards !== cardIds.length)
                throw new DomainError(
                  422,
                  "Selecione cartões de transporte ativos.",
                );
              await tx.beneficioTransporteItem.deleteMany({
                where: {
                  beneficioVinculoId: benefit.id,
                  inicioVigencia: month,
                },
              });
              await tx.beneficioTransporteItem.createMany({
                data: item.transporteItens.map((transport) => ({
                  ...transport,
                  beneficioVinculoId: benefit.id,
                  inicioVigencia: month,
                })),
              });
              await tx.beneficioTransporteCompetenciaItem.deleteMany({
                where: { competenciaId: competence.id },
              });
              for (const transport of item.transporteItens) {
                const source =
                  await tx.beneficioTransporteItem.findFirstOrThrow({
                    where: {
                      beneficioVinculoId: benefit.id,
                      inicioVigencia: month,
                      tipoConducao: transport.tipoConducao,
                      cartaoTransporteId: transport.cartaoTransporteId,
                    },
                  });
                await tx.beneficioTransporteCompetenciaItem.create({
                  data: {
                    competenciaId: competence.id,
                    origemItemId: source.id,
                    tipoConducao: transport.tipoConducao,
                    cartaoTransporteId: transport.cartaoTransporteId,
                    valorDiario: transport.valorDiario,
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
        configuracao: true,
        beneficioVinculo: { include: { vinculo: true } },
        transporteItens: { include: { cartaoTransporte: true } },
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
      transporteItens: { include: { cartaoTransporte: true } },
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
