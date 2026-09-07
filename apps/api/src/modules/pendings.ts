import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@duali/database";
import { listSchema, z } from "@duali/shared";
import { benefitAlerts } from "./benefits.js";
import { internshipAlerts } from "./internship.js";
import { leaveAlerts } from "./leave.js";

const querySchema = listSchema.extend({
  severidade: z
    .enum(["CRITICA", "ATENCAO", "REVISAO", "INFORMATIVA"])
    .optional(),
  codigo: z.string().max(80).optional(),
  modulo: z
    .enum(["IMPORTACAO", "VINCULO", "ESTAGIO", "DESCANSO", "BENEFICIO"])
    .optional(),
  origem: z.string().max(120).optional(),
});

export type PendingItem = {
  id: string;
  codigo: string;
  severidade: "CRITICA" | "ATENCAO" | "REVISAO" | "INFORMATIVA";
  modulo: "IMPORTACAO" | "VINCULO" | "ESTAGIO" | "DESCANSO" | "BENEFICIO";
  pessoa?: string;
  pessoaId?: string;
  unidadeId?: string;
  equipeId?: string;
  status: string;
  origem: string;
  descricao: string;
  prazo?: Date | null;
  href: string;
};

function legacyCode(status: string, messages: unknown): string {
  const text = JSON.stringify(messages).toLowerCase();
  if (status === "AGUARDANDO_DEPENDENCIA") return "DEPENDENCIA_NAO_PUBLICADA";
  if (status === "DUPLICIDADE" || text.includes("duplic"))
    return "DUPLICIDADE_POSSIVEL";
  if (text.includes("cpf")) return "CPF_INVALIDO";
  if (text.includes("ambígua") || text.includes("ambigua"))
    return "DATA_AMBIGUA";
  if (text.includes("data")) return "DATA_INVALIDA";
  if (text.includes("refer")) return "REFERENCIA_NAO_ENCONTRADA";
  return "APONTAMENTO_NAO_CLASSIFICADO";
}

