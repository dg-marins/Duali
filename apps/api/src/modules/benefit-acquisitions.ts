import type { FastifyInstance } from "fastify";
import { Prisma, type PrismaClient } from "@duali/database";
import {
  aquisicaoConfirmarSchema,
  aquisicaoPedidoSchema,
  aquisicaoPrepararSchema,
  aquisicaoReverterSchema,
  pedidoMensalGerarSchema,
  pedidoMensalSimulacaoSchema,
  z,
} from "@duali/shared";
import {
  audit,
  DomainError,
  paramsId,
  transaction,
  type Row,
  type Tx,
} from "../core.js";
import { benefitCalculation, idempotencyKey, idempotent } from "./benefits.js";

const monthEnd = (month: Date) =>
  new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));

async function ensureOpen(tx: Tx, unitId: string, month: Date) {
  const closing = await tx.fechamentoCompetenciaBeneficio.findUnique({
    where: { unidadeId_competencia: { unidadeId: unitId, competencia: month } },
  });
  if (closing?.status === "FECHADA")
    throw new DomainError(
      409,
      "Reabra a competência antes de alterar aquisições.",
    );
}

function value(row: Row) {
  return new Prisma.Decimal(String(benefitCalculation(row).valorFinal ?? 0));
}

async function purchaseSummary(tx: Tx | PrismaClient, competenceIds: string[]) {
  const items = await tx.aquisicaoBeneficioItem.findMany({
    where: { competenciaId: { in: competenceIds } },
    include: { aquisicao: true, movimentacoes: true },
  });
  const result = new Map<
    string,
    {
      reserved: Prisma.Decimal;
      gross: Prisma.Decimal;
      reversed: Prisma.Decimal;
    }
  >();
  for (const item of items) {
    const key = `${item.competenciaId}:${item.aquisicao.fornecedorId}`;
    const current = result.get(key) ?? {
      reserved: new Prisma.Decimal(0),
      gross: new Prisma.Decimal(0),
      reversed: new Prisma.Decimal(0),
    };
    if (item.aquisicao.status === "PENDENTE" && item.status === "PENDENTE")
      current.reserved = current.reserved.plus(item.valorReservado);
    for (const movement of item.movimentacoes) {
      if (movement.tipo === "CONFIRMACAO")
        current.gross = current.gross.plus(movement.valor);
      else current.reversed = current.reversed.plus(movement.valor);
    }
    result.set(key, current);
  }
  return result;
}

async function preview(tx: Tx, unitId: string, month: Date) {
  const rows = await tx.beneficioCompetencia.findMany({
    where: {
      competencia: month,
      status: { not: "CANCELADO" },
      beneficioVinculo: { vinculo: { unidadeId: unitId } },
    },
    include: {
      ajustes: {
        include: {
          distribuicoes: { include: { transporteCompetenciaItem: true } },
        },
      },
      configuracao: { include: { fornecedor: true } },
      beneficioVinculo: {
        include: { vinculo: { include: { pessoa: true, equipe: true } } },
      },
      transporteItens: {
        include: { fornecedor: true },
      },
    },
    orderBy: {
      beneficioVinculo: { vinculo: { pessoa: { nomeCompleto: "asc" } } },
    },
  });
  const totals = await purchaseSummary(
    tx,
    rows.map((row) => row.id),
  );
  return rows.flatMap((row) => {
    const items =
      row.beneficioVinculo.tipo === "TRANSPORTE"
        ? [
            ...new Map(
              row.transporteItens.map((item) => [
                `${item.fornecedorId ?? ""}`,
                item,
              ]),
            ).values(),
          ]
        : [null];
    return items.map((transportItem) => {
      const supplierId =
        transportItem?.fornecedorId ?? row.configuracao.fornecedorId;
      const purchased = totals.get(`${row.id}:${supplierId}`) ?? {
        reserved: new Prisma.Decimal(0),
        gross: new Prisma.Decimal(0),
        reversed: new Prisma.Decimal(0),
      };
      const base = transportItem
        ? row.transporteItens
            .filter((item) => item.fornecedorId === supplierId)
            .reduce(
              (sum, item) => sum.plus(item.valorDiario),
              new Prisma.Decimal(0),
            )
            .times(row.quantidadeDias ?? 0)
            .toDecimalPlaces(2)
        : value(row);
      const distributedAdjustments = transportItem
        ? row.ajustes.reduce(
            (sum, adjustment) =>
              sum.plus(
                adjustment.distribuicoes
                  .filter(
                    (distribution) =>
                      distribution.transporteCompetenciaItem.fornecedorId ===
                      supplierId,
                  )
                  .reduce(
                    (partial, distribution) =>
                      partial.plus(
                        adjustment.tipo === "CREDITO"
                          ? distribution.valor
                          : new Prisma.Decimal(distribution.valor).negated(),
                      ),
                    new Prisma.Decimal(0),
                  ),
              ),
            new Prisma.Decimal(0),
          )
        : new Prisma.Decimal(0);
      const unallocatedTransportAdjustment =
        Boolean(transportItem) &&
        row.ajustes.some((adjustment) => adjustment.distribuicoes.length === 0);
      const planned = base.plus(distributedAdjustments).toDecimalPlaces(2);
      const net = purchased.gross.minus(purchased.reversed);
      return {
        id: row.id,
        chave: `${row.id}:${supplierId}`,
        beneficioVinculoId: row.beneficioVinculoId,
        pessoa: row.beneficioVinculo.vinculo.pessoa.nomeCompleto,
        vinculoId: row.beneficioVinculo.vinculoId,
        equipe: row.beneficioVinculo.vinculo.equipe?.nome ?? null,
        vinculoStatus: row.beneficioVinculo.vinculo.status,
        beneficio: row.beneficioVinculo.tipo,
        fornecedor: transportItem?.fornecedor ?? row.configuracao.fornecedor,
        configuracaoId: row.configuracaoId,
        dias: row.quantidadeDias?.toFixed(2) ?? null,
        valorDiario: row.valorUnitario?.toFixed(2) ?? null,
        previsto: planned.toFixed(2),
        valorBase: base.toFixed(2),
        ajustes: distributedAdjustments.toFixed(2),
        compradoBruto: purchased.gross.toFixed(2),
        revertido: purchased.reversed.toFixed(2),
        compradoLiquido: net.toFixed(2),
        emPedido: purchased.reserved.toFixed(2),
        disponivel: planned.minus(net).minus(purchased.reserved).toFixed(2),
        alerta: unallocatedTransportAdjustment
          ? "Há ajuste de transporte sem distribuição por fornecedor. Revise antes de emitir pedido."
          : row.beneficioVinculo.vinculo.status === "AFASTADO"
            ? "Vínculo afastado: confira os dias antes da compra."
            : null,
      };
    });
  });
}

