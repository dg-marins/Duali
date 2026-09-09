import * as XLSX from "@e965/xlsx";
import { randomUUID } from "node:crypto";
import { competenciaSchema } from "@duali/shared";
import { audit, DomainError, json, type Row, type Tx } from "../core.js";
import { classifyNotes, type ImportIssue } from "./import-issues.js";
import type { Sheet } from "./import-files.js";

export type AuditedProfile =
  | "FERIAS_FUNCIONARIOS"
  | "DESCANSO_ESTAGIARIOS"
  | "BENEFICIOS_2026";
type RawSheet = { nome: string; rows: unknown[][] };
export type AuditedWorkbook = {
  profile: AuditedProfile;
  raw: RawSheet[];
  sheets: Sheet[];
};
const norm = (v: unknown) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();
const text = (v: unknown) => String(v ?? "").trim();
export const money = (v: unknown) => {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v !== "string") return null;
  const value = v.trim().replace(/^R\$\s*/i, "");
  // Ponto sem vírgula é ambíguo: pode indicar decimal ou milhar.
  if (!/^[+-]?(?:\d+(?:,\d+)?|\d{1,3}(?:\.\d{3})+,\d+)$/.test(value))
    return null;
  const n = Number(value.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};
const iso = (v: unknown): string | null => {
  if (v instanceof Date && !Number.isNaN(v.getTime()))
    return v.toISOString().slice(0, 10);
  if (typeof v === "number" && v > 1000)
    return XLSX.SSF.parse_date_code(v)
      ? new Date(
          Date.UTC(
            XLSX.SSF.parse_date_code(v).y,
            XLSX.SSF.parse_date_code(v).m - 1,
            XLSX.SSF.parse_date_code(v).d,
          ),
        )
          .toISOString()
          .slice(0, 10)
      : null;
  const match = text(v).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return /^\d{4}-\d{2}-\d{2}$/.test(text(v)) ? text(v) : null;
  const value = `${match[3]}-${match[2]!.padStart(2, "0")}-${match[1]!.padStart(2, "0")}`;
  return new Date(value).toISOString().slice(0, 10) === value ? value : null;
};
const monthNumber: Record<string, number> = {
  janeiro: 1,
  fevereiro: 2,
  marco: 3,
  abril: 4,
  maio: 5,
  junho: 6,
  julho: 7,
  agosto: 8,
  setembro: 9,
  outubro: 10,
  novembro: 11,
  dezembro: 12,
};

export function identifyAuditedProfile(
  filename: string,
): AuditedProfile | null {
  const name = norm(filename);
  if (name.includes("beneficios") && name.includes("2026"))
    return "BENEFICIOS_2026";
  if (name.includes("planilha de ferias funcionarios"))
    return "FERIAS_FUNCIONARIOS";
  if (name.includes("ferias_planilha definitiva"))
    return "DESCANSO_ESTAGIARIOS";
  return null;
}

export function readAuditedWorkbook(
  filename: string,
  buffer: Buffer,
): AuditedWorkbook | null {
  const profile = identifyAuditedProfile(filename);
  if (!profile) return null;
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: "buffer",
      cellDates: true,
      cellFormula: true,
    });
  } catch (error) {
    const detail =
      error instanceof Error && /password-protected/i.test(error.message)
        ? " O arquivo está protegido por senha; salve uma cópia XLSX sem senha."
        : "";
    throw new DomainError(
      422,
      `Não foi possível ler a planilha especializada.${detail}`,
    );
  }
  const raw = workbook.SheetNames.map((nome) => ({
    nome,
    rows: XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[nome]!, {
      header: 1,
      defval: "",
      raw: true,
    }),
  }));
  const sheets = raw.map(({ nome, rows }) => ({
    nome,
    colunas: Array.from(
      { length: Math.max(0, ...rows.map((r) => r.length)) },
      (_, i) => `COLUNA_${i + 1}`,
    ),
    linhas: rows
      .map((r, i) => ({
        numero: i + 1,
        dados: Object.fromEntries(r.map((v, j) => [`COLUNA_${j + 1}`, v])),
      }))
      .filter((r) => Object.values(r.dados).some((v) => text(v))),
  }));
  return { profile, raw, sheets };
}

