import { currentEmployment } from "./current-employment.js";
import type { FastifyInstance } from "fastify";
import { Prisma, type PrismaClient } from "@duali/database";
import { listSchema, z } from "@duali/shared";
import { paramsId, transaction } from "../core.js";
import { balance } from "./leave-domain.js";
import { operationalAlerts } from "./reporting.js";
import { benefitCalculation } from "./benefits.js";
import { presentDocument, resolveDocumentCycle } from "./internship-cycle.js";

const operationalListSchema = listSchema.extend({
  segmento: z
    .enum(["CLT", "ESTAGIO", "APRENDIZ", "TRAINEE", "SEM_VINCULO", "INATIVO"])
    .optional(),
  instituicaoId: z.string().uuid().optional(),
  fornecedorId: z.string().uuid().optional(),
  visao: z.enum(["previsto", "comprado", "pedido", "pendente"]).optional(),
  categoria: z
    .enum(["ALIMENTACAO", "TRANSPORTE", "CESTA_BASICA", "PREMIACAO", "OUTRO"])
    .optional(),
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
  documentos: true,
} satisfies Prisma.VinculoInclude;

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
    ...(query.tipo
      ? { tipo: query.tipo as "CLT" | "ESTAGIO" | "APRENDIZ" | "TRAINEE" }
      : {}),
  };
}

const accentedLetters = "áàâãäåāéèêëēíìîïīóòôõöōúùûüūçñýÿ";
const foldAccents = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
const plainLetters = [...accentedLetters].map(foldAccents).join("");

function personSearch(
  q: string,
  nameIds: string[] = [],
): Prisma.PessoaWhereInput {
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
  if (nameIds.length) alternatives.push({ id: { in: nameIds } });
  if (digits) alternatives.push({ cpf: { contains: digits } });
  return {
    OR: alternatives,
  };
}

function iso(value: Date | null | undefined) {
  return value?.toISOString().slice(0, 10) ?? null;
}

