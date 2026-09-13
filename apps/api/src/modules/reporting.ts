import type { FastifyInstance } from "fastify";
import { Prisma, type PrismaClient } from "@duali/database";
import ExcelJS from "exceljs";
import { z, listSchema } from "@duali/shared";
import { audit, DomainError, type Row } from "../core.js";
import { balance } from "./leave-domain.js";
import { internshipAlerts } from "./internship.js";
import { benefitAlerts, benefitCalculation } from "./benefits.js";
import { leaveAlerts } from "./leave.js";
import { allPendings } from "./pendings.js";
export const reportKinds = [
  "pessoas",
  "estagios",
  "descansos",
  "beneficios",
  "aquisicoes-beneficios",
  "inconsistencias",
] as const;
const kindSchema = z.enum(reportKinds);
const dashboardQuerySchema = z
  .object({
    unidadeId: z.string().uuid().optional(),
    competencia: z
      .string()
      .regex(/^\d{4}-\d{2}-01$/)
      .optional(),
  })
  .strict();
type Query = ReturnType<typeof listSchema.parse>;
function linkWhere(q: Query): Prisma.VinculoWhereInput {
  return {
    ...(q.unidadeId ? { unidadeId: q.unidadeId } : {}),
    ...(q.equipeId ? { equipeId: q.equipeId } : {}),
    ...(q.vinculoId ? { id: q.vinculoId } : {}),
    ...(q.status
      ? { status: z.enum(["ATIVO", "AFASTADO", "DESLIGADO"]).parse(q.status) }
      : {}),
    ...(q.tipo
      ? { tipo: z.enum(["CLT", "ESTAGIO", "APRENDIZ"]).parse(q.tipo) }
      : {}),
    ...(q.q
      ? { pessoa: { nomeCompleto: { contains: q.q, mode: "insensitive" } } }
      : {}),
  };
}
function range(q: Query) {
  return {
    ...(q.inicio ? { gte: new Date(q.inicio) } : {}),
    ...(q.fim ? { lte: new Date(q.fim) } : {}),
  };
}
export async function operationalAlerts(db: PrismaClient) {
  return [
    ...(await internshipAlerts(db)),
    ...(await leaveAlerts(db)),
    ...(await benefitAlerts(db)),
  ];
}
export async function report(
  db: PrismaClient,
  kind: (typeof reportKinds)[number],
  q: Query,
): Promise<Row[]> {
  const where = linkWhere(q);
  let rows: Row[];
  if (kind === "beneficios") {
    const records = await db.beneficioCompetencia.findMany({
      where: { beneficioVinculo: { vinculo: where }, competencia: range(q) },
      include: {
        ajustes: true,
        configuracao: { include: { fornecedor: true } },
        beneficioVinculo: {
          include: {
            vinculo: { include: { pessoa: true, unidade: true, equipe: true } },
          },
        },
        transporteItens: { include: { cartaoTransporte: true } },
      },
      orderBy: { competencia: "desc" },
      take: 10001,
    });
    rows = records.map((r) => {
      const v = r.beneficioVinculo.vinculo,
        c = benefitCalculation(r);
      return {
        Pessoa: v.pessoa.nomeCompleto,
        Unidade: v.unidade.nome,
        Equipe: v.equipe?.nome ?? "",
        Vínculo: v.tipo,
        Benefício: r.beneficioVinculo.tipo,
        Fornecedor: r.configuracao.fornecedor.nome,
        Componente: r.componente,
        Competência: r.competencia.toISOString().slice(0, 10),
        Dias: r.quantidadeDias?.toString() ?? "",
        Quantidade: r.quantidade?.toString() ?? "",
        "Valor unitário": r.valorUnitario?.toFixed(2) ?? "",
        "Valor calculado": c.valorCalculado ?? "",
        "Valor informado": r.valorInformado?.toFixed(2) ?? "",
        Ajustes: c.totalAjustes,
        Divergência: c.divergencia ?? "",
        Status: r.status,
        Observações: r.observacoes ?? "",
      };
    });
  } else if (kind === "aquisicoes-beneficios") {
    const purchases = await db.aquisicaoBeneficio.findMany({
      where: {
        ...(q.unidadeId ? { unidadeId: q.unidadeId } : {}),
        ...(q.inicio || q.fim ? { competencia: range(q) } : {}),
      },
      include: {
        unidade: true,
        fornecedor: true,
        cartaoTransporte: true,
        itens: { include: { movimentacoes: true } },
      },
      orderBy: { competencia: "desc" },
      take: 10001,
    });
    rows = purchases.flatMap((purchase) =>
      purchase.itens.map((item) => {
        const gross = item.movimentacoes
          .filter((movement) => movement.tipo === "CONFIRMACAO")
          .reduce(
            (sum, movement) => sum.plus(movement.valor),
            new Prisma.Decimal(0),
          );
        const reversed = item.movimentacoes
          .filter((movement) => movement.tipo === "REVERSAO")
          .reduce(
            (sum, movement) => sum.plus(movement.valor),
            new Prisma.Decimal(0),
          );
        return {
          Pessoa: item.pessoaNome,
          Unidade: purchase.unidade.nome,
          Equipe: item.equipeNome ?? "",
          Competência: purchase.competencia.toISOString().slice(0, 10),
          Benefício: purchase.tipo,
          Fornecedor: purchase.fornecedor.nome,
          Cartão: purchase.cartaoTransporte?.nome ?? "",
          Destino: item.destino,
          Previsto: item.valorPrevisto.toFixed(2),
          Reservado: item.valorReservado.toFixed(2),
          "Comprado bruto": gross.toFixed(2),
          Revertido: reversed.toFixed(2),
          "Comprado líquido": gross.minus(reversed).toFixed(2),
          Situação: item.status,
          "Referência externa": purchase.referenciaExterna ?? "",
          "Data da compra":
            purchase.dataCompra?.toISOString().slice(0, 10) ?? "",
        };
      }),
    );
  } else if (kind === "inconsistencias") {
    const links = await db.vinculo.findMany({ where, select: { id: true } }),
      ids = new Set(links.map((v) => v.id));
    rows = (await operationalAlerts(db))
      .filter(
        (a) =>
          ids.has(a.vinculoId) &&
          (!a.prazo ||
            ((!q.inicio || a.prazo >= new Date(q.inicio)) &&
              (!q.fim || a.prazo <= new Date(q.fim)))),
      )
      .map((a) => ({
        Pessoa: a.pessoa,
        Tipo: a.tipo,
        Mensagem: a.mensagem,
        Prazo: a.prazo?.toISOString().slice(0, 10) ?? "",
      }));
  } else {
    const records = await db.vinculo.findMany({
      where: {
        ...where,
        ...(kind === "estagios" ? { tipo: "ESTAGIO" } : {}),
        ...(kind !== "descansos"
          ? { dataAdmissao: range(q) }
          : q.inicio || q.fim
            ? { direitos: { some: { dataAquisicao: range(q) } } }
            : {}),
      },
      include: {
        pessoa: true,
        unidade: true,
        equipe: true,
        estagio: { include: { instituicaoEnsino: true } },
      },
      orderBy: { dataAdmissao: "desc" },
      take: 10001,
    });
    rows = await Promise.all(
      records.map(async (v) => {
        const base = {
          Pessoa: v.pessoa.nomeCompleto,
          Unidade: v.unidade.nome,
          Equipe: v.equipe?.nome ?? "",
          Vínculo: v.tipo,
          Status: v.status,
          Admissão: v.dataAdmissao.toISOString().slice(0, 10),
        };
        if (kind === "descansos") {
          const b = await balance(db, v.id);
          return {
            ...base,
            Adquiridos: b.adquiridos,
            Consumidos: b.consumidos,
            Ajustes: b.ajustes,
            Saldo: b.saldo,
            Programados: b.programados,
            Alertas: b.alertas.join(" | "),
          };
        }
        if (kind === "estagios")
          return {
            ...base,
            Instituição: v.estagio?.instituicaoEnsino?.nome ?? "",
            Curso: v.estagio?.curso ?? "",
            Matrícula: v.estagio?.matriculaAcademica ?? "",
            Bolsa: v.estagio?.valorBolsa?.toFixed(2) ?? "",
          };
        return {
          ...base,
          CPF: v.pessoa.cpf ?? "",
          "E-mail": v.pessoa.email ?? "",
          Telefone: v.pessoa.telefone ?? "",
          Cargo: v.cargoFuncao ?? "",
          Desligamento: v.dataDesligamento?.toISOString().slice(0, 10) ?? "",
        };
      }),
    );
  }
  if (rows.length > 10000)
    throw new DomainError(422, "Mais de 10.000 registros. Refine os filtros.");
  return rows;
}
export function safeCell(value: unknown): string | number | boolean {
  if (typeof value === "number" || typeof value === "boolean") return value;
  // Leading control characters can hide formula prefixes in spreadsheet readers.
  const text = value == null ? "" : String(value);
  // eslint-disable-next-line no-control-regex
  return /^[\s\u0000-\u001f]*[=+@-]/.test(text) ? "'" + text : text;
}
export async function exportRows(rows: Row[], format: "csv" | "xlsx") {
  const headers = Object.keys(rows[0] ?? { Resultado: "" });
  if (format === "csv") {
    const escape = (v: unknown) =>
      '"' + String(safeCell(v)).replace(/"/g, '""') + '"';
    return Buffer.from(
      "\uFEFF" +
        [
          headers.map(escape).join(";"),
          ...rows.map((row) => headers.map((k) => escape(row[k])).join(";")),
        ].join("\r\n"),
      "utf8",
    );
  }
  const wb = new ExcelJS.Workbook(),
    sheet = wb.addWorksheet("Relatório");
  sheet.columns = headers.map((header) => ({ header, key: header, width: 24 }));
  for (const row of rows)
    sheet.addRow(Object.fromEntries(headers.map((k) => [k, safeCell(row[k])])));
  sheet.getRow(1).font = { bold: true };
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  if (rows.length)
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: rows.length + 1, column: headers.length },
    };
  return Buffer.from(await wb.xlsx.writeBuffer());
}
export function registerReporting(app: FastifyInstance, db: PrismaClient) {
  app.get("/api/dashboard", async (req) => {
    const q = dashboardQuerySchema.parse(req.query),
      where: Prisma.VinculoWhereInput = q.unidadeId
        ? { unidadeId: q.unidadeId }
        : {},
      today = new Date(),
      competence = q.competencia
        ? new Date(`${q.competencia}T00:00:00.000Z`)
        : new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1)),
      inThirtyDays = new Date(today);
    today.setUTCHours(0, 0, 0, 0);
    inThirtyDays.setUTCHours(0, 0, 0, 0);
    inThirtyDays.setUTCDate(inThirtyDays.getUTCDate() + 30);
    const benefitWhere = {
      competencia: competence,
      beneficioVinculo: { vinculo: where },
    } satisfies Prisma.BeneficioCompetenciaWhereInput;
    const [
      pessoas,
      clt,
      estagios,
      aprendizes,
      alerts,
      recent,
      imports,
      pendings,
      contracts,
      tces,
      benefits,
    ] = await Promise.all([
      db.pessoa.count({
        where: { vinculos: { some: { ...where, status: "ATIVO" } } },
      }),
      db.vinculo.count({ where: { ...where, tipo: "CLT", status: "ATIVO" } }),
      db.vinculo.count({
        where: { ...where, tipo: "ESTAGIO", status: "ATIVO" },
      }),
      db.vinculo.count({
        where: { ...where, tipo: "APRENDIZ", status: "ATIVO" },
      }),
      operationalAlerts(db),
      db.auditoria.findMany({
        orderBy: { criadoEm: "desc" },
        take: 10,
        select: {
          id: true,
          acao: true,
          entidade: true,
          criadoEm: true,
          usuario: { select: { nome: true } },
        },
      }),
      db.importacao.count({
        where: { status: { in: ["UPLOAD", "REVISAO", "PARCIAL"] } },
      }),
      allPendings(db),
      db.estagio.findMany({
        where: {
          vinculo: { ...where, tipo: "ESTAGIO", status: "ATIVO" },
          dataTerminoPrevista: { gte: today, lte: inThirtyDays },
        },
        include: {
          vinculo: { include: { pessoa: true, unidade: true } },
        },
        orderBy: { dataTerminoPrevista: "asc" },
      }),
      db.documentoVinculo.findMany({
        where: {
          tipo: "TCE",
          status: "PENDENTE",
          vinculo: { ...where, tipo: "ESTAGIO", status: "ATIVO" },
        },
        include: {
          vinculo: { include: { pessoa: true, unidade: true } },
        },
        orderBy: { fimVigencia: "asc" },
      }),
      db.beneficioCompetencia.findMany({
        where: benefitWhere,
        include: {
          ajustes: true,
          configuracao: true,
          beneficioVinculo: true,
          transporteItens: true,
        },
      }),
    ]);
    const selected = (
        await db.vinculo.findMany({ where, select: { id: true } })
      ).map((v) => v.id),
      ids = new Set(selected),
      filtered = alerts.filter((a) => ids.has(a.vinculoId)),
      filteredPendings = pendings
        .filter((item) => !q.unidadeId || item.unidadeId === q.unidadeId)
        .sort((left, right) => {
          const severity = {
            CRITICA: 0,
            ATENCAO: 1,
            REVISAO: 2,
            INFORMATIVA: 3,
          };
          return (
            severity[left.severidade] - severity[right.severidade] ||
            (left.prazo?.getTime() ?? Number.MAX_SAFE_INTEGER) -
              (right.prazo?.getTime() ?? Number.MAX_SAFE_INTEGER)
          );
        }),
      benefitTotals = benefits.reduce(
        (totals, row) => {
          const calculation = benefitCalculation(row),
            value = new Prisma.Decimal(String(calculation.valorFinal ?? 0));
          totals.total = totals.total.plus(value);
          totals.byType[row.beneficioVinculo.tipo] = (
            totals.byType[row.beneficioVinculo.tipo] ?? new Prisma.Decimal(0)
          ).plus(value);
          if (
            row.status === "PENDENTE" ||
            row.transporteRevisaoPendente ||
            Number(calculation.divergencia ?? 0) !== 0
          )
            totals.divergences++;
          return totals;
        },
        {
          total: new Prisma.Decimal(0),
          byType: {} as Record<string, Prisma.Decimal>,
          divergences: 0,
        },
      );
    return {
      competencia: competence.toISOString().slice(0, 10),
      pessoasAtivas: pessoas,
      cltsAtivos: clt,
      estagiariosAtivos: estagios,
      aprendizesAtivos: aprendizes,
      feriasProximas: filtered.filter(
        (a) => a.mensagem === "Prazo de férias próximo.",
      ).length,
      feriasPendentes: filtered.filter((a) =>
        /vencidas|anterior pendente/.test(a.mensagem),
      ).length,
      descansosProximos: filtered.filter((a) =>
        /descanso próxima/.test(a.mensagem),
      ).length,
      documentosProximos: filtered.filter((a) =>
        ["DOCUMENTO", "SEGURO"].includes(a.tipo),
      ).length,
      beneficiosPendentes: filtered.filter((a) => a.tipo === "BENEFICIO")
        .length,
      inconsistencias: filtered.length,
      importacoesPendentes: imports,
      pendenciasCriticas: filteredPendings.filter(
        (item) => item.severidade === "CRITICA",
      ).length,
      contratosVencendo: contracts.length,
      tcesAguardandoAssinatura: tces.length,
      feriasAtencao: filtered.filter((a) => a.tipo === "DESCANSO").length,
      custoBeneficios: benefitTotals.total.toFixed(2),
      divergenciasBeneficios: benefitTotals.divergences,
      distribuicaoVinculos: {
        CLT: clt,
        ESTAGIO: estagios,
        APRENDIZ: aprendizes,
      },
      custosPorBeneficio: Object.fromEntries(
        Object.entries(benefitTotals.byType).map(([type, value]) => [
          type,
          value.toFixed(2),
        ]),
      ),
      pendenciasPrioritarias: filteredPendings.slice(0, 20),
      kpiDetalhes: {
        pendenciasCriticas: filteredPendings.filter(
          (item) => item.severidade === "CRITICA",
        ),
        contratosVencendo: contracts.map((item) => ({
          id: item.id,
          pessoa: item.vinculo.pessoa.nomeCompleto,
          unidade: item.vinculo.unidade.nome,
          descricao: "Fim previsto do estágio",
          prazo: item.dataTerminoPrevista,
          href: `/app/pessoas/${item.vinculo.pessoaId}`,
        })),
        tcesAguardandoAssinatura: tces.map((item) => ({
          id: item.id,
          pessoa: item.vinculo.pessoa.nomeCompleto,
          unidade: item.vinculo.unidade.nome,
          descricao: "TCE aguardando assinatura",
          prazo: item.fimVigencia,
          href: `/app/pessoas/${item.vinculo.pessoaId}`,
        })),
        feriasAtencao: filtered
          .filter((item) => item.tipo === "DESCANSO")
          .map((item) => ({
            id: item.id,
            pessoa: item.pessoa,
            descricao: item.mensagem,
            prazo: item.prazo,
            href: `/app/pessoas?vinculoId=${item.vinculoId}`,
          })),
        custoBeneficios: benefits.map((item) => ({
          id: item.id,
          descricao: `${item.beneficioVinculo.tipo} · ${item.componente}`,
          valor: benefitCalculation(item).valorFinal,
          href: "/app/beneficios",
        })),
        divergenciasBeneficios: benefits
          .filter((item) => {
            const calculation = benefitCalculation(item);
            return (
              item.status === "PENDENTE" ||
              item.transporteRevisaoPendente ||
              Number(calculation.divergencia ?? 0) !== 0
            );
          })
          .map((item) => ({
            id: item.id,
            descricao: `${item.beneficioVinculo.tipo} · ${item.componente}`,
            valor: benefitCalculation(item).divergencia,
            href: "/app/pendencias?modulo=BENEFICIO",
          })),
      },
      alertas: filtered.slice(0, 100),
      atividades: recent,
    };
  });
  app.get("/api/relatorios/:tipo", async (req) => {
    const { tipo } = z.object({ tipo: kindSchema }).parse(req.params),
      q = listSchema.parse(req.query);
    const rows = await report(db, tipo, q);
    return {
      items: rows.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
      total: rows.length,
      page: q.page,
      pageSize: q.pageSize,
    };
  });
  app.get("/api/exportacoes/:tipo/:formato", async (req, reply) => {
    const { tipo, formato } = z
        .object({ tipo: kindSchema, formato: z.enum(["csv", "xlsx"]) })
        .parse(req.params),
      q = listSchema.parse(req.query);
    const rows = await report(db, tipo, q),
      buffer = await exportRows(rows, formato);
    await audit(db, req.userId, "EXPORTAR", "relatorio", null, undefined, {
      tipo,
      formato,
      filtros: q,
      registros: rows.length,
    });
    reply
      .type(
        formato === "csv"
          ? "text/csv; charset=utf-8"
          : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      )
      .header(
        "Content-Disposition",
        'attachment; filename="duali-' + tipo + "." + formato + '"',
      );
    return buffer;
  });
}
