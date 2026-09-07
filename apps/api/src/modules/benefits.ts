import type { FastifyInstance } from "fastify";
import { Prisma, type PrismaClient } from "@duali/database";
import {
  fornecedorSchema,
  configuracaoBeneficioSchema,
  beneficioVinculoSchema,
  competenciaSchema,
  beneficioAjusteSchema,
} from "@duali/shared";
import { DomainError, type Row } from "../core.js";
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
  const calculated =
    quantity != null && row.valorUnitario != null
      ? new Prisma.Decimal(String(quantity))
          .times(String(row.valorUnitario))
          .plus(adjustment)
          .toDecimalPlaces(2)
      : null;
  return {
    ...row,
    valorCalculado: calculated?.toFixed(2) ?? null,
    totalAjustes: adjustment.toFixed(2),
    divergencia:
      calculated && row.valorInformado != null
        ? new Prisma.Decimal(String(row.valorInformado))
            .minus(calculated)
            .toFixed(2)
        : null,
  };
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
    },
  },
  {
    path: "ajustes-beneficios",
    model: "beneficioAjuste",
    schema: beneficioAjusteSchema,
    include: { competencia: true },
    before: async (_tx, data, previous, userId) => {
      if (previous)
        throw new DomainError(
          409,
          "Ajustes são históricos. Registre uma compensação.",
        );
      data.criadoPor = userId;
    },
  },
];
export function registerBenefits(app: FastifyInstance, db: PrismaClient) {
  for (const resource of benefitResources) registerResource(app, db, resource);
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