export function registerOperational(app: FastifyInstance, db: PrismaClient) {
  app.get("/api/pessoas-operacional", async (req) =>
    transaction(db, async (db) => {
      const query = operationalListSchema.parse(req.query);
      const nameIds = query.q
        ? (
            await db.$queryRaw<Array<{ id: string }>>(Prisma.sql`
              SELECT id FROM "Pessoa"
              WHERE strpos(
                translate(lower("nomeCompleto"), ${accentedLetters}, ${plainLetters}),
                ${foldAccents(query.q)}
              ) > 0
            `)
          ).map((row) => row.id)
        : [];
      const secondary: Prisma.VinculoWhereInput = {
        status: query.status
          ? (query.status as "ATIVO" | "AFASTADO" | "DESLIGADO")
          : { in: ["ATIVO", "AFASTADO"] },
        ...(query.unidadeId ? { unidadeId: query.unidadeId } : {}),
        ...(query.equipeId ? { equipeId: query.equipeId } : {}),
        ...(query.instituicaoId
          ? { estagio: { instituicaoEnsinoId: query.instituicaoId } }
          : {}),
      };
      const where: Prisma.PessoaWhereInput = {
        ...(query.status ||
        query.unidadeId ||
        query.equipeId ||
        query.instituicaoId
          ? {
              vinculos: {
                some: {
                  ...secondary,
                  AND: [{ status: { in: ["ATIVO", "AFASTADO"] } }],
                },
              },
            }
          : {}),
        ...(query.q ? personSearch(query.q, nameIds) : {}),
      };
      const segments = [
        "CLT",
        "ESTAGIO",
        "APRENDIZ",
        "TRAINEE",
        "SEM_VINCULO",
        "INATIVO",
      ] as const;
      const segmentWhere = (
        segment: (typeof segments)[number],
      ): Prisma.PessoaWhereInput =>
        segment === "SEM_VINCULO"
          ? { ativa: true, vinculos: { none: {} } }
          : segment === "INATIVO"
            ? {
                OR: [
                  { ativa: false },
                  {
                    vinculos: {
                      some: {},
                      none: { status: { in: ["ATIVO", "AFASTADO"] } },
                    },
                  },
                ],
              }
            : {
                ativa: true,
                vinculos: {
                  some: {
                    tipo: segment,
                    status: { in: ["ATIVO", "AFASTADO"] },
                  },
                },
              };
      const selected = query.segmento ?? query.tipo;
      if (selected) z.enum(segments).parse(selected);
      const population = await db.pessoa.findMany({
        where,
        select: {
          vinculos: {
            where: { status: { in: ["ATIVO", "AFASTADO"] } },
            select: { status: true },
          },
        },
      });
      population.forEach((person) => currentEmployment(person.vinculos));
      const selectedWhere = selected
        ? { AND: [where, segmentWhere(selected as (typeof segments)[number])] }
        : where;
      const [records, total, counts] = await Promise.all([
        db.pessoa.findMany({
          where: selectedWhere,
          include: {
            vinculos: {
              include: linkInclude,
              orderBy: { dataAdmissao: "desc" },
            },
          },
          orderBy:
            query.sort === "nome"
              ? { nomeCompleto: query.direction }
              : { atualizadoEm: "desc" },
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
        db.pessoa.count({ where: selectedWhere }),
        Promise.all(
          segments.map((segment) =>
            db.pessoa.count({ where: { AND: [where, segmentWhere(segment)] } }),
          ),
        ),
      ]);
      return {
        items: records.map((person) => {
          const link = currentEmployment(person.vinculos);
          const cycle = link ? resolveDocumentCycle(link.documentos) : null;
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
            terminoPrevisto: iso(link?.estagio?.dataTerminoPrevista),
            instituicao: link?.estagio?.instituicaoEnsino ?? null,
            escala: link?.escala ?? null,
            documentoAtual: cycle?.atual ? presentDocument(cycle.atual) : null,
            proximoDocumento: cycle?.proximo
              ? presentDocument(cycle.proximo)
              : null,
            status:
              !person.ativa || (!link && person.vinculos.length > 0)
                ? "INATIVO"
                : (link?.status ?? "SEM_VINCULO"),
            vinculosAtivos: person.vinculos.filter(
              (item) => item.status === "ATIVO",
            ).length,
          };
        }),
        segmentos: Object.fromEntries(
          segments.map((segment, index) => [segment, counts[index]]),
        ),
        totalPopulacao: population.length,
        total,
        page: query.page,
        pageSize: query.pageSize,
      };
    }),
  );

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
                configuracaoRecorrente: { include: { fornecedor: true } },
                transporteItens: {
                  include: { fornecedor: true },
                },
                competencias: {
                  include: {
                    configuracao: { include: { fornecedor: true } },
                    ajustes: { include: { distribuicoes: true } },
                    transporteItens: { include: { fornecedor: true } },
                    aquisicaoItens: {
                      include: { aquisicao: true, movimentacoes: true },
                    },
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
      current = currentEmployment(person.vinculos),
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
            {
              entidade: "estagio",
              entidadeId: {
                in: person.vinculos.flatMap((link) =>
                  link.estagio ? [link.estagio.id] : [],
                ),
              },
            },
            {
              entidade: "documentoVinculo",
              entidadeId: {
                in: person.vinculos.flatMap((link) =>
                  link.documentos.map((doc) => doc.id),
                ),
              },
            },
            {
              entidade: "beneficioVinculo",
              entidadeId: {
                in: person.vinculos.flatMap((link) =>
                  link.beneficios.map((benefit) => benefit.id),
                ),
              },
            },
            {
              entidade: "beneficioCompetencia",
              entidadeId: {
                in: person.vinculos.flatMap((link) =>
                  link.beneficios.flatMap((benefit) =>
                    benefit.competencias.map((competence) => competence.id),
                  ),
                ),
              },
            },
          ],
        },
        include: { usuario: { select: { nome: true } } },
        orderBy: { criadoEm: "desc" },
        take: 100,
      });
    const presented = {
      ...person,
      vinculos: person.vinculos.map((link) => ({
        ...link,
        documentos: link.documentos.map((document) =>
          presentDocument(document),
        ),
        cicloDocumental: resolveDocumentCycle(link.documentos),
        beneficios: link.beneficios.map((benefit) => ({
          ...benefit,
          competencias: benefit.competencias.map((competence) =>
            benefitCalculation({
              ...competence,
              beneficioVinculo: { tipo: benefit.tipo },
            }),
          ),
        })),
      })),
    };
    return {
      pessoa: presented,
      vinculoAtual:
        presented.vinculos.find((link) => link.id === current?.id) ?? current,
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
    let purchasedIds: string[] | undefined;
    if (query.visao === "comprado") {
      const purchaseItems = await db.aquisicaoBeneficioItem.findMany({
        where: {
          competencia: {
            ...(start && end ? { competencia: { gte: start, lt: end } } : {}),
            beneficioVinculo: { vinculo: linkFilters(query, false) },
          },
        },
        include: { movimentacoes: true },
      });
      const byCompetence = new Map<string, Prisma.Decimal>();
      for (const item of purchaseItems)
        for (const movement of item.movimentacoes)
          byCompetence.set(
            item.competenciaId,
            (
              byCompetence.get(item.competenciaId) ?? new Prisma.Decimal(0)
            ).plus(
              movement.tipo === "CONFIRMACAO"
                ? movement.valor
                : movement.valor.negated(),
            ),
          );
      purchasedIds = [...byCompetence]
        .filter(([, amount]) => amount.greaterThan(0))
        .map(([id]) => id);
    }
    const where: Prisma.BeneficioCompetenciaWhereInput = {
      ...(query.visao && !query.status
        ? {
            status:
              query.visao === "pendente" ? "PENDENTE" : { not: "CANCELADO" },
          }
        : {}),
      ...(query.visao === "comprado" ? { id: { in: purchasedIds ?? [] } } : {}),
      ...(query.visao === "pedido"
        ? {
            aquisicaoItens: {
              some: {
                status: "PENDENTE",
                aquisicao: { status: "PENDENTE" },
              },
            },
          }
        : {}),
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
        ...(query.categoria ? { tipo: query.categoria } : {}),
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
          transporteItens: { include: { fornecedor: true } },
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
    return {
      items: items.map((item) => benefitCalculation(item)),
      total,
      page: query.page,
      pageSize: query.pageSize,
    };
  });
}
