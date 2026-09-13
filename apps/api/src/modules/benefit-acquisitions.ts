import type { FastifyInstance } from "fastify";
import { Prisma, type PrismaClient } from "@duali/database";
import {
  aquisicaoConfirmarSchema,
  aquisicaoPedidoSchema,
  aquisicaoPrepararSchema,
  aquisicaoReverterSchema,
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
import { benefitCalculation } from "./benefits.js";

const monthEnd = (month: Date) =>
  new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
const monthWhere = (month: Date) => ({ lte: monthEnd(month) });

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

async function purchaseSummary(tx: Tx, competenceIds: string[]) {
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
    const key = `${item.competenciaId}:${item.aquisicao.cartaoTransporteId ?? ""}`;
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
      ajustes: true,
      configuracao: { include: { fornecedor: true } },
      beneficioVinculo: {
        include: { vinculo: { include: { pessoa: true, equipe: true } } },
      },
      transporteItens: { include: { cartaoTransporte: true } },
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
                item.cartaoTransporteId,
                item,
              ]),
            ).values(),
          ]
        : [null];
    return items.map((transportItem) => {
      const cardId = transportItem?.cartaoTransporteId ?? null;
      const purchased = totals.get(`${row.id}:${cardId ?? ""}`) ?? {
        reserved: new Prisma.Decimal(0),
        gross: new Prisma.Decimal(0),
        reversed: new Prisma.Decimal(0),
      };
      const planned = cardId
        ? row.transporteItens
            .filter((item) => item.cartaoTransporteId === cardId)
            .reduce(
              (sum, item) => sum.plus(item.valorDiario),
              new Prisma.Decimal(0),
            )
            .times(row.quantidadeDias ?? 0)
            .toDecimalPlaces(2)
        : value(row);
      const net = purchased.gross.minus(purchased.reversed);
      return {
        id: row.id,
        chave: `${row.id}:${cardId ?? ""}`,
        beneficioVinculoId: row.beneficioVinculoId,
        pessoa: row.beneficioVinculo.vinculo.pessoa.nomeCompleto,
        vinculoId: row.beneficioVinculo.vinculoId,
        equipe: row.beneficioVinculo.vinculo.equipe?.nome ?? null,
        vinculoStatus: row.beneficioVinculo.vinculo.status,
        beneficio: row.beneficioVinculo.tipo,
        fornecedor: row.configuracao.fornecedor,
        configuracaoId: row.configuracaoId,
        dias: row.quantidadeDias?.toFixed(2) ?? null,
        valorDiario: row.valorUnitario?.toFixed(2) ?? null,
        cartaoTransporteId: cardId,
        previsto: planned.toFixed(2),
        compradoBruto: purchased.gross.toFixed(2),
        revertido: purchased.reversed.toFixed(2),
        compradoLiquido: net.toFixed(2),
        emPedido: purchased.reserved.toFixed(2),
        disponivel: planned.minus(net).minus(purchased.reserved).toFixed(2),
        cartoes: cardId ? [transportItem!.cartaoTransporte.nome] : [],
        alerta:
          row.beneficioVinculo.vinculo.status === "AFASTADO"
            ? "Vínculo afastado: confira os dias antes da compra."
            : null,
      };
    });
  });
}

