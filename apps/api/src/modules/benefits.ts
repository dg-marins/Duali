import type { FastifyInstance } from "fastify";
import { Prisma, type PrismaClient } from "@duali/database";
import {
  fornecedorSchema,
  configuracaoBeneficioSchema,
  beneficioVinculoSchema,
  competenciaSchema,
  beneficioAjusteSchema,
  beneficioPeriodoSchema,
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
export function benefitCalculation(row: Row): Row {
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
    before: async (_tx, data, previous) => {
      if (
        previous &&
        (data.vinculoId !== previous.vinculoId || data.tipo !== previous.tipo)
      )
        throw new DomainError(409, "Vínculo e tipo históricos são imutáveis.");
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
      ajustes: true,
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
      });
      if (
        config.unidadeId !== benefit.vinculo.unidadeId ||
        config.tipo !== benefit.tipo
      )
        throw new DomainError(
          422,
          "Configuração incompatível com unidade/tipo do benefício.",
        );
      if (!previous && !config.ativa)
        throw new DomainError(422, "Configuração inativa.");
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