async function item(
  tx: Tx,
  input: {
    importId: string;
    order: number;
    group: string;
    domain: string;
    sheet: string;
    line: number;
    original: unknown;
    data: Row;
    refs?: Row;
    action?: "CRIAR" | "VINCULAR" | "PENDENTE";
    target?: string;
    existing?: Row | null;
    issues?: ImportIssue[];
  },
) {
  const target = input.target ?? randomUUID(),
    messages = (input.issues ?? []).map((i) => i.mensagem),
    action = input.action ?? "CRIAR";
  await tx.importacaoItem.create({
    data: {
      importacaoId: input.importId,
      ordem: input.order,
      grupo: input.group,
      dominio: input.domain,
      aba: input.sheet,
      numeroLinha: input.line,
      dadosOriginais: json(input.original),
      dadosNormalizados: json(input.data),
      referencias: json(input.refs ?? {}),
      ...(input.existing
        ? {
            dadosAnteriores: json(input.existing),
            alvoId: String(input.existing.id),
          }
        : {}),
      status:
        action === "PENDENTE"
          ? input.issues?.some((i) => i.codigo.includes("DUPLICIDADE"))
            ? "DUPLICIDADE"
            : "REVISAO"
          : "VALIDO",
      acao: action,
      mensagens: json(messages),
      inconsistencias: json(input.issues ?? []),
      classificacoes: json(classifyNotes(input.data)),
      candidatos: json(
        input.existing
          ? [
              {
                id: input.existing.id,
                nome: input.existing.nomeCompleto ?? input.existing.nome,
                evidencia: "Nome exato",
              },
            ]
          : [],
      ),
      destinoId: target,
      revisado: action !== "PENDENTE",
    },
  });
  return target;
}

async function unitTarget(
  tx: Tx,
  cache: Map<string, string>,
  importId: string,
  order: { value: number },
  sheet: string,
  code: string,
) {
  const key =
    norm(code).includes("df") || norm(code).includes("bsb")
      ? "DF"
      : norm(code).includes("sp")
        ? "SP"
        : "RJ";
  if (cache.has(key)) return cache.get(key)!;
  const existing = await tx.unidade.findFirst({
    where: { OR: [{ sigla: key }, { uf: key }] },
  });
  const target = await item(tx, {
    importId,
    order: order.value++,
    group: `unidade_${key}`,
    domain: "unidades",
    sheet,
    line: 1,
    original: { unidade: code },
    data: existing ?? { nome: key, sigla: key, uf: key },
    action: existing ? "VINCULAR" : "CRIAR",
    existing,
  });
  cache.set(key, target);
  return target;
}

async function personAndLink(
  tx: Tx,
  importId: string,
  order: { value: number },
  units: Map<string, string>,
  sheet: string,
  line: number,
  row: unknown[],
  kind: "CLT" | "ESTAGIO" | "APRENDIZ",
  name: string,
  admission: unknown,
  scale?: string,
  requireExisting = false,
) {
  const candidates = await tx.pessoa.findMany({
    where: { nomeCompleto: { equals: name, mode: "insensitive" } },
    take: 2,
  });
  const personExisting = candidates.length === 1 ? candidates[0]! : null;
  const personIssues: ImportIssue[] = candidates.length
    ? [
        {
          codigo:
            candidates.length > 1
              ? "DUPLICIDADE_POSSIVEL"
              : "DUPLICIDADE_PROVAVEL",
          severidade: "REVISAO",
          mensagem:
            "Pessoa encontrada apenas por nome; confirme a correspondência.",
        },
      ]
    : requireExisting
      ? [
          {
            codigo: "PESSOA_NAO_IDENTIFICADA",
            severidade: "REVISAO",
            mensagem:
              "O arquivo não contém identificadores suficientes para criar a pessoa com segurança.",
          },
        ]
      : [];
  const personTarget = await item(tx, {
    importId,
    order: order.value++,
    group: `pessoa_${sheet}_${line}`,
    domain: "pessoas",
    sheet,
    line,
    original: row,
    data: personExisting ?? { nomeCompleto: name },
    action: candidates.length || requireExisting ? "PENDENTE" : "CRIAR",
    existing: personExisting,
    issues: personIssues,
  });
  const unit = await unitTarget(tx, units, importId, order, sheet, sheet);
  const admissionDate = iso(admission),
    issues: ImportIssue[] = [];
  const existingLink = personExisting
    ? await tx.vinculo.findFirst({
        where: {
          pessoaId: personExisting.id,
          tipo: kind,
          ...(admissionDate
            ? { dataAdmissao: new Date(admissionDate) }
            : { status: "ATIVO" }),
        },
        orderBy: { dataAdmissao: "desc" },
      })
    : null;
  if (!admissionDate && !existingLink)
    issues.push({
      codigo: "DATA_INVALIDA",
      severidade: "REVISAO",
      mensagem: "Admissão ausente ou inválida.",
    });
  const data: Row = existingLink
    ? { ...existingLink }
    : {
        pessoaId: personTarget,
        unidadeId: unit,
        tipo: kind,
        status: "ATIVO",
        dataAdmissao: admissionDate ?? "",
        ...(scale ? { escala: scale } : {}),
      };
  const linkTarget = await item(tx, {
    importId,
    order: order.value++,
    group: `vinculo_${sheet}_${line}`,
    domain: "vinculos",
    sheet,
    line,
    original: row,
    data,
    refs: { pessoaId: personTarget, unidadeId: unit },
    action:
      issues.length || (personExisting && !existingLink)
        ? "PENDENTE"
        : existingLink
          ? "VINCULAR"
          : "CRIAR",
    existing: existingLink,
    issues,
  });
  return { personTarget, personExisting, linkTarget, existingLink };
}