async function allPendings(db: PrismaClient): Promise<PendingItem[]> {
  const [imports, internship, leave, benefits, activeLinks] = await Promise.all(
    [
      db.importacaoItem.findMany({
        where: {
          status: { in: ["REVISAO", "DUPLICIDADE", "AGUARDANDO_DEPENDENCIA"] },
        },
        include: { importacao: { select: { nomeArquivo: true } } },
        orderBy: { ordem: "asc" },
      }),
      internshipAlerts(db),
      leaveAlerts(db),
      benefitAlerts(db),
      db.vinculo.findMany({
        where: { status: "ATIVO" },
        include: { pessoa: true },
        orderBy: { dataAdmissao: "desc" },
      }),
    ],
  );
  const result: PendingItem[] = imports.map((item) => {
    const normalized = item.dadosNormalizados as Record<string, unknown>;
    const stored = Array.isArray(item.inconsistencias)
      ? (item.inconsistencias[0] as Record<string, unknown> | undefined)
      : undefined;
    const codigo = String(
      stored?.codigo ?? legacyCode(item.status, item.mensagens),
    );
    return {
      id: `importacao:${item.id}`,
      codigo,
      severidade:
        item.status === "AGUARDANDO_DEPENDENCIA" ? "ATENCAO" : "REVISAO",
      modulo: "IMPORTACAO",
      ...(typeof normalized.nomeCompleto === "string"
        ? { pessoa: normalized.nomeCompleto }
        : {}),
      ...(typeof normalized.pessoaId === "string"
        ? { pessoaId: normalized.pessoaId }
        : {}),
      status: item.status,
      origem: `${item.importacao.nomeArquivo} · ${item.aba}:${item.numeroLinha}`,
      descricao: Array.isArray(item.mensagens)
        ? item.mensagens.map(String).join("; ")
        : codigo,
      href: `/app/importacoes?id=${item.importacaoId}&item=${item.id}`,
    };
  });
  for (const alert of [...internship, ...leave, ...benefits]) {
    const module =
      alert.tipo === "BENEFICIO"
        ? "BENEFICIO"
        : alert.tipo === "DESCANSO"
          ? "DESCANSO"
          : "ESTAGIO";
    const code =
      alert.tipo === "BENEFICIO"
        ? "AJUSTE_BENEFICIO_PENDENTE"
        : alert.tipo === "DOCUMENTO"
          ? "DOCUMENTO_VENCIDO"
          : alert.tipo === "DESCANSO" &&
              alert.mensagem.toLowerCase().includes("negativo")
            ? "SALDO_NEGATIVO"
            : "REFERENCIA_NAO_ENCONTRADA";
    result.push({
      id: `${module.toLowerCase()}:${alert.id ?? alert.vinculoId}:${code}`,
      codigo: code,
      severidade: code === "SALDO_NEGATIVO" ? "CRITICA" : "ATENCAO",
      modulo: module,
      ...(typeof alert.pessoa === "string" ? { pessoa: alert.pessoa } : {}),
      ...(typeof alert.unidadeId === "string"
        ? { unidadeId: alert.unidadeId }
        : {}),
      ...("equipeId" in alert && typeof alert.equipeId === "string"
        ? { equipeId: alert.equipeId }
        : {}),
      status: "ABERTA",
      origem: module,
      descricao: alert.mensagem,
      ...(alert.prazo instanceof Date ? { prazo: alert.prazo } : {}),
      href: alert.vinculoId
        ? `/app/pessoas?vinculoId=${alert.vinculoId}`
        : "/app/pendencias",
    });
  }
  const byPerson = new Map<string, typeof activeLinks>();
  for (const link of activeLinks)
    byPerson.set(link.pessoaId, [...(byPerson.get(link.pessoaId) ?? []), link]);
  for (const links of byPerson.values())
    if (links.length > 1) {
      const link = links[0]!;
      result.push({
        id: `vinculo:${link.pessoaId}:multiplos`,
        codigo: "DUPLICIDADE_POSSIVEL",
        severidade: "ATENCAO",
        modulo: "VINCULO",
        pessoa: link.pessoa.nomeCompleto,
        pessoaId: link.pessoaId,
        unidadeId: link.unidadeId,
        ...(link.equipeId ? { equipeId: link.equipeId } : {}),
        status: "ABERTA",
        origem: "Cadastro de vínculos",
        descricao: `${links.length} vínculos ativos para a mesma pessoa.`,
        href: `/app/pessoas/${link.pessoaId}`,
      });
    }
  return result;
}

export function registerPendings(app: FastifyInstance, db: PrismaClient) {
  app.get("/api/pendencias", async (req) => {
    const q = querySchema.parse(req.query);
    let items = await allPendings(db);
    items = items.filter(
      (item) =>
        (!q.severidade || item.severidade === q.severidade) &&
        (!q.codigo || item.codigo === q.codigo) &&
        (!q.modulo || item.modulo === q.modulo) &&
        (!q.status || item.status === q.status) &&
        (!q.origem ||
          item.origem.toLowerCase().includes(q.origem.toLowerCase())) &&
        (!q.pessoaId || item.pessoaId === q.pessoaId) &&
        (!q.unidadeId || item.unidadeId === q.unidadeId) &&
        (!q.equipeId || item.equipeId === q.equipeId) &&
        (!q.q ||
          `${item.pessoa ?? ""} ${item.descricao} ${item.codigo}`
            .toLowerCase()
            .includes(q.q.toLowerCase())),
    );
    const total = items.length;
    return {
      items: items.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  });
  app.get("/api/pendencias/resumo", async () => {
    const items = await allPendings(db);
    return {
      total: items.length,
      criticas: items.filter((i) => i.severidade === "CRITICA").length,
      atencao: items.filter((i) => i.severidade === "ATENCAO").length,
      revisao: items.filter((i) => i.severidade === "REVISAO").length,
      dependencias: items.filter(
        (i) => i.codigo === "DEPENDENCIA_NAO_PUBLICADA",
      ).length,
    };
  });
}
