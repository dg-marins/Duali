import { acquire } from "./leave-domain.js";
import { isDeepStrictEqual } from "node:util";
import type { FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { randomUUID } from "node:crypto";
import { Prisma, type PrismaClient } from "@duali/database";
import { z, listSchema } from "@duali/shared";
import {
  audit,
  DomainError,
  json,
  model,
  paramsId,
  transaction,
  type Tx,
  type Row,
} from "../core.js";
import { resources, saveResource, type Resource } from "./resources.js";
import { internshipResources } from "./internship.js";
import { leaveResources } from "./leave.js";
import { benefitResources } from "./benefits.js";
import { readSpreadsheet, type Sheet } from "./import-files.js";
import {
  isGeneralInternList,
  readGeneralInternList,
  stageGeneralInternList,
} from "./intern-import-profile.js";
export const importResources = [
  ...resources.filter((r) => r.path !== "usuarios"),
  ...internshipResources,
  ...leaveResources,
  ...benefitResources,
];
export function importResource(path: string): Resource {
  const resource = importResources.find((r) => r.path === path);
  if (!resource) throw new DomainError(422, "Domínio de importação inválido.");
  return resource;
}
const fieldMapping = z
  .object({
    coluna: z.string().optional(),
    valor: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional(),
    grupo: z.string().optional(),
  })
  .strict()
  .refine(
    (v) =>
      [
        v.coluna !== undefined,
        v.valor !== undefined,
        v.grupo !== undefined,
      ].filter(Boolean).length === 1,
    "Selecione coluna, valor fixo ou grupo anterior.",
  );
export const mappingSchema = z
  .object({
    aba: z.string(),
    grupos: z
      .array(
        z
          .object({
            nome: z.string().min(1).max(50),
            dominio: z.string(),
            campos: z.record(fieldMapping),
          })
          .strict(),
      )
      .min(1)
      .max(30),
  })
  .strict();
const normalizeName = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
export function similarName(a: string, b: string) {
  a = normalizeName(a);
  b = normalizeName(b);
  if (a === b) return true;
  const grams = (s: string) =>
    new Set(
      Array.from({ length: Math.max(0, s.length - 1) }, (_, i) =>
        s.slice(i, i + 2),
      ),
    );
  const aa = grams(a),
    bb = grams(b);
  return (
    aa.size + bb.size > 0 &&
    (2 * [...aa].filter((v) => bb.has(v)).length) / (aa.size + bb.size) >= 0.82
  );
}
export function normalizeInput(data: Row) {
  const normalized: Row = {},
    messages: string[] = [];
  for (const [key, value] of Object.entries(data)) {
    if (typeof value !== "string") {
      normalized[key] = value;
      continue;
    }
    let result: unknown = value.trim();
    if (/^=/.test(value))
      messages.push(key + ": fórmula não executada; informe valor explícito.");
    if (key === "cpf") result = value.replace(/\D/g, "");
    if (key === "email") result = value.trim().toLowerCase();
    if (
      /^(data|inicio|fim|prazo|competencia)/i.test(key) &&
      /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(value)
    ) {
      const [day, month, year] = value.split("/");
      if (Number(day) > 12)
        result =
          year + "-" + month!.padStart(2, "0") + "-" + day!.padStart(2, "0");
      else messages.push(key + ": data ambígua; informe AAAA-MM-DD.");
    }
    if (
      /^(valor|quantidade)/.test(key) &&
      /^-?(?:\d{1,3}(?:\.\d{3})+|\d+),\d{1,2}$/.test(value)
    )
      result = Number(value.replace(/\./g, "").replace(",", "."));
    normalized[key] = result;
  }
  return {
    normalized,
    messages,
    changed: JSON.stringify(data) !== JSON.stringify(normalized),
  };
}
export async function duplicates(tx: Tx, resource: Resource, data: Row) {
  if (resource.path !== "pessoas") return [];
  const names = String(data.nomeCompleto ?? "")
    .trim()
    .split(/\s+/);
  const candidates = await tx.pessoa.findMany({
    where: {
      OR: [
        ...(data.cpf ? [{ cpf: String(data.cpf) }] : []),
        {
          nomeCompleto: {
            contains: names[0] ?? "",
            mode: "insensitive" as const,
          },
        },
        ...(data.email ? [{ email: String(data.email) }] : []),
        ...(data.telefone ? [{ telefone: String(data.telefone) }] : []),
      ],
    },
    take: 100,
  });
  return candidates
    .filter(
      (p) =>
        (data.cpf && p.cpf === data.cpf) ||
        similarName(p.nomeCompleto, String(data.nomeCompleto ?? "")) ||
        (data.email && p.email === data.email) ||
        (data.telefone && p.telefone === data.telefone),
    )
    .map((p) => ({
      id: p.id,
      nome: p.nomeCompleto,
      evidencia:
        data.cpf && p.cpf === data.cpf
          ? "CPF igual"
          : p.dataNascimento?.toISOString().slice(0, 10) ===
                data.dataNascimento &&
              normalizeName(p.nomeCompleto) ===
                normalizeName(String(data.nomeCompleto))
            ? "Nome e nascimento"
            : "Nome semelhante ou contato auxiliar",
    }));
}
function plainData(resource: Resource, row: Row): Row {
  const parsed = resource.schema.safeParse(
    Object.fromEntries(
      Object.entries(row)
        .filter(([key]) => !["id", "criadoEm", "atualizadoEm"].includes(key))
        .map(([k, v]) => [
          k,
          v instanceof Date
            ? v.toISOString().slice(0, 10)
            : v instanceof Prisma.Decimal
              ? v.toString()
              : v,
        ]),
    ),
  );
  return parsed.success ? (parsed.data as Row) : row;
}
export async function analyze(
  tx: Tx,
  importId: string,
  input: unknown,
  userId: string,
) {
  const mapping = mappingSchema.parse(input);
  const batch = await tx.importacao.findUniqueOrThrow({
    where: { id: importId },
  });
  if (batch.status !== "UPLOAD")
    throw new DomainError(
      409,
      "Arquivo já analisado. Crie outra importação para mudar o mapeamento.",
    );
  const sheet = (batch.planilhas as unknown as Sheet[]).find(
    (s) => s.nome === mapping.aba,
  );
  if (!sheet) throw new DomainError(422, "Aba inexistente.");
  const names = new Set<string>();
  for (const group of mapping.grupos) {
    importResource(group.dominio);
    if (names.has(group.nome))
      throw new DomainError(422, "Nomes de grupos devem ser únicos.");
    for (const rule of Object.values(group.campos)) {
      if (rule.coluna && !sheet.colunas.includes(rule.coluna))
        throw new DomainError(422, "Coluna inexistente.");
      if (rule.grupo && !names.has(rule.grupo))
        throw new DomainError(422, "Referencie somente grupos anteriores.");
    }
    names.add(group.nome);
  }
  if (sheet.linhas.length * mapping.grupos.length > 10000)
    throw new DomainError(422, "Limite de 10.000 registros por importação.");
  const stagedPeople: { id: string; data: Row }[] = [];
  let count = 0;
  for (const line of sheet.linhas) {
    const targets: Record<string, string> = {};
    for (const group of mapping.grupos) {
      const columns = Object.values(group.campos).filter((rule) => rule.coluna);
      if (
        columns.length &&
        columns.every(
          (rule) =>
            line.dados[rule.coluna!] === "" || line.dados[rule.coluna!] == null,
        )
      )
        continue;
      const targetId = randomUUID(),
        raw: Row = {},
        refs: Row = {};
      targets[group.nome] = targetId;
      for (const [key, rule] of Object.entries(group.campos)) {
        if (rule.grupo) {
          raw[key] = targets[rule.grupo] ?? null;
          refs[key] = targets[rule.grupo] ?? null;
        } else if (rule.coluna) {
          const value = line.dados[rule.coluna];
          if (value !== "" && value != null) raw[key] = value;
        } else raw[key] = rule.valor;
      }
      const resource = importResource(group.dominio),
        normalized = normalizeInput(raw),
        parsed = resource.schema.safeParse(normalized.normalized);
      const data = parsed.success
        ? (parsed.data as Row)
        : normalized.normalized;
      const candidates = await duplicates(tx, resource, data);
      const internal =
        resource.path === "pessoas"
          ? stagedPeople.filter(
              (p) =>
                (data.cpf && data.cpf === p.data.cpf) ||
                similarName(
                  String(data.nomeCompleto ?? ""),
                  String(p.data.nomeCompleto ?? ""),
                ),
            )
          : [];
      const messages = [
        ...normalized.messages,
        ...(!parsed.success
          ? parsed.error.issues.map((e) => e.path.join(".") + ": " + e.message)
          : []),
        ...candidates.map((c) => c.evidencia + ": " + c.nome),
        ...internal.map(
          (c) =>
            "Duplicidade dentro do arquivo: " + String(c.data.nomeCompleto),
        ),
      ];
      const status = !parsed.success
        ? "REJEITADO"
        : candidates.length || internal.length
          ? "DUPLICIDADE"
          : normalized.messages.length
            ? "REVISAO"
            : normalized.changed
              ? "NORMALIZAVEL"
              : "VALIDO";
      if (resource.path === "pessoas")
        stagedPeople.push({ id: targetId, data });
      await tx.importacaoItem.create({
        data: {
          importacaoId: importId,
          ordem: count++,
          grupo: group.nome,
          dominio: group.dominio,
          aba: sheet.nome,
          numeroLinha: line.numero,
          dadosOriginais: json(line.dados),
          dadosNormalizados: json(data),
          referencias: json(refs),
          status,
          mensagens: json(messages),
          candidatos: json([
            ...candidates,
            ...internal.map((c) => ({
              id: c.id,
              nome: String(c.data.nomeCompleto),
              evidencia: "Duplicidade dentro do arquivo",
            })),
          ]),
          destinoId: targetId,
          acao: ["VALIDO", "NORMALIZAVEL"].includes(status)
            ? "CRIAR"
            : "PENDENTE",
        },
      });
    }
  }
  await tx.importacao.update({
    where: { id: importId },
    data: { status: "REVISAO", mapeamento: json(mapping) },
  });
  await audit(
    tx,
    userId,
    "ANALISAR_IMPORTACAO",
    "importacao",
    importId,
    undefined,
    { registros: count },
  );
  return { registros: count };
}
const reviewSchema = z
  .object({
    dados: z.record(z.unknown()),
    acao: z.enum(["CRIAR", "ATUALIZAR", "VINCULAR", "REJEITAR"]),
    destinoId: z.string().uuid().optional(),
    motivo: z.string().trim().min(1).max(1000),
  })
  .strict();
export async function review(
  tx: Tx,
  itemId: string,
  input: unknown,
  userId: string,
) {
  const body = reviewSchema.parse(input),
    item = await tx.importacaoItem.findUniqueOrThrow({
      where: { id: itemId },
      include: { importacao: true },
    });
  if (item.importacao.status !== "REVISAO")
    throw new DomainError(409, "Importação não está em revisão.");
  const resource = importResource(item.dominio);
  let data = body.dados,
    before: Row | null = null;
  if (body.acao === "ATUALIZAR" || body.acao === "VINCULAR") {
    if (!body.destinoId)
      throw new DomainError(422, "Selecione o registro de destino.");
    before = await model(tx, resource.model).findUnique({
      where: { id: body.destinoId },
    });
    if (!before) {
      const staged = await tx.importacaoItem.findFirst({
        where: {
          importacaoId: item.importacaoId,
          destinoId: body.destinoId,
          ordem: { lt: item.ordem },
        },
      });
      if (!staged || body.acao !== "VINCULAR")
        throw new DomainError(
          422,
          "Destino inexistente. Para destino do pr?prio arquivo use Vincular.",
        );
      before = { staged: true, id: staged.destinoId };
    }
    if (body.acao === "ATUALIZAR")
      data = resource.schema.parse({
        ...plainData(resource, before),
        ...data,
      }) as Row;
  } else if (body.acao === "CRIAR") data = resource.schema.parse(data) as Row;
  const candidates = await duplicates(tx, resource, data);
  if (before?.staged)
    candidates.push({
      id: String(before.id),
      nome: "Registro anterior do arquivo",
      evidencia: "Duplicidade dentro do arquivo",
    });
  await tx.importacaoItem.update({
    where: { id: itemId },
    data: {
      dadosNormalizados: json(data),
      acao: body.acao,
      status: body.acao === "REJEITAR" ? "REJEITADO" : "VALIDO",
      revisado: true,
      motivo: body.motivo,
      alvoId: body.destinoId ?? null,
      dadosAnteriores: before ? json(before) : Prisma.DbNull,
      candidatos: json(candidates),
    },
  });
  await audit(
    tx,
    userId,
    "REVISAR_IMPORTACAO_ITEM",
    "importacaoItem",
    itemId,
    undefined,
    { acao: body.acao, motivo: body.motivo },
  );
  return { ok: true };
}
export async function confirm(tx: Tx, importId: string, userId: string) {
  const batch = await tx.importacao.findUniqueOrThrow({
    where: { id: importId },
    include: { itens: { orderBy: { ordem: "asc" } } },
  });
  if (batch.status !== "REVISAO")
    throw new DomainError(409, "Importação já confirmada ou indisponível.");
  if (
    batch.itens.some(
      (i) =>
        i.acao === "PENDENTE" ||
        (!["VALIDO", "NORMALIZAVEL"].includes(i.status) &&
          i.acao !== "REJEITAR"),
    )
  )
    throw new DomainError(
      422,
      "Revise todos os itens pendentes ou rejeite-os explicitamente.",
    );
  const valid = batch.itens.filter((i) => i.acao !== "REJEITAR");
  if (!valid.length) throw new DomainError(422, "Nenhum registro selecionado.");
  await tx.importacao.update({
    where: { id: importId },
    data: { status: "CONFIRMANDO" },
  });
  const resolved = new Map<string, string>();
  let persisted = 0;
  for (const item of valid) {
    const resource = importResource(item.dominio),
      data = { ...(item.dadosNormalizados as Row) };
    for (const [key, target] of Object.entries(item.referencias as Row)) {
      if (data[key] !== target) continue;
      const actual = resolved.get(String(target));
      if (!actual)
        throw new DomainError(
          422,
          "Grupo relacionado foi rejeitado ou não resolvido.",
        );
      data[key] = actual;
    }
    const candidates = await duplicates(tx, resource, data),
      known = (item.candidatos as unknown as { id: string }[]).map(
        (c) => resolved.get(c.id) ?? c.id,
      );
    if (
      candidates.some((c) => !known.includes(c.id)) &&
      !resolved.has(item.destinoId)
    )
      throw new DomainError(
        409,
        "Novas duplicidades encontradas. Revise a linha " +
          item.numeroLinha +
          ".",
      );
    if (item.acao === "ATUALIZAR" || item.acao === "VINCULAR") {
      const current = await model(tx, resource.model).findUnique({
        where: { id: resolved.get(item.alvoId!) ?? item.alvoId! },
      });
      if (
        !(item.dadosAnteriores as Row)?.staged &&
        !isDeepStrictEqual(json(current), item.dadosAnteriores)
      )
        throw new DomainError(
          409,
          "Destino alterado desde a revisão. Revise novamente.",
        );
    }
    let record: Row;
    if (item.acao === "VINCULAR")
      record = { id: resolved.get(item.alvoId!) ?? item.alvoId! };
    else
      record = await saveResource(
        tx,
        resource,
        data,
        userId,
        item.acao === "ATUALIZAR" ? item.alvoId! : undefined,
        false,
      );
    resolved.set(item.destinoId, String(record.id));
    persisted++;
    await tx.importacaoItem.update({
      where: { id: item.id },
      data: { persistidoId: String(record.id) },
    });
  }
  for (const item of valid.filter((i) => i.dominio === "vinculos")) {
    const link = resolved.get(item.destinoId);
    if (link) await acquire(tx, link, userId);
  }
  await tx.importacao.update({
    where: { id: importId },
    data: { status: "CONFIRMADA", confirmadaEm: new Date() },
  });
  await audit(
    tx,
    userId,
    "CONFIRMAR_IMPORTACAO",
    "importacao",
    importId,
    undefined,
    { registros: persisted },
  );
  return { registros: persisted };
}
export async function registerImports(app: FastifyInstance, db: PrismaClient) {
  await app.register(multipart, {
    limits: { files: 1, fileSize: 10 * 1024 * 1024, fields: 0, parts: 1 },
  });
  app.post(
    "/api/importacoes",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
      const file = await req.file();
      if (!file) throw new DomainError(422, "Selecione um arquivo.");
      const buffer = await file.toBuffer(),
        profile = isGeneralInternList(file.filename)
          ? await readGeneralInternList(buffer)
          : null,
        sheets = profile?.sheets ?? (await readSpreadsheet(file.filename, buffer));
      const batch = await transaction(db, async (tx) => {
        const result = await tx.importacao.create({
          data: {
            usuarioId: req.userId!,
            nomeArquivo: file.filename.slice(0, 200),
            arquivo: new Uint8Array(buffer),
            planilhas: json(sheets),
          },
        });
        await audit(
          tx,
          req.userId,
          "UPLOAD_IMPORTACAO",
          "importacao",
          result.id,
        );
        const analysis = profile
          ? await stageGeneralInternList(tx, result.id, req.userId!, profile)
          : null;
        return { ...result, analysis };
      }, 120000);
      reply.code(201);
      return {
        id: batch.id,
        nomeArquivo: batch.nomeArquivo,
        status: batch.analysis ? "REVISAO" : "UPLOAD",
        ...(batch.analysis ?? {}),
        abas: sheets.map((s) => ({
          nome: s.nome,
          colunas: s.colunas,
          linhas: s.linhas.length,
          previa: s.linhas.slice(0, 5),
        })),
      };
    },
  );
  app.get("/api/importacoes", async (req) => {
    const q = listSchema.parse(req.query);
    return {
      items: await db.importacao.findMany({
        select: {
          id: true,
          nomeArquivo: true,
          status: true,
          criadoEm: true,
          confirmadaEm: true,
        },
        orderBy: { criadoEm: "desc" },
        take: q.pageSize,
        skip: (q.page - 1) * q.pageSize,
      }),
      total: await db.importacao.count(),
    };
  });
  app.get("/api/importacoes/:id", async (req) => {
    const { id } = paramsId.parse(req.params);
    const batch = await db.importacao.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        nomeArquivo: true,
        status: true,
        planilhas: true,
        mapeamento: true,
      },
    });
    const q = listSchema.parse(req.query);
    const specialized =
      (batch.mapeamento as Row | null)?.perfil ===
      "LISTAGEM_ESTAGIARIOS_GERAL";
    const itemWhere = specialized
      ? { importacaoId: id, acao: "PENDENTE" }
      : { importacaoId: id };
    const [items, total, totalRegistros, summary] = await Promise.all([
      db.importacaoItem.findMany({
        where: itemWhere,
        orderBy: { ordem: "asc" },
        take: q.pageSize,
        skip: (q.page - 1) * q.pageSize,
      }),
      db.importacaoItem.count({ where: itemWhere }),
      db.importacaoItem.count({ where: { importacaoId: id } }),
      db.importacaoItem.groupBy({
        by: ["status", "acao"],
        where: { importacaoId: id },
        _count: true,
      }),
    ]);
    return {
      id: batch.id,
      nomeArquivo: batch.nomeArquivo,
      status: batch.status,
      abas: (batch.planilhas as unknown as Sheet[]).map((s) => ({
        nome: s.nome,
        colunas: s.colunas,
        linhas: s.linhas.length,
        previa: s.linhas.slice(0, 5),
      })),
      items,
      total,
      totalRegistros,
      summary,
    };
  });
  app.post("/api/importacoes/:id/analisar", async (req) => {
    const { id } = paramsId.parse(req.params);
    return transaction(
      db,
      (tx) => analyze(tx, id, req.body, req.userId!),
      120000,
    );
  });
  app.put("/api/importacao-itens/:id", async (req) => {
    const { id } = paramsId.parse(req.params);
    return transaction(db, (tx) => review(tx, id, req.body, req.userId!));
  });
  app.post("/api/importacoes/:id/confirmar", async (req) => {
    const { id } = paramsId.parse(req.params);
    z.object({}).strict().parse(req.body);
    return transaction(db, (tx) => confirm(tx, id, req.userId!), 120000);
  });
  app.get("/api/importacoes/:id/arquivo", async (req, reply) => {
    const { id } = paramsId.parse(req.params);
    const batch = await db.importacao.findUniqueOrThrow({
      where: { id },
      select: { arquivo: true },
    });
    await audit(db, req.userId, "BAIXAR_ORIGEM", "importacao", id);
    reply
      .type("application/octet-stream")
      .header(
        "Content-Disposition",
        'attachment; filename="origem-' + id + '"',
      );
    return Buffer.from(batch.arquivo);
  });
}