async function stageLeave(tx: Tx, importId: string, workbook: AuditedWorkbook) {
  const order = { value: 1 },
    units = new Map<string, string>();
  for (const sheet of workbook.raw.filter(
    (s) => !/cesta|planilha1/i.test(s.nome),
  )) {
    for (let i = 1; i < sheet.rows.length; i++) {
      const row = sheet.rows[i]!,
        name = text(row[0]);
      if (!name || /colaborador|arquivadas/i.test(name)) continue;
      const kind: "CLT" | "ESTAGIO" | "APRENDIZ" = /aprendiz/i.test(
        text(row[0]) + text(row[1]),
      )
        ? "APRENDIZ"
        : workbook.profile === "DESCANSO_ESTAGIARIOS"
          ? "ESTAGIO"
          : "CLT";
      const base = await personAndLink(
        tx,
        importId,
        order,
        units,
        sheet.nome,
        i + 1,
        row,
        kind,
        name,
        row[2],
      );
      const values = row.slice(6, 18).filter((v) => text(v));
      for (let p = 0; p < values.length; p += 2) {
        const start = iso(values[p]),
          end = iso(values[p + 1]);
        if (!start && !end) continue;
        const issues: ImportIssue[] = [];
        if (!start || !end)
          issues.push({
            codigo: "DATA_INVALIDA",
            severidade: "REVISAO",
            mensagem: "Período possui data inválida.",
          });
        else if (end < start)
          issues.push({
            codigo: "PERIODO_DATA_INVERTIDA",
            severidade: "REVISAO",
            mensagem: "Fim do período anterior ao início.",
          });
        const days =
          start && end
            ? (Date.parse(end) - Date.parse(start)) / 86400000 + 1
            : 0;
        await item(tx, {
          importId,
          order: order.value++,
          group: `periodo_${sheet.nome}_${i + 1}_${p}`,
          domain: "periodos",
          sheet: sheet.nome,
          line: i + 1,
          original: { inicio: values[p], fim: values[p + 1], linha: row },
          data: {
            vinculoId: base.linkTarget,
            dataInicio: start ?? "",
            dataFim: end ?? "",
            quantidadeDias: days,
            tipo: kind === "CLT" ? "FERIAS" : "DESCANSO_ESTAGIO",
            status: "PROGRAMADO",
            observacoes:
              "Importado como evidência histórica; consumo requer confirmação.",
          },
          refs: { vinculoId: base.linkTarget },
          action: issues.length ? "PENDENTE" : "CRIAR",
          issues,
        });
      }
    }
  }
  for (const sheet of workbook.raw.filter((s) => /cesta/i.test(s.nome))) {
    const headers = sheet.rows[0] ?? [];
    for (let i = 1; i < sheet.rows.length; i++) {
      const row = sheet.rows[i]!,
        name = text(row[0]);
      if (!name) continue;
      const base = await personAndLink(
        tx,
        importId,
        order,
        units,
        sheet.nome,
        i + 1,
        row,
        "CLT",
        name,
        row[1],
      );
      if (!base.existingLink) continue;
      const benefit = await tx.beneficioVinculo.findFirst({
        where: {
          vinculoId: base.existingLink.id,
          tipo: "CESTA_BASICA",
          status: "ATIVO",
        },
      });
      const benefitTarget = await item(tx, {
        importId,
        order: order.value++,
        group: `cesta_${sheet.nome}_${i}`,
        domain: "beneficios-vinculo",
        sheet: sheet.nome,
        line: i + 1,
        original: row,
        data: benefit ?? {
          vinculoId: base.linkTarget,
          tipo: "CESTA_BASICA",
          inicioVigencia: iso(row[1]) ?? "",
          status: "ATIVO",
        },
        refs: { vinculoId: base.linkTarget },
        action: benefit ? "VINCULAR" : iso(row[1]) ? "CRIAR" : "PENDENTE",
        existing: benefit,
        issues: iso(row[1])
          ? []
          : [
              {
                codigo: "DATA_INVALIDA",
                severidade: "REVISAO",
                mensagem: "Admissão inválida para adesão à cesta básica.",
              },
            ],
      });
      for (let j = 2; j < row.length; j++) {
        const original = text(row[j]);
        if (!original) continue;
        const years = text(headers[j]).match(/(20\d{2})\D+(20\d{2})/),
          valueMatch = original.match(/R\$\s*([\d.,]+)/i),
          dateMatch = original.match(/\d{1,2}\/\d{1,2}\/\/?\d{2,4}/),
          eventDate = dateMatch ? iso(dateMatch[0]) : null,
          issues: ImportIssue[] = [];
        if (valueMatch && money(valueMatch[1]) === null)
          issues.push({
            codigo: "AJUSTE_BENEFICIO_PENDENTE",
            severidade: "REVISAO",
            mensagem:
              "Valor monetário inválido ou ambíguo; confira o original.",
          });
        if (dateMatch && !eventDate)
          issues.push({
            codigo: "DATA_AMBIGUA",
            severidade: "REVISAO",
            mensagem: `Data ambígua: ${dateMatch[0]}`,
          });
        const status = /\bpago/i.test(original)
          ? "PAGO"
          : /\bpagar/i.test(original)
            ? "PREVISTO"
            : /atualizado/i.test(original)
              ? "ATUALIZADO"
              : "PENDENTE";
        await item(tx, {
          importId,
          order: order.value++,
          group: `cesta_periodo_${i}_${j}`,
          domain: "beneficios-periodos-historicos",
          sheet: sheet.nome,
          line: i + 1,
          original: { cabecalho: headers[j], valor: row[j] },
          data: {
            beneficioVinculoId: benefitTarget,
            anoInicio: years ? Number(years[1]) : null,
            anoFim: years ? Number(years[2]) : null,
            referenciaOriginal: text(headers[j]),
            valor: valueMatch ? money(valueMatch[1]) : null,
            status,
            dataEvento: eventDate,
            textoOriginal: original,
          },
          refs: { beneficioVinculoId: benefitTarget },
          action: issues.length ? "PENDENTE" : "CRIAR",
          issues,
        });
      }
    }
  }
  return order.value - 1;
}