async function monthlyOrderDraft(
  tx: Tx,
  unitId: string,
  month: Date,
  type: string,
) {
  const previousMonth = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() - 1, 1),
  );
  const benefits = await tx.beneficioVinculo.findMany({
    where: {
      tipo: type as never,
      status: "ATIVO",
      inicioVigencia: { lte: monthEnd(month) },
      OR: [{ fimVigencia: null }, { fimVigencia: { gte: month } }],
      vinculo: { unidadeId: unitId, pessoa: { ativa: true } },
    },
    include: {
      vinculo: { include: { pessoa: true, equipe: true } },
      configuracaoRecorrente: { include: { fornecedor: true } },
      transporteItens: {
        where: {
          ativo: true,
          inicioVigencia: { lte: monthEnd(month) },
          OR: [{ fimVigencia: null }, { fimVigencia: { gte: month } }],
        },
        include: { fornecedor: true },
      },
      competencias: {
        where: { competencia: { in: [month, previousMonth] } },
        include: {
          transporteItens: { include: { fornecedor: true } },
          aquisicaoItens: { include: { aquisicao: true } },
          ajustes: true,
        },
      },
    },
    orderBy: { vinculo: { pessoa: { nomeCompleto: "asc" } } },
  });
  return benefits.map((benefit) => {
    const current = benefit.competencias.find(
      (item) => item.competencia.getTime() === month.getTime(),
    );
    const previous = benefit.competencias.find(
      (item) => item.competencia.getTime() === previousMonth.getTime(),
    );
    const protectedCurrent = Boolean(current?.aquisicaoItens.length);
    const previousRequested = previous
      ? previous.aquisicaoItens
          .filter((item) => item.aquisicao.status !== "CANCELADA")
          .reduce(
            (sum, item) =>
              sum.plus(item.valorSolicitado ?? item.valorReservado),
            new Prisma.Decimal(0),
          )
      : null;
    const transportItems = (
      current?.transporteItens.length
        ? current.transporteItens
        : benefit.transporteItens
    ).map((item) => ({
      tipoConducao: item.tipoConducao,
      fornecedorId: item.fornecedorId,
      fornecedor: item.fornecedor,
      valorDiario: item.valorDiario.toFixed(2),
    }));
    const days = current?.quantidadeDias ?? null;
    const daily = current?.valorUnitario ?? benefit.valorDiario;
    const monthly = current?.valorMensalBase ?? benefit.valorMensalRecorrente;
    const transportTotal = transportItems
      .reduce((sum, item) => sum.plus(item.valorDiario), new Prisma.Decimal(0))
      .times(days ?? 0);
    const suggested =
      benefit.tipo === "TRANSPORTE"
        ? transportTotal
        : (monthly ??
          (days != null && daily != null
            ? new Prisma.Decimal(days).times(daily)
            : null));
    return {
      beneficioVinculoId: benefit.id,
      pessoa: benefit.vinculo.pessoa.nomeCompleto,
      equipe: benefit.vinculo.equipe?.nome ?? null,
      vinculoStatus: benefit.vinculo.status,
      incluirAutomaticamente:
        benefit.vinculo.status === "ATIVO" && !protectedCurrent,
      quantidadeDias: days?.toFixed(2) ?? null,
      quantidade:
        current?.quantidade?.toFixed(2) ??
        benefit.quantidadeRecorrente?.toFixed(2) ??
        null,
      valorUnitario:
        daily?.toFixed(2) ??
        benefit.valorUnitarioRecorrente?.toFixed(2) ??
        null,
      valorMensalBase: monthly?.toFixed(2) ?? null,
      valorSugerido: suggested?.toDecimalPlaces(2).toFixed(2) ?? null,
      referenciaAnterior:
        previousRequested?.toDecimalPlaces(2).toFixed(2) ?? null,
      referenciaStatus: previous
        ? previousRequested?.isZero()
          ? "SEM_REFERENCIA"
          : "REFERENCIA_ANTERIOR"
        : "NOVA_AQUISICAO",
      competenciaId: current?.id ?? null,
      transporteItens: transportItems,
      impedimento: protectedCurrent
        ? "Já existe pedido para este lançamento."
        : null,
    };
  });
}

