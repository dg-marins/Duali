import type { FastifyInstance } from "fastify";
import { Prisma, type PrismaClient } from "@duali/database";
import { listSchema, z } from "@duali/shared";
import { paramsId } from "../core.js";
import { balance } from "./leave-domain.js";
import { operationalAlerts } from "./reporting.js";

const operationalListSchema = listSchema.extend({
  instituicaoId: z.string().uuid().optional(),
  fornecedorId: z.string().uuid().optional(),
  competencia: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  sort: z.enum(["nome", "admissao", "status", "prazo"]).default("nome"),
  direction: z.enum(["asc", "desc"]).default("asc"),
});

const linkInclude = {
  unidade: true,
  equipe: true,
  estagio: { include: { instituicaoEnsino: true } },
} satisfies Prisma.VinculoInclude;

function currentLink<T extends { status: string; dataAdmissao: Date }>(
  links: T[],
) {
  return (
    [...links].sort((a, b) => {
      const active =
        Number(b.status === "ATIVO") - Number(a.status === "ATIVO");
      return active || b.dataAdmissao.getTime() - a.dataAdmissao.getTime();
    })[0] ?? null
  );
}

function linkFilters(
  query: z.infer<typeof operationalListSchema>,
  includeStatus = true,
): Prisma.VinculoWhereInput {
  return {
    ...(query.unidadeId ? { unidadeId: query.unidadeId } : {}),
    ...(query.equipeId ? { equipeId: query.equipeId } : {}),
    ...(includeStatus && query.status
      ? { status: query.status as "ATIVO" | "AFASTADO" | "DESLIGADO" }
      : {}),
    ...(query.tipo ? { tipo: query.tipo as "CLT" | "ESTAGIO" } : {}),
  };
}

function personSearch(q: string): Prisma.PessoaWhereInput {
  const digits = q.replace(/\D/g, "");
  const alternatives: Prisma.PessoaWhereInput[] = [
    { nomeCompleto: { contains: q, mode: "insensitive" } },
    { email: { contains: q, mode: "insensitive" } },
    {
      vinculos: {
        some: { matricula: { contains: q, mode: "insensitive" } },
      },
    },
    {
      vinculos: {
        some: {
          estagio: {
            matriculaAcademica: { contains: q, mode: "insensitive" },
          },
        },
      },
    },
  ];
  if (digits) alternatives.push({ cpf: { contains: digits } });
  return {
    OR: alternatives,
  };
}

function iso(value: Date | null | undefined) {
  return value?.toISOString().slice(0, 10) ?? null;
}