async function stageBenefits(
  tx: Tx,
  importId: string,
  workbook: AuditedWorkbook,
) {
  const order = { value: 1 },
    units = new Map<string, string>(),
    suppliers = new Map<string, { target: string; existing: Row | null }>(),
    configs = new Map<string, string>(),
    benefits = new Map<string, string>(),
    people = new Map<string, Awaited<ReturnType<typeof personAndLink>>>();
  for (const sheet of workbook.raw) {
    let month = 1;
    for (let i = 0; i < sheet.rows.length; i++) {
      const row = sheet.rows[i]!;
      for (const value of row) {
        const found = monthNumber[norm(value)];
        if (found) month = found;
      }
      const role = norm(row[0]),
        name = text(row[1]);
      if (!name || !/(clt|estagi|aprendiz)/.test(role)) continue;
      const kind = role.includes("aprendiz")
        ? "APRENDIZ"
        : role.includes("estagi")
          ? "ESTAGIO"
          : "CLT";
      const personKey = `${kind}:${norm(name)}`;
      let base = people.get(personKey);
      if (!base) {
        base = await personAndLink(
          tx,
          importId,
          order,
          units,
          sheet.nome,
          i + 1,
          row,
          kind,
          name,
          "",
          text(row[3]),
          true,
        );
        people.set(personKey, base);
      }
      if (!base.existingLink) continue;
      for (let j = 1; j < row.length; j++) {
        if (!/\/dia/i.test(text(row[j]))) continue;
        const provider = text(row[j]).split("/")[0]!.trim().toUpperCase(),
          tipo = j < 12 ? "TRANSPORTE" : "ALIMENTACAO",
          days = money(row[j - 1]),
          unitValue = money(row[j + 1]);
        if (!provider) continue;
        const issues: ImportIssue[] = [];
        for (const [field, label, value] of [
          ["quantidadeDias", "Quantidade de dias", days],
          ["valorUnitario", "Valor unitário", unitValue],
        ] as const) {
          const validation = competenciaSchema
            .innerType()
            .shape[field].safeParse(value);
          if (value === null || !validation.success)
            issues.push({
              codigo: "AJUSTE_BENEFICIO_PENDENTE",
              severidade: "REVISAO",
              mensagem: `${label} ausente, inválido ou ambíguo; confira o original.`,
            });
        }
        let supplierEntry = suppliers.get(provider);
        if (!supplierEntry) {
          const existing = await tx.fornecedor.findFirst({
            where: { nome: { equals: provider, mode: "insensitive" } },
          });
          const target = await item(tx, {
            importId,
            order: order.value++,
            group: `fornecedor_${provider}`,
            domain: "fornecedores",
            sheet: sheet.nome,
            line: i + 1,
            original: { valor: row[j] },
            data: existing ?? { nome: provider, ativo: true },
            action: existing ? "VINCULAR" : "CRIAR",
            existing,
          });
          supplierEntry = { target, existing };
          suppliers.set(provider, supplierEntry);
        }
        const unit = base.existingLink.unidadeId,
          configKey = `${unit}:${tipo}:${provider}`;
        let configTarget = configs.get(configKey);
        if (!configTarget) {
          const config = supplierEntry.existing
            ? await tx.configuracaoBeneficio.findFirst({
                where: {
                  unidadeId: base.existingLink.unidadeId,
                  fornecedorId: String(supplierEntry.existing.id),
                  tipo,
                },
              })
            : null;
          configTarget = await item(tx, {
            importId,
            order: order.value++,
            group: `config_${configKey}`,
            domain: "configuracoes-beneficios",
            sheet: sheet.nome,
            line: i + 1,
            original: { fornecedor: provider },
            data: config ?? {
              unidadeId: unit,
              tipo,
              fornecedorId: supplierEntry.target,
              ativa: true,
            },
            refs: { fornecedorId: supplierEntry.target },
            action: config ? "VINCULAR" : "CRIAR",
            existing: config,
          });
          configs.set(configKey, configTarget);
        }
        const benefitKey = `${base.existingLink.id}:${tipo}`;
        let benefitTarget = benefits.get(benefitKey);
        if (!benefitTarget) {
          const benefit = await tx.beneficioVinculo.findFirst({
            where: { vinculoId: base.existingLink.id, tipo, status: "ATIVO" },
          });
          benefitTarget = await item(tx, {
            importId,
            order: order.value++,
            group: `beneficio_${benefitKey}`,
            domain: "beneficios-vinculo",
            sheet: sheet.nome,
            line: i + 1,
            original: row,
            data: benefit ?? {
              vinculoId: base.linkTarget,
              tipo,
              inicioVigencia: `2026-${String(month).padStart(2, "0")}-01`,
              status: "ATIVO",
            },
            refs: { vinculoId: base.linkTarget },
            action: benefit ? "VINCULAR" : "CRIAR",
            existing: benefit,
          });
          benefits.set(benefitKey, benefitTarget);
        }
        await item(tx, {
          importId,
          order: order.value++,
          group: `competencia_${sheet.nome}_${i}_${j}`,
          domain: "competencias",
          sheet: sheet.nome,
          line: i + 1,
          original: row,
          data: {
            beneficioVinculoId: benefitTarget,
            configuracaoId: configTarget,
            componente: provider,
            competencia: `2026-${String(month).padStart(2, "0")}-01`,
            quantidadeDias: days,
            valorUnitario: unitValue,
            status: "PENDENTE",
            observacoes: text(row.at(-1)) || null,
          },
          refs: {
            beneficioVinculoId: benefitTarget,
            configuracaoId: configTarget,
          },
          action: issues.length ? "PENDENTE" : "CRIAR",
          issues,
        });
      }
    }
  }
  return order.value - 1;
}

export async function stageAuditedWorkbook(
  tx: Tx,
  importId: string,
  userId: string,
  workbook: AuditedWorkbook,
) {
  const count =
    workbook.profile === "BENEFICIOS_2026"
      ? await stageBenefits(tx, importId, workbook)
      : await stageLeave(tx, importId, workbook);
  const pending = await tx.importacaoItem.count({
    where: { importacaoId: importId, acao: "PENDENTE" },
  });
  await tx.importacao.update({
    where: { id: importId },
    data: { status: "REVISAO", mapeamento: json({ perfil: workbook.profile }) },
  });
  await audit(
    tx,
    userId,
    "ANALISAR_IMPORTACAO_ESPECIALIZADA",
    "importacao",
    importId,
    undefined,
    { perfil: workbook.profile, registros: count, pendencias: pending },
  );
  return { perfil: workbook.profile, registros: count, pendencias: pending };
}
