import { createHash } from "node:crypto";
import { Prisma, type PrismaClient, type TipoBeneficio } from "@duali/database";
import { audit, type Tx } from "../core.js";

type Database = Tx | PrismaClient;

const monthEnd = (month: Date) =>
  new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));

export const nextMonth = (month: Date) =>
  new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 1));

const stableFingerprint = (value: unknown) =>
  createHash("sha256").update(JSON.stringify(value)).digest("hex");

type ForecastItemInput = {
  origemAquisicaoItemId: string;
  vinculoId: string;
  pessoaNome: string;
  fornecedorId: string;
  fornecedorNome: string;
  valorPrevisto: string;
  composicao: Prisma.InputJsonValue | typeof Prisma.JsonNull;
  incluido: boolean;
  motivoExclusao: string | null;
  impedimentos: string[];
  origemValor: string;
};

function exclusionReason(
  link:
    | {
        status: string;
        dataAdmissao: Date;
        dataDesligamento: Date | null;
        pessoa: { ativa: boolean };
      }
    | undefined,
  target: Date,
) {
  if (!link) return "VINCULO_NAO_ENCONTRADO";
  if (!link.pessoa.ativa) return "PESSOA_INATIVA";
  if (link.status === "AFASTADO") return "VINCULO_AFASTADO";
  if (link.status !== "ATIVO") return "VINCULO_DESLIGADO";
  if (link.dataAdmissao > monthEnd(target)) return "ADMISSAO_POSTERIOR";
  if (link.dataDesligamento && link.dataDesligamento < target)
    return "DESLIGAMENTO_ANTERIOR";
  return null;
}