export function registerOperational(app: FastifyInstance, db: PrismaClient) {
  app.get("/api/pessoas-operacional", async (req) => {
    const query = operationalListSchema.parse(req.query),
      links = linkFilters(query);
    const where: Prisma.PessoaWhereInput = {
      ...(query.status || query.tipo || query.unidadeId || query.equipeId
        ? { vinculos: { some: links } }
        : {}),
      ...(query.q
        ? {
            ...personSearch(query.q),
          }
        : {}),
    };
    const [records, total] = await Promise.all([
      db.pessoa.findMany({
        where,
        include: {
          vinculos: { include: linkInclude, orderBy: { dataAdmissao: "desc" } },
        },
        orderBy:
          query.sort === "nome"
            ? { nomeCompleto: query.direction }
            : { atualizadoEm: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      db.pessoa.count({ where }),
    ]);
    return {
      items: records.map((person) => {
        const link = currentLink(person.vinculos);
        return {
          id: person.id,
          nomeCompleto: person.nomeCompleto,
          cpf: person.cpf,
          email: person.email,
          ativa: person.ativa,
          vinculo: link?.tipo ?? null,
          unidade: link?.unidade ?? null,
          equipe: link?.equipe ?? null,
          admissao: iso(link?.dataAdmissao),
          status: link?.status ?? (person.ativa ? "SEM_VINCULO" : "INATIVO"),
          vinculosAtivos: person.vinculos.filter(
            (item) => item.status === "ATIVO",
          ).length,
        };
      }),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  });

  app.get("/api/pessoas/:id/perfil", async (req) => {
    const { id } = paramsId.parse(req.params);
    const person = await db.pessoa.findUniqueOrThrow({
      where: { id },
      include: {
        vinculos: {
          orderBy: { dataAdmissao: "desc" },
          include: {
            unidade: true,
            equipe: true,
            equipesHistorico: {
              include: { equipe: true },
              orderBy: { inicioEm: "desc" },
            },
            estagio: { include: { instituicaoEnsino: true } },
            documentos: {
              orderBy: [{ dataReferencia: "desc" }, { fimVigencia: "desc" }],
            },
            seguros: {
              include: {
                movimentacoes: { orderBy: { dataMovimentacao: "desc" } },
              },
              orderBy: { inicioVigencia: "desc" },
            },
            direitos: {
              include: { consumos: true },
              orderBy: { dataAquisicao: "desc" },
            },
            periodos: {
              include: { consumos: true },
              orderBy: { dataInicio: "desc" },
            },
            ajustes: { orderBy: { criadoEm: "desc" } },
            beneficios: {
              include: {
                competencias: {
                  include: {
                    configuracao: { include: { fornecedor: true } },
                    ajustes: true,
                  },
                  orderBy: { competencia: "desc" },
                },
              },
              orderBy: { inicioVigencia: "desc" },
            },
          },
        },
      },
    });
    const active = person.vinculos.filter((item) => item.status === "ATIVO"),
      current = currentLink(person.vinculos),
      balances = Object.fromEntries(
        await Promise.all(
          person.vinculos.map(
            async (link) => [link.id, await balance(db, link.id)] as const,
          ),
        ),
      ),
      linkIds = person.vinculos.map((link) => link.id),
      alerts = (await operationalAlerts(db)).filter((alert) =>
        linkIds.includes(alert.vinculoId),
      ),
      audits = await db.auditoria.findMany({
        where: {
          OR: [
            { entidade: "pessoa", entidadeId: id },
            { entidade: "vinculo", entidadeId: { in: linkIds } },
          ],
        },
        include: { usuario: { select: { nome: true } } },
        orderBy: { criadoEm: "desc" },
        take: 100,
      });
    return {
      pessoa: person,
      vinculoAtual: current,
      saldos: balances,
      alertas: alerts,
      historico: audits,
      multiplosVinculosAtivos: active.length > 1,
    };
  });

  app.get("/api/estagiarios-operacional", async (req) => {
    const query = operationalListSchema.parse(req.query);
    const where: Prisma.VinculoWhereInput = {
      ...linkFilters(query),
      tipo: "ESTAGIO",
      estagio: query.instituicaoId
        ? { instituicaoEnsinoId: query.instituicaoId }
        : { isNot: null },
      ...(query.q
        ? {
            pessoa: personSearch(query.q),
          }
        : {}),
    };
    const [records, total, alerts] = await Promise.all([
      db.vinculo.findMany({
        where,
        include: { pessoa: true, ...linkInclude },
        orderBy: { dataAdmissao: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      db.vinculo.count({ where }),
      operationalAlerts(db),
    ]);
    return {
      items: await Promise.all(
        records.map(async (link) => ({
          id: link.id,
          pessoaId: link.pessoaId,
          pessoa: link.pessoa,
          unidade: link.unidade,
          equipe: link.equipe,
          admissao: iso(link.dataAdmissao),
          terminoPrevisto: iso(link.estagio?.dataTerminoPrevista),
          instituicao: link.estagio?.instituicaoEnsino ?? null,
          periodo: link.estagio?.periodoAcademico ?? null,
          bolsa: link.estagio?.valorBolsa?.toString() ?? null,
          saldo: (await balance(db, link.id)).saldo,
          status: link.status,
          alertas: alerts.filter((alert) => alert.vinculoId === link.id),
        })),
      ),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  });

  app.get("/api/descansos-operacional", async (req) => {
    const query = operationalListSchema.parse(req.query),
      where: Prisma.VinculoWhereInput = {
        ...linkFilters(query),
        ...(query.q ? { pessoa: personSearch(query.q) } : {}),
      };
    const [records, total] = await Promise.all([
      db.vinculo.findMany({
        where,
        include: { pessoa: true, unidade: true, equipe: true },
        orderBy: { dataAdmissao: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      db.vinculo.count({ where }),
    ]);
    const items = await Promise.all(
      records.map(async (link) => ({
        ...link,
        saldo: await balance(db, link.id),
      })),
    );
    return { items, total, page: query.page, pageSize: query.pageSize };
  });

  app.get("/api/beneficios-operacional", async (req) => {
    const query = operationalListSchema.parse(req.query),
      start = query.competencia
        ? new Date(`${query.competencia}-01`)
        : undefined;
    const end = start
      ? new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
      : undefined;
    const where: Prisma.BeneficioCompetenciaWhereInput = {
      ...(start && end ? { competencia: { gte: start, lt: end } } : {}),
      ...(query.fornecedorId
        ? { configuracao: { fornecedorId: query.fornecedorId } }
        : {}),
      ...(query.status
        ? {
            status: query.status as
              | "PENDENTE"
              | "CONFERIDO"
              | "PAGO"
              | "CANCELADO",
          }
        : {}),
      beneficioVinculo: {
        vinculo: {
          ...linkFilters(query, false),
          ...(query.q ? { pessoa: personSearch(query.q) } : {}),
        },
      },
    };
    const [items, total] = await Promise.all([
      db.beneficioCompetencia.findMany({
        where,
        include: {
          ajustes: true,
          configuracao: { include: { fornecedor: true } },
          beneficioVinculo: {
            include: {
              vinculo: {
                include: { pessoa: true, unidade: true, equipe: true },
              },
            },
          },
        },
        orderBy: { competencia: "desc" },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      db.beneficioCompetencia.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  });
}
