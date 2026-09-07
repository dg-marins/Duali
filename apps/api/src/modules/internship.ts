import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@duali/database";
import {
  instituicaoSchema,
  estagioSchema,
  documentoSchema,
  seguroSchema,
  movimentacaoSchema,
} from "@duali/shared";
import { DomainError, type Tx, type Row } from "../core.js";
import { registerResource, type Resource } from "./resources.js";
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
export const internshipResources: Resource[] = [
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
    before: requireInternship,
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
  return [...docs, ...seguros].flatMap((item) => {
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
        tipo: "seguradora" in item ? "SEGURO" : "DOCUMENTO",
        mensagem:
          remaining === null
            ? "Vigência não informada"
            : remaining < 0
              ? "Vigência vencida"
              : item.status === "PENDENTE"
                ? "Documento/seguro pendente"
                : "Vencimento próximo",
        prazo: item.fimVigencia,
      },
    ];
  });
}
