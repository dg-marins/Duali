import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@duali/database";
import {
  instituicaoSchema,
  estagioSchema,
  documentoSchema,
  seguroSchema,
  movimentacaoSchema,
  instituicaoRegraSchema,
} from "@duali/shared";
import { DomainError, type Tx, type Row } from "../core.js";
import { registerResource, type Resource } from "./resources.js";
import { documentState } from "./internship-cycle.js";
async function requireInternship(tx: Tx, data: Row, previous: Row | null) {
  if (previous && previous.vinculoId !== data.vinculoId)
    throw new DomainError(
      409,
      "O vínculo de um registro histórico não pode ser transferido.",
    );
  const v = await tx.vinculo.findUnique({
    where: { id: String(data.vinculoId) },
  });
  if (!v || v.tipo !== "ESTAGIO")
    throw new DomainError(422, "Selecione um vínculo de estágio.");
}

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const last = new Date(
    Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0),
  ).getUTCDate();
  result.setUTCDate(Math.min(day, last));
  return result;
}

async function validateDocument(tx: Tx, data: Row, previous: Row | null) {
  await requireInternship(tx, data, previous);
  if (!["TCE", "ADITIVO", "RENOVACAO"].includes(String(data.tipo))) return;
  if (
    !(data.inicioVigencia instanceof Date) ||
    Number.isNaN(data.inicioVigencia.getTime())
  ) {
    const vinculo = await tx.vinculo.findUnique({
      where: { id: String(data.vinculoId) },
      select: { dataAdmissao: true },
    });
    if (vinculo?.dataAdmissao) data.inicioVigencia = vinculo.dataAdmissao;
  }
  if (
    !(data.inicioVigencia instanceof Date) ||
    Number.isNaN(data.inicioVigencia.getTime())
  )
    throw new DomainError(
      422,
      "Informe o início da vigência para este documento.",
    );
  if (data.fimVigencia == null && !previous)
    data.fimVigencia = addMonths(data.inicioVigencia, 6);
  if (data.fimVigencia != null && data.fimVigencia < data.inicioVigencia)
    throw new DomainError(
      422,
      "O fim da vigência não pode ser anterior ao início.",
    );
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (data.status === "VIGENTE" && data.inicioVigencia > today)
    throw new DomainError(
      422,
      "Um documento planejado só pode ser marcado como assinado quando sua vigência começar.",
    );
}
export const internshipResources: Resource[] = [
  {
    path: "regras-estagio-instituicoes",
    model: "instituicaoRegraEstagio",
    schema: instituicaoRegraSchema,
    filters: ["instituicaoId", "unidadeId"],
    include: { instituicao: true, unidade: true },
  },
  {
    path: "instituicoes",
    model: "instituicaoEnsino",
    schema: instituicaoSchema,
    search: "nome",
  },
  {
    path: "estagios",
    model: "estagio",
    schema: estagioSchema,
    dates: ["dataTerminoPrevista"],
    filters: ["vinculoId", "instituicaoEnsinoId"],
    include: {
      vinculo: { include: { pessoa: true } },
      instituicaoEnsino: true,
    },
    before: requireInternship,
  },
  {
    path: "documentos",
    model: "documentoVinculo",
    schema: documentoSchema,
    dates: ["dataReferencia", "inicioVigencia", "fimVigencia"],
    filters: ["vinculoId", "tipo", "status"],
    include: { vinculo: { include: { pessoa: true } } },
    before: validateDocument,
  },
  {
    path: "seguros",
    model: "seguroEstagio",
    schema: seguroSchema,
    dates: ["inicioVigencia", "fimVigencia"],
    filters: ["vinculoId", "status"],
    search: "seguradora",
    before: requireInternship,
  },
  {
    path: "seguro-movimentacoes",
    model: "seguroMovimentacao",
    schema: movimentacaoSchema,
    dates: ["dataMovimentacao"],
    include: { seguroEstagio: true },
    before: async (_tx, _data, previous) => {
      if (previous)
        throw new DomainError(
          409,
          "Movimentações são históricas. Registre uma nova alteração.",
        );
    },
  },
];
export function registerInternship(app: FastifyInstance, db: PrismaClient) {
  for (const resource of internshipResources)
    registerResource(app, db, resource);
}
export async function internshipAlerts(db: PrismaClient) {
  const docs = await db.documentoVinculo.findMany({
    where: { status: { not: "CANCELADO" } },
    include: { vinculo: { include: { pessoa: true, unidade: true } } },
  });
  const seguros = await db.seguroEstagio.findMany({
    where: { status: { not: "ENCERRADO" } },
    include: { vinculo: { include: { pessoa: true, unidade: true } } },
  });
  const now = new Date();
  now.setUTCHours(0, 0, 0, 0);
  const documentAlerts = docs.flatMap((item) => {
    const state = documentState(item, now);
    if (state === "PLANEJADO") return [];
    const remaining = item.fimVigencia
      ? Math.ceil((item.fimVigencia.getTime() - now.getTime()) / 86400000)
      : null;
    if (
      state === "ASSINADO" &&
      remaining !== null &&
      remaining > item.vinculo.unidade.diasAlerta
    )
      return [];
    return [
      {
        id: item.id,
        vinculoId: item.vinculoId,
        pessoa: item.vinculo.pessoa.nomeCompleto,
        unidadeId: item.vinculo.unidadeId,
        tipo: "DOCUMENTO",
        mensagem:
          state === "VIGENCIA_INCOMPLETA"
            ? "Vigência do TCE/aditivo não informada"
            : state === "VENCIDO"
              ? "TCE/aditivo vencido"
              : state === "AGUARDANDO_ASSINATURA"
                ? "TCE/aditivo aguardando assinatura"
                : "Vencimento de TCE/aditivo próximo",
        prazo: item.fimVigencia,
      },
    ];
  });
  const insuranceAlerts = seguros.flatMap((item) => {
    const remaining = item.fimVigencia
      ? Math.ceil((item.fimVigencia.getTime() - now.getTime()) / 86400000)
      : null;
    if (
      remaining !== null &&
      remaining > item.vinculo.unidade.diasAlerta &&
      item.status !== "PENDENTE"
    )
      return [];
    return [
      {
        id: item.id,
        vinculoId: item.vinculoId,
        pessoa: item.vinculo.pessoa.nomeCompleto,
        unidadeId: item.vinculo.unidadeId,
        tipo: "SEGURO",
        mensagem:
          remaining === null
            ? "Vigência não informada"
            : remaining < 0
              ? "Vigência vencida"
              : item.status === "PENDENTE"
                ? "Seguro pendente"
                : "Vencimento próximo",
        prazo: item.fimVigencia,
      },
    ];
  });
  return [...documentAlerts, ...insuranceAlerts];
}
