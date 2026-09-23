import { assertCurrentEmployment } from "./current-employment.js";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@duali/database";
import {
  instituicaoSchema,
  estagioSchema,
  documentoSchema,
  seguroSchema,
  movimentacaoSchema,
  instituicaoRegraSchema,
  z,
} from "@duali/shared";
import {
  audit,
  DomainError,
  paramsId,
  transaction,
  type Tx,
  type Row,
} from "../core.js";
import { registerResource, type Resource } from "./resources.js";
import { documentState } from "./internship-cycle.js";
import { refreshForecastsForLink } from "./benefit-cycle.js";
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
  if (previous && previous.tipo !== data.tipo)
    throw new DomainError(409, "O tipo de documento histórico é imutável.");
  if (data.tipo === "DISTRATO") {
    if (!(data.dataReferencia instanceof Date))
      throw new DomainError(422, "Informe a data de referência do distrato.");
    const link = await tx.vinculo.findUniqueOrThrow({
      where: { id: String(data.vinculoId) },
      select: { dataAdmissao: true },
    });
    if (data.dataReferencia < link.dataAdmissao)
      throw new DomainError(
        422,
        "O distrato não pode ser anterior à admissão.",
      );
    if (previous?.tipo === "DISTRATO" && data.status === "CANCELADO")
      throw new DomainError(
        409,
        "Use a ação de reversão para cancelar um distrato.",
      );
    if (data.status === "VIGENTE") {
      const active = await tx.documentoVinculo.count({
        where: {
          vinculoId: String(data.vinculoId),
          tipo: "DISTRATO",
          status: "VIGENTE",
          ...(previous ? { id: { not: String(previous.id) } } : {}),
        },
      });
      if (active)
        throw new DomainError(
          409,
          "Já existe um distrato ativo para este vínculo.",
        );
    }
    return;
  }
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
  if (data.tipo === "TCE") {
    const link = await tx.vinculo.findUniqueOrThrow({
      where: { id: String(data.vinculoId) },
      select: { dataAdmissao: true },
    });
    if (
      !previous &&
      data.inicioVigencia.toISOString().slice(0, 10) !==
        link.dataAdmissao.toISOString().slice(0, 10)
    )
      throw new DomainError(422, "O TCE deve iniciar na data de admissão.");
  }
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

async function syncDistrato(
  tx: Tx,
  document: Row,
  previous: Row | null,
  userId: string,
) {
  if (document.tipo !== "DISTRATO" || document.status !== "VIGENTE") return;
  const link = await tx.vinculo.findUniqueOrThrow({
    where: { id: String(document.vinculoId) },
  });
  const effective = document.dataReferencia as Date;
  const person = await tx.pessoa.findUniqueOrThrow({
    where: { id: link.pessoaId },
  });
  const otherCurrent = await tx.vinculo.count({
    where: {
      pessoaId: link.pessoaId,
      id: { not: link.id },
      status: { in: ["ATIVO", "AFASTADO"] },
    },
  });
  if (person.ativa && !otherCurrent) {
    const inactive = await tx.pessoa.update({
      where: { id: person.id },
      data: { ativa: false },
    });
    await audit(
      tx,
      userId,
      "INATIVAR_POR_DISTRATO",
      "pessoa",
      person.id,
      person,
      inactive,
    );
  }
  if (
    link.status === "DESLIGADO" &&
    link.dataDesligamento?.toISOString().slice(0, 10) ===
      effective.toISOString().slice(0, 10)
  )
    return;
  const current = await tx.vinculo.update({
    where: { id: link.id },
    data: { status: "DESLIGADO", dataDesligamento: effective },
  });
  await audit(
    tx,
    userId,
    previous ? "ALTERAR_POR_DISTRATO" : "DESLIGAR_POR_DISTRATO",
    "vinculo",
    link.id,
    link,
    current,
  );
  await refreshForecastsForLink(tx, link.id, userId);
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
    after: syncDistrato,
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
  app.post("/api/documentos/:id/reverter-distrato", async (req) => {
    const { id } = paramsId.parse(req.params);
    const body = z
      .object({ motivo: z.string().trim().min(3).max(1000) })
      .strict()
      .parse(req.body);
    return transaction(db, async (tx) => {
      const document = await tx.documentoVinculo.findUnique({ where: { id } });
      if (!document || document.tipo !== "DISTRATO")
        throw new DomainError(404, "Distrato não encontrado.");
      if (document.status !== "VIGENTE")
        throw new DomainError(
          409,
          "Somente um distrato vigente pode ser revertido.",
        );
      const link = await tx.vinculo.findUniqueOrThrow({
        where: { id: document.vinculoId },
      });
      if (
        link.status !== "DESLIGADO" ||
        link.dataDesligamento?.toISOString().slice(0, 10) !==
          document.dataReferencia?.toISOString().slice(0, 10)
      )
        throw new DomainError(
          409,
          "O vínculo não está desligado por este distrato.",
        );
      const cancelled = await tx.documentoVinculo.update({
        where: { id },
        data: {
          status: "CANCELADO",
          observacoes: [document.observacoes, `Reversão: ${body.motivo}`]
            .filter(Boolean)
            .join("\n"),
        },
      });
      await assertCurrentEmployment(tx, link.pessoaId, "ATIVO", link.id);
      const restored = await tx.vinculo.update({
        where: { id: link.id },
        data: { status: "ATIVO", dataDesligamento: null },
      });
      const person = await tx.pessoa.findUniqueOrThrow({
        where: { id: link.pessoaId },
      });
      if (!person.ativa) {
        const active = await tx.pessoa.update({
          where: { id: person.id },
          data: { ativa: true },
        });
        await audit(
          tx,
          req.userId,
          "REATIVAR_POR_REVERSAO_DISTRATO",
          "pessoa",
          person.id,
          person,
          active,
        );
      }
      await audit(
        tx,
        req.userId,
        "CANCELAR_DISTRATO",
        "documentoVinculo",
        id,
        document,
        cancelled,
      );
      await audit(
        tx,
        req.userId,
        "REVERTER_DESLIGAMENTO",
        "vinculo",
        link.id,
        link,
        restored,
      );
      await refreshForecastsForLink(tx, link.id, req.userId);
      return { documento: cancelled, vinculo: restored };
    });
  });
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