export async function monthlyReadiness(
  db: PrismaClient,
  month: Date,
  unitId?: string,
) {
  const units = await db.unidade.findMany({
    where: { ativa: true, ...(unitId ? { id: unitId } : {}) },
    orderBy: { nome: "asc" },
  });
  const rows = await db.beneficioVinculo.findMany({
    where: {
      status: "ATIVO",
      inicioVigencia: { lte: monthEnd(month) },
      OR: [{ fimVigencia: null }, { fimVigencia: { gte: month } }],
      vinculo: {
        unidadeId: { in: units.map((unit) => unit.id) },
        status: { in: ["ATIVO", "AFASTADO"] },
        pessoa: { ativa: true },
      },
    },
    include: {
      vinculo: true,
      competencias: {
        where: { competencia: month, status: { not: "CANCELADO" } },
        include: {
          ajustes: { include: { distribuicoes: true } },
          transporteItens: true,
          aquisicaoItens: { include: { aquisicao: true, movimentacoes: true } },
        },
      },
    },
  });
  const closings = await db.fechamentoCompetenciaBeneficio.findMany({
    where: {
      competencia: month,
      unidadeId: { in: units.map((unit) => unit.id) },
    },
  });
  return units.flatMap((unit) => {
    const byType = new Map<string, typeof rows>();
    for (const row of rows.filter((row) => row.vinculo.unidadeId === unit.id))
      byType.set(row.tipo, [...(byType.get(row.tipo) ?? []), row]);
    return [
      "TRANSPORTE",
      "ALIMENTACAO",
      "CESTA_BASICA",
      "PREMIACAO",
      "OUTRO",
    ].map((tipo) => {
      const benefits = byType.get(tipo) ?? [];
      const competence = benefits.flatMap((benefit) => benefit.competencias);
      const closed =
        closings.find((closing) => closing.unidadeId === unit.id)?.status ===
        "FECHADA";
      const items = competence.flatMap((row) => row.aquisicaoItens);
      const purchased = items.some((item) =>
        item.movimentacoes.some((movement) => movement.tipo === "CONFIRMACAO"),
      );
      const pendingOrder = items.some(
        (item) =>
          item.aquisicao.status === "PENDENTE" && item.status === "PENDENTE",
      );
      const pending = competence.some((row) => {
        const calculation = benefitCalculation({
          ...row,
          beneficioVinculo: { tipo },
        });
        return calculation.valorFinal == null || row.transporteRevisaoPendente;
      });
      const state = !benefits.length
        ? "NAO_APLICAVEL"
        : closed
          ? "FECHADA"
          : competence.length < benefits.length
            ? "NAO_PREPARADA"
            : pending
              ? "COM_PENDENCIAS"
              : pendingOrder && purchased
                ? "COMPRA_PARCIAL"
                : pendingOrder
                  ? "PEDIDO_EMITIDO"
                  : purchased
                    ? "COMPRA_CONFIRMADA"
                    : "PREPARADA";
      return {
        unidadeId: unit.id,
        unidade: unit.nome,
        tipo,
        estado: state,
        beneficiosElegiveis: benefits.length,
        competenciasPreparadas: competence.length,
      };
    });
  });
}