export function registerBenefitAcquisitions(
  app: FastifyInstance,
  db: PrismaClient,
) {
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

  app.post("/api/aquisicoes-beneficios/preparar", async (req) => {
    const body = aquisicaoPrepararSchema.parse(req.body);
    const month = new Date(body.competencia);
    return transaction(db, async (tx) => {
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
          OR: [{ fimVigencia: null }, { fimVigencia: monthWhere(month) }],
          vinculo: {
            unidadeId: body.unidadeId,
            status: { in: ["ATIVO", "AFASTADO"] },
          },
        },
        include: {
          vinculo: true,
          configuracaoRecorrente: true,
          transporteItens: {
            where: {
              ativo: true,
              inicioVigencia: { lte: month },
              OR: [{ fimVigencia: null }, { fimVigencia: monthWhere(month) }],
            },
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
        const config =
          benefit.configuracaoRecorrente ??
          (await tx.configuracaoBeneficio.findFirst({
            where: {
              unidadeId: body.unidadeId,
              tipo: benefit.tipo,
              ativa: true,
            },
          }));
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
        if (benefit.tipo === "TRANSPORTE" && !benefit.transporteItens.length) {
          pending.push({
            beneficioVinculoId: benefit.id,
            motivo: "Transporte sem itens vigentes.",
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
              benefit.tipo === "TRANSPORTE" ? "Transporte" : "Alimentação",
            competencia: month,
            ...(benefit.tipo === "ALIMENTACAO" || benefit.tipo === "TRANSPORTE"
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
                cartaoTransporteId: item.cartaoTransporteId,
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
    });
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
        cartaoTransporte: true,
        itens: { include: { movimentacoes: true } },
      },
      orderBy: { criadoEm: "desc" },
    });
  });

  app.post("/api/aquisicoes-beneficios", async (req, reply) => {
    const body = aquisicaoPedidoSchema.parse(req.body);
    const month = new Date(body.competencia);
    const result = await transaction(db, async (tx) => {
      await ensureOpen(tx, body.unidadeId, month);
      const valid = await preview(tx, body.unidadeId, month);
      if (body.tipo === "TRANSPORTE" && !body.cartaoTransporteId)
        throw new DomainError(
          422,
          "Selecione o cartão para o pedido de transporte.",
        );
      const byId = new Map(valid.map((item) => [String(item.chave), item]));
      const selected = body.itens.map((item) => ({
        input: item,
        row: byId.get(`${item.competenciaId}:${body.cartaoTransporteId ?? ""}`),
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
          String((item.row.fornecedor as Row).id) !== body.fornecedorId ||
          String(item.row.cartaoTransporteId ?? "") !==
            String(body.cartaoTransporteId ?? "")
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
          ...(body.cartaoTransporteId
            ? { cartaoTransporteId: body.cartaoTransporteId }
            : {}),
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
            destino:
              body.cartaoTransporteId ??
              String((item.row!.fornecedor as Row).nome),
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
        include: { fornecedor: true, cartaoTransporte: true, itens: true },
      });
    });
    reply.code(201);
    return result;
  });

  app.post("/api/aquisicoes-beneficios/:id/confirmar", async (req) => {
    const id = paramsId.parse(req.params).id,
      body = aquisicaoConfirmarSchema.parse(req.body);
    return transaction(db, async (tx) => {
      const order = await tx.aquisicaoBeneficio.findUnique({
        where: { id },
        include: { itens: { include: { movimentacoes: true } } },
      });
      if (!order) throw new DomainError(404, "Pedido não encontrado.");
      if (order.status !== "PENDENTE")
        throw new DomainError(409, "Pedido já foi encerrado.");
      await ensureOpen(tx, order.unidadeId, order.competencia);
      const items = new Map(order.itens.map((item) => [item.id, item]));
      for (const update of body.itens) {
        const item = items.get(update.itemId);
        if (!item || item.status !== "PENDENTE")
          throw new DomainError(422, "Item inválido para confirmação.");
        if (new Prisma.Decimal(update.valor).greaterThan(item.valorReservado))
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
        await tx.aquisicaoBeneficioItem.update({
          where: { id: item.id },
          data: { status: update.status },
        });
        if (update.status === "CONFIRMADO")
          await tx.movimentacaoAquisicaoBeneficio.create({
            data: {
              itemId: item.id,
              tipo: "CONFIRMACAO",
              valor: update.valor,
              data: new Date(body.dataCompra),
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
    });
  });

  app.post("/api/aquisicoes-beneficios/:id/cancelar", async (req) => {
    const id = paramsId.parse(req.params).id;
    return transaction(db, async (tx) => {
      const order = await tx.aquisicaoBeneficio.findUnique({ where: { id } });
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
    });
  });

  app.post("/api/aquisicoes-beneficios/itens/:id/reverter", async (req) => {
    const id = paramsId.parse(req.params).id,
      body = aquisicaoReverterSchema.parse(req.body);
    return transaction(db, async (tx) => {
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
      if (new Prisma.Decimal(body.valor).greaterThan(confirmed.minus(reversed)))
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
    });
  });
}