async function generateCategoryForecast(
  tx: Tx,
  unitId: string,
  baseMonth: Date,
  type: TipoBeneficio,
  cause: string,
  userId: string | null,
) {
  const target = nextMonth(baseMonth);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`${unitId}:${type}:${target.toISOString()}`}))`;
  const series = await tx.previsaoBeneficioSerie.upsert({
    where: {
      unidadeId_tipo_competencia: {
        unidadeId: unitId,
        tipo: type,
        competencia: target,
      },
    },
    create: { unidadeId: unitId, tipo: type, competencia: target },
    update: {},
  });
  const current = await tx.previsaoBeneficioVersao.findFirst({
    where: { serieId: series.id, vigente: true },
  });
  if (current?.congeladaEm) return current;

  const orders = await tx.aquisicaoBeneficio.findMany({
    where: {
      unidadeId: unitId,
      competencia: baseMonth,
      tipo: type,
      status: { not: "CANCELADA" },
    },
    include: {
      fornecedor: true,
      itens: { where: { status: { not: "CANCELADO" } } },
    },
    orderBy: { criadoEm: "asc" },
  });
  const sourceItems = orders.flatMap((order) =>
    order.itens.map((item) => ({ order, item })),
  );
  const links = await tx.vinculo.findMany({
    where: {
      id: { in: [...new Set(sourceItems.map(({ item }) => item.vinculoId))] },
    },
    include: { pessoa: true },
  });
  const linksById = new Map(links.map((link) => [link.id, link]));
  const supplierIds = [...new Set(orders.map((order) => order.fornecedorId))];
  const activeConfigurations = await tx.configuracaoBeneficio.findMany({
    where: {
      unidadeId: unitId,
      tipo: type,
      ativa: true,
      fornecedorId: { in: supplierIds },
      fornecedor: { ativo: true },
    },
    select: { fornecedorId: true },
  });
  const activeSupplierIds = new Set(
    activeConfigurations.map((configuration) => configuration.fornecedorId),
  );
  const items: ForecastItemInput[] = sourceItems.map(({ order, item }) => {
    const reason = exclusionReason(linksById.get(item.vinculoId), target);
    const impediments = [
      ...(!activeSupplierIds.has(order.fornecedorId)
        ? ["FORNECEDOR_INATIVO"]
        : []),
      ...(item.composicao == null ? ["COMPOSICAO_INCOMPLETA"] : []),
    ];
    return {
      origemAquisicaoItemId: item.id,
      vinculoId: item.vinculoId,
      pessoaNome: item.pessoaNome,
      fornecedorId: order.fornecedorId,
      fornecedorNome: order.fornecedor.nome,
      valorPrevisto: (item.valorSolicitado ?? item.valorPrevisto)
        .toDecimalPlaces(2)
        .toFixed(2),
      composicao:
        item.composicao == null
          ? Prisma.JsonNull
          : (item.composicao as Prisma.InputJsonValue),
      incluido: reason == null,
      motivoExclusao: reason,
      impedimentos: impediments,
      origemValor:
        item.valorSolicitado == null
          ? "LEGADO_VALOR_PREVISTO"
          : "VALOR_SOLICITADO",
    };
  });
  const closing = await tx.fechamentoCompetenciaBeneficio.findUnique({
    where: {
      unidadeId_competencia: { unidadeId: unitId, competencia: baseMonth },
    },
  });
  const baseReaberta = closing?.status !== "FECHADA";
  const fingerprint = stableFingerprint({
    baseReaberta,
    items: items.map((item) => ({
      ...item,
      composicao: item.composicao,
    })),
  });
  if (current?.fingerprint === fingerprint) return current;

  const latest = await tx.previsaoBeneficioVersao.aggregate({
    where: { serieId: series.id },
    _max: { numero: true },
  });
  if (current)
    await tx.previsaoBeneficioVersao.update({
      where: { id: current.id },
      data: { vigente: false },
    });
  const created = await tx.previsaoBeneficioVersao.create({
    data: {
      serieId: series.id,
      unidadeId: unitId,
      tipo: type,
      competencia: target,
      competenciaBase: baseMonth,
      numero: (latest._max.numero ?? 0) + 1,
      causa: cause,
      baseReaberta,
      composicaoIncompleta: items.some((item) =>
        item.impedimentos.includes("COMPOSICAO_INCOMPLETA"),
      ),
      fingerprint,
      itens: { create: items },
    },
    include: { itens: true },
  });
  await audit(
    tx,
    userId,
    current ? "ATUALIZAR_PREVISAO_BENEFICIO" : "GERAR_PREVISAO_BENEFICIO",
    "previsaoBeneficioVersao",
    created.id,
    current ?? undefined,
    created,
  );
  return created;
}

export async function generateNextMonthForecasts(
  tx: Tx,
  unitId: string,
  baseMonth: Date,
  cause: string,
  userId: string | null,
) {
  const [sourceTypes, currentTypes] = await Promise.all([
    tx.aquisicaoBeneficio.findMany({
      where: {
        unidadeId: unitId,
        competencia: baseMonth,
        status: { not: "CANCELADA" },
      },
      distinct: ["tipo"],
      select: { tipo: true },
    }),
    tx.previsaoBeneficioVersao.findMany({
      where: {
        unidadeId: unitId,
        competencia: nextMonth(baseMonth),
        vigente: true,
      },
      select: { tipo: true },
    }),
  ]);
  const types = [
    ...new Set([...sourceTypes, ...currentTypes].map((item) => item.tipo)),
  ];
  const forecasts = [];
  for (const type of types)
    forecasts.push(
      await generateCategoryForecast(
        tx,
        unitId,
        baseMonth,
        type,
        cause,
        userId,
      ),
    );
  return forecasts;
}

export async function refreshExistingNextMonthForecasts(
  tx: Tx,
  unitId: string,
  baseMonth: Date,
  cause: string,
  userId: string | null,
) {
  const exists = await tx.previsaoBeneficioVersao.count({
    where: {
      unidadeId: unitId,
      competencia: nextMonth(baseMonth),
      vigente: true,
      congeladaEm: null,
    },
  });
  if (!exists) return [];
  return generateNextMonthForecasts(tx, unitId, baseMonth, cause, userId);
}

export async function refreshForecastsForLink(
  tx: Tx,
  linkId: string,
  userId: string | null,
) {
  const forecasts = await tx.previsaoBeneficioVersao.findMany({
    where: {
      vigente: true,
      congeladaEm: null,
      itens: { some: { vinculoId: linkId } },
    },
    select: { unidadeId: true, competenciaBase: true },
  });
  for (const forecast of forecasts)
    await generateNextMonthForecasts(
      tx,
      forecast.unidadeId,
      forecast.competenciaBase,
      "ALTERACAO_ELEGIBILIDADE",
      userId,
    );
}

export async function refreshForecastsForSupplier(
  tx: Tx,
  supplierId: string,
  userId: string | null,
) {
  const forecasts = await tx.previsaoBeneficioVersao.findMany({
    where: {
      vigente: true,
      congeladaEm: null,
      itens: { some: { fornecedorId: supplierId } },
    },
    select: { unidadeId: true, competenciaBase: true },
  });
  for (const forecast of forecasts)
    await generateNextMonthForecasts(
      tx,
      forecast.unidadeId,
      forecast.competenciaBase,
      "ALTERACAO_FORNECEDOR",
      userId,
    );
}

type CycleGroup = {
  unidadeId: string;
  unidade: string;
  tipo: string;
  fornecedorId: string;
  fornecedor: string;
  valorPrevisto: Prisma.Decimal;
  valorSolicitado: Prisma.Decimal;
  valorConcluido: Prisma.Decimal;
  saldoPendente: Prisma.Decimal;
  valorCancelado: Prisma.Decimal;
  ocorrencias: Set<string>;
  impedimentos: Set<string>;
  pessoasPrevistas: Set<string>;
  pessoasSolicitadas: Set<string>;
};

export async function benefitCycleSummary(
  db: Database,
  competence: Date,
  unitId?: string,
) {
  const [forecasts, orders] = await Promise.all([
    db.previsaoBeneficioVersao.findMany({
      where: {
        competencia: competence,
        vigente: true,
        ...(unitId ? { unidadeId: unitId } : {}),
      },
      include: { unidade: true, itens: true },
    }),
    db.aquisicaoBeneficio.findMany({
      where: {
        competencia: competence,
        ...(unitId ? { unidadeId: unitId } : {}),
      },
      include: {
        unidade: true,
        fornecedor: true,
        itens: { include: { movimentacoes: true } },
      },
    }),
  ]);
  const groups = new Map<string, CycleGroup>();
  const getGroup = (
    unit: { id: string; nome: string },
    type: string,
    supplier: { id: string; nome: string },
  ) => {
    const key = `${unit.id}:${type}:${supplier.id}`;
    const existing = groups.get(key);
    if (existing) return existing;
    const created: CycleGroup = {
      unidadeId: unit.id,
      unidade: unit.nome,
      tipo: type,
      fornecedorId: supplier.id,
      fornecedor: supplier.nome,
      valorPrevisto: new Prisma.Decimal(0),
      valorSolicitado: new Prisma.Decimal(0),
      valorConcluido: new Prisma.Decimal(0),
      saldoPendente: new Prisma.Decimal(0),
      valorCancelado: new Prisma.Decimal(0),
      ocorrencias: new Set(),
      impedimentos: new Set(),
      pessoasPrevistas: new Set(),
      pessoasSolicitadas: new Set(),
    };
    groups.set(key, created);
    return created;
  };
  for (const forecast of forecasts)
    for (const item of forecast.itens) {
      const group = getGroup(forecast.unidade, forecast.tipo, {
        id: item.fornecedorId,
        nome: item.fornecedorNome,
      });
      if (item.incluido) {
        group.valorPrevisto = group.valorPrevisto.plus(item.valorPrevisto);
        group.pessoasPrevistas.add(item.vinculoId);
      }
      for (const impediment of item.impedimentos)
        group.impedimentos.add(impediment);
      if (item.motivoExclusao) group.ocorrencias.add(item.motivoExclusao);
      if (forecast.baseReaberta) group.impedimentos.add("BASE_REABERTA");
    }
  for (const order of orders) {
    const group = getGroup(order.unidade, order.tipo, order.fornecedor);
    for (const item of order.itens) {
      const requested = item.valorSolicitado ?? item.valorPrevisto;
      if (order.status === "CANCELADA" || item.status === "CANCELADO") {
        group.valorCancelado = group.valorCancelado.plus(requested);
        group.ocorrencias.add("PEDIDO_CANCELADO");
        continue;
      }
      group.valorSolicitado = group.valorSolicitado.plus(requested);
      group.pessoasSolicitadas.add(item.vinculoId);
      if (order.status === "PENDENTE" && item.status === "PENDENTE")
        group.saldoPendente = group.saldoPendente.plus(item.valorReservado);
      if (item.status === "REJEITADO") group.ocorrencias.add("REJEICAO");
      let confirmed = new Prisma.Decimal(0);
      let reversed = new Prisma.Decimal(0);
      for (const movement of item.movimentacoes)
        if (movement.tipo === "CONFIRMACAO")
          confirmed = confirmed.plus(movement.valor);
        else {
          reversed = reversed.plus(movement.valor);
          group.ocorrencias.add("REVERSAO");
        }
      group.valorConcluido = group.valorConcluido.plus(
        confirmed.minus(reversed),
      );
      if (
        item.status === "PENDENTE" &&
        confirmed.minus(reversed).greaterThan(0)
      )
        group.ocorrencias.add("CONFIRMACAO_PARCIAL");
    }
  }
  const rows = [...groups.values()]
    .filter(
      (group) =>
        !group.valorPrevisto.isZero() ||
        !group.valorSolicitado.isZero() ||
        !group.valorConcluido.isZero() ||
        !group.valorCancelado.isZero(),
    )
    .sort(
      (left, right) =>
        left.unidade.localeCompare(right.unidade, "pt-BR") ||
        left.tipo.localeCompare(right.tipo, "pt-BR") ||
        left.fornecedor.localeCompare(right.fornecedor, "pt-BR"),
    )
    .map((group) => ({
      unidadeId: group.unidadeId,
      unidade: group.unidade,
      tipo: group.tipo,
      fornecedorId: group.fornecedorId,
      fornecedor: group.fornecedor,
      valorPrevisto: group.valorPrevisto.toDecimalPlaces(2).toFixed(2),
      valorSolicitado: group.valorSolicitado.toDecimalPlaces(2).toFixed(2),
      valorConcluido: group.valorConcluido.toDecimalPlaces(2).toFixed(2),
      saldoPendente: group.saldoPendente.toDecimalPlaces(2).toFixed(2),
      valorCancelado: group.valorCancelado.toDecimalPlaces(2).toFixed(2),
      pessoasPrevistas: group.pessoasPrevistas.size,
      pessoasSolicitadas: group.pessoasSolicitadas.size,
      vinculosPrevistos: [...group.pessoasPrevistas].sort(),
      vinculosSolicitados: [...group.pessoasSolicitadas].sort(),
      estado: group.saldoPendente.greaterThan(0)
        ? "SOLICITADO"
        : group.valorSolicitado.greaterThan(0)
          ? "CONCLUIDO"
          : group.valorPrevisto.greaterThan(0)
            ? "PREVISTO"
            : "CANCELADO",
      ocorrencias: [...group.ocorrencias].sort(),
      impedimentos: [...group.impedimentos].sort(),
    }));
  const totals = rows.reduce(
    (total, row) => ({
      previsto: total.previsto.plus(row.valorPrevisto),
      solicitado: total.solicitado.plus(row.valorSolicitado),
      concluido: total.concluido.plus(row.valorConcluido),
      pendente: total.pendente.plus(row.saldoPendente),
      cancelado: total.cancelado.plus(row.valorCancelado),
    }),
    {
      previsto: new Prisma.Decimal(0),
      solicitado: new Prisma.Decimal(0),
      concluido: new Prisma.Decimal(0),
      pendente: new Prisma.Decimal(0),
      cancelado: new Prisma.Decimal(0),
    },
  );
  return {
    competencia: competence.toISOString().slice(0, 10),
    possuiPrevisao: forecasts.length > 0,
    totais: {
      previsto: totals.previsto.toFixed(2),
      solicitado: totals.solicitado.toFixed(2),
      concluido: totals.concluido.toFixed(2),
      pendente: totals.pendente.toFixed(2),
      cancelado: totals.cancelado.toFixed(2),
    },
    itens: rows,
  };
}