export function registerBenefitAcquisitions(
  app: FastifyInstance,
  db: PrismaClient,
) {
  app.get("/api/beneficios/resumo", async (req) => {
    const query = z
      .object({
        competencia: z.string().regex(/^\d{4}-\d{2}-01$/),
        unidadeId: z.string().uuid().optional(),
      })
      .parse(req.query);
    const rows = await db.beneficioCompetencia.findMany({
      where: {
        competencia: new Date(`${query.competencia}T00:00:00.000Z`),
        status: { not: "CANCELADO" },
        ...(query.unidadeId
          ? { beneficioVinculo: { vinculo: { unidadeId: query.unidadeId } } }
          : {}),
      },
      include: {
        ajustes: { include: { distribuicoes: true } },
        transporteItens: true,
        beneficioVinculo: true,
      },
    });
    const purchases = await purchaseSummary(
      db,
      rows.map((row) => row.id),
    );
    let previsto = new Prisma.Decimal(0);
    let compradoLiquido = new Prisma.Decimal(0);
    let emPedido = new Prisma.Decimal(0);
    for (const row of rows) previsto = previsto.plus(value(row));
    for (const item of purchases.values()) {
      emPedido = emPedido.plus(item.reserved);
      compradoLiquido = compradoLiquido.plus(item.gross.minus(item.reversed));
    }
    return {
      competencia: query.competencia,
      previsto: previsto.toFixed(2),
      compradoLiquido: compradoLiquido.toFixed(2),
      emPedido: emPedido.toFixed(2),
      lancamentosPendentes: rows.filter((row) => row.status === "PENDENTE")
        .length,
    };
  });
  app.get("/api/aquisicoes-beneficios/previa", async (req) => {
    const q = z
      .object({
        unidadeId: z.string().uuid(),
        competencia: z.string().regex(/^\d{4}-\d{2}-01$/),
      })
      .parse(req.query);
    return transaction(db, (tx) =>
      preview(tx, q.unidadeId, new Date(q.competencia)),
    );
  });
  app.get("/api/aquisicoes-beneficios/pedido/previa", async (req) => {
    const query = pedidoMensalSimulacaoSchema.parse(req.query);
    return transaction(db, (tx) =>
      monthlyOrderDraft(
        tx,
        query.unidadeId,
        new Date(query.competencia),
        query.tipo,
      ),
    );
  });
  app.post("/api/aquisicoes-beneficios/pedido/gerar", async (req, reply) => {
    const body = pedidoMensalGerarSchema.parse(req.body);
    const month = new Date(body.competencia);
    const result = await transaction(db, async (tx) =>
      idempotent(
        tx,
        idempotencyKey(req),
        "GERAR_PEDIDO_MENSAL_BENEFICIO",
        body,
        async () => {
          await ensureOpen(tx, body.unidadeId, month);
          const selected = body.itens.filter((item) => item.incluir);
          const benefits = await tx.beneficioVinculo.findMany({
            where: {
              id: { in: selected.map((item) => item.beneficioVinculoId) },
            },
            include: {
              vinculo: { include: { pessoa: true, equipe: true } },
              configuracaoRecorrente: true,
              transporteItens: { where: { ativo: true } },
            },
          });
          if (benefits.length !== selected.length)
            throw new DomainError(
              422,
              "Selecione benefícios válidos para o pedido.",
            );
          const inputByBenefit = new Map(
            selected.map((item) => [item.beneficioVinculoId, item]),
          );
          const competenceIds: string[] = [];
          for (const benefit of benefits) {
            const input = inputByBenefit.get(benefit.id)!;
            const active =
              benefit.status === "ATIVO" &&
              benefit.inicioVigencia <= monthEnd(month) &&
              (!benefit.fimVigencia || benefit.fimVigencia >= month);
            if (
              !active ||
              benefit.vinculo.unidadeId !== body.unidadeId ||
              !benefit.vinculo.pessoa.ativa
            )
              throw new DomainError(
                422,
                "A adesão não está elegível para esta competência.",
              );
            if (benefit.vinculo.status === "AFASTADO" && !input.motivoAfastado)
              throw new DomainError(
                422,
                "Informe o motivo para incluir vínculo afastado.",
              );
            if (
              benefit.vinculo.status !== "ATIVO" &&
              benefit.vinculo.status !== "AFASTADO"
            )
              throw new DomainError(
                422,
                "Somente vínculos ativos podem entrar no pedido.",
              );
            const existing = await tx.beneficioCompetencia.findFirst({
              where: { beneficioVinculoId: benefit.id, competencia: month },
              include: { aquisicaoItens: true },
            });
            if (existing?.aquisicaoItens.length)
              throw new DomainError(
                409,
                "Um pedido já protege este lançamento. Cancele ou complemente pelo fluxo próprio.",
              );
            let config = benefit.configuracaoRecorrente;
            const transportItems =
              input.transporteItens ??
              benefit.transporteItens.map((item) => ({
                tipoConducao: item.tipoConducao,
                fornecedorId: item.fornecedorId!,
                valorDiario: item.valorDiario.toFixed(2),
              }));
            if (benefit.tipo === "TRANSPORTE") {
              const supplierIds = [
                ...new Set(transportItems.map((item) => item.fornecedorId)),
              ];
              const configs = await tx.configuracaoBeneficio.findMany({
                where: {
                  unidadeId: body.unidadeId,
                  tipo: "TRANSPORTE",
                  ativa: true,
                  fornecedor: { ativo: true },
                  fornecedorId: { in: supplierIds },
                },
              });
              if (configs.length !== supplierIds.length)
                throw new DomainError(
                  422,
                  "Todo transporte precisa de fornecedor ativo configurado na unidade.",
                );
              config = configs[0]!;
            }
            if (!config)
              throw new DomainError(
                422,
                "Benefício sem fornecedor recorrente configurado.",
              );
            const competence = existing
              ? await tx.beneficioCompetencia.update({
                  where: { id: existing.id },
                  data: {
                    configuracaoId: config.id,
                    quantidadeDias:
                      input.quantidadeDias ?? existing.quantidadeDias,
                    quantidade: input.quantidade ?? existing.quantidade,
                    valorUnitario:
                      input.valorUnitario ?? existing.valorUnitario,
                    valorMensalBase:
                      benefit.tipo === "ALIMENTACAO"
                        ? (input.valorSolicitado ??
                          input.valorMensalBase ??
                          existing.valorMensalBase)
                        : (input.valorMensalBase ?? existing.valorMensalBase),
                    observacoes: input.observacoes ?? existing.observacoes,
                  },
                })
              : await tx.beneficioCompetencia.create({
                  data: {
                    beneficioVinculoId: benefit.id,
                    configuracaoId: config.id,
                    componente: "__PEDIDO_MENSAL__",
                    competencia: month,
                    quantidadeDias: input.quantidadeDias ?? null,
                    quantidade:
                      input.quantidade ?? benefit.quantidadeRecorrente ?? null,
                    valorUnitario:
                      input.valorUnitario ??
                      benefit.valorDiario ??
                      benefit.valorUnitarioRecorrente ??
                      null,
                    valorMensalBase:
                      benefit.tipo === "ALIMENTACAO"
                        ? (input.valorSolicitado ??
                          input.valorMensalBase ??
                          benefit.valorMensalRecorrente ??
                          null)
                        : (input.valorMensalBase ??
                          benefit.valorMensalRecorrente ??
                          null),
                    observacoes: input.observacoes ?? null,
                  },
                });
            if (benefit.tipo === "TRANSPORTE") {
              await tx.beneficioTransporteCompetenciaItem.deleteMany({
                where: { competenciaId: competence.id },
              });
              for (const item of transportItems)
                await tx.beneficioTransporteCompetenciaItem.create({
                  data: {
                    competenciaId: competence.id,
                    tipoConducao: item.tipoConducao,
                    fornecedorId: item.fornecedorId,
                    valorDiario: item.valorDiario,
                  },
                });
            }
            competenceIds.push(competence.id);
          }
          const rows = await preview(tx, body.unidadeId, month);
          const orderRows = rows.filter(
            (row) =>
              competenceIds.includes(String(row.id)) &&
              new Prisma.Decimal(String(row.disponivel)).greaterThan(0),
          );
          if (!orderRows.length)
            throw new DomainError(
              422,
              "Informe um valor solicitado maior que zero para gerar o pedido.",
            );
          const groups = new Map<string, Row[]>();
          for (const row of orderRows) {
            const supplier = row.fornecedor as Row;
            const key = `${row.beneficio}:${supplier.id}`;
            groups.set(key, [...(groups.get(key) ?? []), row]);
          }
          const orders = [];
          for (const items of groups.values()) {
            const first = items[0]!,
              supplier = first.fornecedor as Row;
            const order = await tx.aquisicaoBeneficio.create({
              data: {
                unidadeId: body.unidadeId,
                competencia: month,
                tipo: first.beneficio as never,
                fornecedorId: String(supplier.id),
                criadoPorId: req.userId!,
              },
            });
            for (const row of items) {
              const request = new Prisma.Decimal(
                String(row.disponivel),
              ).toDecimalPlaces(2);
              await tx.aquisicaoBeneficioItem.create({
                data: {
                  aquisicaoId: order.id,
                  competenciaId: String(row.id),
                  vinculoId: String(row.vinculoId),
                  pessoaNome: String(row.pessoa),
                  equipeNome: row.equipe ? String(row.equipe) : null,
                  destino: String(supplier.nome),
                  valorPrevisto: String(row.previsto),
                  valorSolicitado: request,
                  valorReservado: request,
                  composicao: {
                    dias: row.dias == null ? null : String(row.dias),
                    valorDiario:
                      row.valorDiario == null ? null : String(row.valorDiario),
                    valorBase: String(row.valorBase),
                    ajustes: String(row.ajustes),
                    transporte: row.beneficio === "TRANSPORTE",
                  },
                },
              });
            }
            await audit(
              tx,
              req.userId,
              "GERAR_PEDIDO_MENSAL_BENEFICIO",
              "aquisicaoBeneficio",
              order.id,
              undefined,
              order,
            );
            orders.push(order.id);
          }
          return {
            pedidos: orders.length,
            competencias: competenceIds.length,
            ids: orders,
          };
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
  app.get("/api/aquisicoes-beneficios/prontidao", async (req) => {
    const query = z
      .object({
        unidadeId: z.string().uuid().optional(),
        competencia: z.string().regex(/^\d{4}-\d{2}-01$/),
      })
      .parse(req.query);
    return monthlyReadiness(db, new Date(query.competencia), query.unidadeId);
  });

  app.post("/api/aquisicoes-beneficios/preparar", async (req) => {
    const body = aquisicaoPrepararSchema.parse(req.body);
    const month = new Date(body.competencia);
    return transaction(db, async (tx) =>
      idempotent(
        tx,
        idempotencyKey(req),
        "PREPARAR_AQUISICAO_BENEFICIO",
        body,
        async () => {
          await ensureOpen(tx, body.unidadeId, month);
          const override = new Map(
            body.excecoes.map((item) => [
              item.beneficioVinculoId,
              item.quantidadeDias,
            ]),
          );
          const benefits = await tx.beneficioVinculo.findMany({
            where: {
              tipo: {
                in: [
                  "TRANSPORTE",
                  "ALIMENTACAO",
                  "CESTA_BASICA",
                  "PREMIACAO",
                  "OUTRO",
                ],
              },
              status: "ATIVO",
              inicioVigencia: { lte: monthEnd(month) },
              OR: [{ fimVigencia: null }, { fimVigencia: { gte: month } }],
              vinculo: {
                unidadeId: body.unidadeId,
                status: { in: ["ATIVO", "AFASTADO"] },
              },
            },
            include: {
              vinculo: true,
              configuracaoRecorrente: { include: { fornecedor: true } },
              transporteItens: {
                where: {
                  ativo: true,
                  inicioVigencia: { lte: month },
                  OR: [{ fimVigencia: null }, { fimVigencia: { gte: month } }],
                },
                include: { fornecedor: true },
              },
            },
          });
          const created: string[] = [],
            pending: Row[] = [];
          for (const benefit of benefits) {
            const days =
              override.get(benefit.id) ??
              (benefit.tipo === "TRANSPORTE"
                ? body.diasTransporte
                : benefit.tipo === "ALIMENTACAO"
                  ? body.diasAlimentacao
                  : (benefit.quantidadeRecorrente ?? body.quantidadePadrao));
            if (days === undefined) {
              pending.push({
                beneficioVinculoId: benefit.id,
                motivo: "Informe os dias padrão ou a exceção individual.",
              });
              continue;
            }
            const transportSupplierIds = [
              ...new Set(
                benefit.transporteItens.flatMap((item) =>
                  item.fornecedorId ? [item.fornecedorId] : [],
                ),
              ),
            ];
            const configurations =
              benefit.tipo === "TRANSPORTE"
                ? await tx.configuracaoBeneficio.findMany({
                    where: {
                      unidadeId: body.unidadeId,
                      tipo: "TRANSPORTE",
                      fornecedorId: { in: transportSupplierIds },
                      ativa: true,
                      fornecedor: { ativo: true },
                    },
                  })
                : benefit.configuracaoRecorrente?.fornecedor.ativo
                  ? [benefit.configuracaoRecorrente]
                  : await tx.configuracaoBeneficio.findMany({
                      where: {
                        unidadeId: body.unidadeId,
                        tipo: benefit.tipo,
                        ativa: true,
                        fornecedor: { ativo: true },
                      },
                    });
            if (benefit.tipo !== "TRANSPORTE" && configurations.length > 1) {
              pending.push({
                beneficioVinculoId: benefit.id,
                motivo:
                  "Há mais de um fornecedor possível. Defina o fornecedor recorrente antes de preparar.",
              });
              continue;
            }
            const config = configurations[0];
            if (!config) {
              pending.push({
                beneficioVinculoId: benefit.id,
                motivo: "Benefício sem fornecedor configurado.",
              });
              continue;
            }
            if (benefit.tipo === "ALIMENTACAO" && benefit.valorDiario == null) {
              pending.push({
                beneficioVinculoId: benefit.id,
                motivo: "Alimentação sem valor diário configurado.",
              });
              continue;
            }
            if (
              benefit.tipo === "TRANSPORTE" &&
              (!benefit.transporteItens.length ||
                benefit.transporteItens.some((item) => !item.fornecedorId) ||
                configurations.length !== transportSupplierIds.length)
            ) {
              pending.push({
                beneficioVinculoId: benefit.id,
                motivo:
                  "Transporte sem itens vigentes ou com fornecedor não informado.",
              });
              continue;
            }
            if (
              !["ALIMENTACAO", "TRANSPORTE"].includes(benefit.tipo) &&
              benefit.valorUnitarioRecorrente == null
            ) {
              pending.push({
                beneficioVinculoId: benefit.id,
                motivo: "Benefício sem valor unitário configurado.",
              });
              continue;
            }
            const existing = await tx.beneficioCompetencia.findFirst({
              where: { beneficioVinculoId: benefit.id, competencia: month },
            });
            if (existing) continue;
            const competence = await tx.beneficioCompetencia.create({
              data: {
                beneficioVinculoId: benefit.id,
                configuracaoId: config.id,
                componente:
                  benefit.tipo === "TRANSPORTE"
                    ? "__RECORRENTE__"
                    : "__RECORRENTE__",
                competencia: month,
                ...(benefit.tipo === "ALIMENTACAO" ||
                benefit.tipo === "TRANSPORTE"
                  ? { quantidadeDias: days }
                  : {
                      quantidade: days,
                      valorUnitario: benefit.valorUnitarioRecorrente,
                    }),
                ...(benefit.tipo === "ALIMENTACAO"
                  ? { valorUnitario: benefit.valorDiario }
                  : {}),
                transporteRevisaoPendente: false,
              },
            });
            if (benefit.tipo === "TRANSPORTE")
              for (const item of benefit.transporteItens)
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
              "PREPARAR_AQUISICAO_BENEFICIO",
              "beneficioCompetencia",
              competence.id,
              undefined,
              competence,
            );
            created.push(competence.id);
          }
          return {
            criadas: created.length,
            pendencias: pending,
            itens: await preview(tx, body.unidadeId, month),
          };
        },
        {
          userId: req.userId,
          scope: `${body.unidadeId}:${body.competencia}`,
        },
      ),
    );
  });

  app.get("/api/aquisicoes-beneficios", async (req) => {
    const q = z
      .object({
        unidadeId: z.string().uuid().optional(),
        competencia: z
          .string()
          .regex(/^\d{4}-\d{2}-01$/)
          .optional(),
      })
      .parse(req.query);
    return db.aquisicaoBeneficio.findMany({
      where: {
        ...(q.unidadeId ? { unidadeId: q.unidadeId } : {}),
        ...(q.competencia ? { competencia: new Date(q.competencia) } : {}),
      },
      include: {
        fornecedor: true,
        itens: { include: { movimentacoes: true } },
      },
      orderBy: { criadoEm: "desc" },
    });
  });

  app.post("/api/aquisicoes-beneficios", async (req, reply) => {
    const body = aquisicaoPedidoSchema.parse(req.body);
    const month = new Date(body.competencia);
    const result = await transaction(db, async (tx) =>
      idempotent(
        tx,
        idempotencyKey(req),
        "CRIAR_PEDIDO_AQUISICAO_BENEFICIO",
        body,
        async () => {
          await ensureOpen(tx, body.unidadeId, month);
          const valid = await preview(tx, body.unidadeId, month);
          const byId = new Map(valid.map((item) => [String(item.chave), item]));
          const selected = body.itens.map((item) => ({
            input: item,
            row: byId.get(`${item.competenciaId}:${body.fornecedorId}`),
          }));
          if (
            new Set(body.itens.map((item) => item.competenciaId)).size !==
            body.itens.length
          )
            throw new DomainError(
              422,
              "Uma competência não pode aparecer duas vezes no mesmo pedido.",
            );
          for (const item of selected) {
            if (
              !item.row ||
              item.row.beneficio !== body.tipo ||
              String((item.row.fornecedor as Row).id) !== body.fornecedorId
            )
              throw new DomainError(
                422,
                "Item não pertence ao fornecedor, tipo ou competência selecionados.",
              );
            if (
              new Prisma.Decimal(item.input.valor).greaterThan(
                new Prisma.Decimal(String(item.row.disponivel)),
              )
            )
              throw new DomainError(
                422,
                "O valor do pedido excede o disponível para complementar.",
              );
          }
          const order = await tx.aquisicaoBeneficio.create({
            data: {
              unidadeId: body.unidadeId,
              competencia: month,
              tipo: body.tipo,
              fornecedorId: body.fornecedorId,
              ...(body.observacoes !== undefined
                ? { observacoes: body.observacoes }
                : {}),
              criadoPorId: req.userId!,
            },
          });
          for (const item of selected)
            await tx.aquisicaoBeneficioItem.create({
              data: {
                aquisicaoId: order.id,
                competenciaId: item.input.competenciaId,
                vinculoId: String(item.row!.vinculoId),
                pessoaNome: String(item.row!.pessoa),
                equipeNome: item.row!.equipe ? String(item.row!.equipe) : null,
                destino: String((item.row!.fornecedor as Row).nome),
                valorPrevisto: String(item.row!.previsto),
                valorReservado: item.input.valor,
              },
            });
          await audit(
            tx,
            req.userId,
            "CRIAR_PEDIDO_AQUISICAO_BENEFICIO",
            "aquisicaoBeneficio",
            order.id,
            undefined,
            order,
          );
          return tx.aquisicaoBeneficio.findUniqueOrThrow({
            where: { id: order.id },
            include: { fornecedor: true, itens: true },
          });
        },
        {
          userId: req.userId,
          scope: `${body.unidadeId}:${body.competencia}:${body.tipo}:${body.fornecedorId}`,
        },
      ),
    );
    reply.code(201);
    return result;
  });

  app.post("/api/aquisicoes-beneficios/:id/confirmar", async (req) => {
    const id = paramsId.parse(req.params).id,
      body = aquisicaoConfirmarSchema.parse(req.body);
    return transaction(db, async (tx) =>
      idempotent(
        tx,
        idempotencyKey(req),
        "CONFIRMAR_AQUISICAO_BENEFICIO",
        body,
        async () => {
          const order = await tx.aquisicaoBeneficio.findUnique({
            where: { id },
            include: { itens: { include: { movimentacoes: true } } },
          });
          if (!order) throw new DomainError(404, "Pedido não encontrado.");
          if (order.status !== "PENDENTE")
            throw new DomainError(409, "Pedido já foi encerrado.");
          await ensureOpen(tx, order.unidadeId, order.competencia);
          const items = new Map(order.itens.map((item) => [item.id, item]));
          if (
            new Set(body.itens.map((item) => item.itemId)).size !==
            body.itens.length
          )
            throw new DomainError(422, "Não repita item na confirmação.");
          for (const update of body.itens) {
            const item = items.get(update.itemId);
            if (!item || item.status !== "PENDENTE")
              throw new DomainError(422, "Item inválido para confirmação.");
            if (
              new Prisma.Decimal(update.valor).greaterThan(item.valorReservado)
            )
              throw new DomainError(
                422,
                "Valor confirmado excede o valor reservado.",
              );
            if (update.status === "REJEITADO" && !update.motivo)
              throw new DomainError(422, "Informe o motivo da rejeição.");
            if (
              update.status === "CONFIRMADO" &&
              !new Prisma.Decimal(update.valor).equals(item.valorReservado) &&
              !update.motivo
            )
              throw new DomainError(
                422,
                "Informe o motivo quando o valor confirmado for diferente do reservado.",
              );
            const confirmed = new Prisma.Decimal(update.valor);
            const partial =
              update.status === "CONFIRMADO" &&
              confirmed.lessThan(item.valorReservado);
            await tx.aquisicaoBeneficioItem.update({
              where: { id: item.id },
              data: {
                status: partial ? "PENDENTE" : update.status,
                ...(partial
                  ? { valorReservado: item.valorReservado.minus(confirmed) }
                  : {}),
              },
            });
            if (update.status === "CONFIRMADO")
              await tx.movimentacaoAquisicaoBeneficio.create({
                data: {
                  itemId: item.id,
                  tipo: "CONFIRMACAO",
                  valor: update.valor,
                  data: new Date(body.dataCompra),
                  ...(update.motivo ? { motivo: update.motivo } : {}),
                  criadoPorId: req.userId!,
                },
              });
          }
          const remaining = await tx.aquisicaoBeneficioItem.count({
            where: { aquisicaoId: id, status: "PENDENTE" },
          });
          const current = await tx.aquisicaoBeneficio.update({
            where: { id },
            data: {
              ...(remaining === 0 ? { status: "CONFIRMADA" } : {}),
              ...(body.referenciaExterna !== undefined
                ? { referenciaExterna: body.referenciaExterna }
                : {}),
              dataCompra: new Date(body.dataCompra),
            },
          });
          await audit(
            tx,
            req.userId,
            "CONFIRMAR_AQUISICAO_BENEFICIO",
            "aquisicaoBeneficio",
            id,
            order,
            current,
          );
          return current;
        },
        { userId: req.userId, scope: id },
      ),
    );
  });

  app.post("/api/aquisicoes-beneficios/:id/cancelar", async (req) => {
    const id = paramsId.parse(req.params).id;
    return transaction(db, async (tx) =>
      idempotent(
        tx,
        idempotencyKey(req),
        "CANCELAR_AQUISICAO_BENEFICIO",
        { id },
        async () => {
          const order = await tx.aquisicaoBeneficio.findUnique({
            where: { id },
          });
          if (!order) throw new DomainError(404, "Pedido não encontrado.");
          if (order.status !== "PENDENTE")
            throw new DomainError(
              409,
              "Somente pedidos pendentes podem ser cancelados.",
            );
          await ensureOpen(tx, order.unidadeId, order.competencia);
          await tx.aquisicaoBeneficioItem.updateMany({
            where: { aquisicaoId: id, status: "PENDENTE" },
            data: { status: "CANCELADO" },
          });
          const current = await tx.aquisicaoBeneficio.update({
            where: { id },
            data: { status: "CANCELADA" },
          });
          await audit(
            tx,
            req.userId,
            "CANCELAR_AQUISICAO_BENEFICIO",
            "aquisicaoBeneficio",
            id,
            order,
            current,
          );
          return current;
        },
        { userId: req.userId, scope: id },
      ),
    );
  });

  app.post("/api/aquisicoes-beneficios/itens/:id/reverter", async (req) => {
    const id = paramsId.parse(req.params).id,
      body = aquisicaoReverterSchema.parse(req.body);
    return transaction(db, async (tx) =>
      idempotent(
        tx,
        idempotencyKey(req),
        "REVERTER_AQUISICAO_BENEFICIO",
        body,
        async () => {
          const item = await tx.aquisicaoBeneficioItem.findUnique({
            where: { id },
            include: { aquisicao: true, movimentacoes: true },
          });
          if (!item) throw new DomainError(404, "Item não encontrado.");
          await ensureOpen(
            tx,
            item.aquisicao.unidadeId,
            item.aquisicao.competencia,
          );
          const confirmed = item.movimentacoes
            .filter((m) => m.tipo === "CONFIRMACAO")
            .reduce((sum, m) => sum.plus(m.valor), new Prisma.Decimal(0));
          const reversed = item.movimentacoes
            .filter((m) => m.tipo === "REVERSAO")
            .reduce((sum, m) => sum.plus(m.valor), new Prisma.Decimal(0));
          if (
            new Prisma.Decimal(body.valor).greaterThan(
              confirmed.minus(reversed),
            )
          )
            throw new DomainError(
              422,
              "A reversão excede o crédito líquido confirmado.",
            );
          const movement = await tx.movimentacaoAquisicaoBeneficio.create({
            data: {
              itemId: id,
              tipo: "REVERSAO",
              valor: body.valor,
              data: new Date(body.data),
              motivo: body.motivo,
              criadoPorId: req.userId!,
            },
          });
          await audit(
            tx,
            req.userId,
            "REVERTER_AQUISICAO_BENEFICIO",
            "movimentacaoAquisicaoBeneficio",
            movement.id,
            undefined,
            movement,
          );
          return movement;
        },
        { userId: req.userId, scope: id },
      ),
    );
  });
}
