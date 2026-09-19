import { assertCurrentEmployment } from "./current-employment.js";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "@duali/database";
import {
  estagioCadastroSchema,
  pessoaCadastroSchema,
  vinculoCadastroSchema,
  vinculoSchema,
  z,
} from "@duali/shared";
import { acquire } from "./leave-domain.js";
import { audit, dateData, DomainError, transaction, type Tx } from "../core.js";

const tceStatusSchema = z.enum(["ASSINADO", "AGUARDANDO_ASSINATURA"]);
const stagePayloadSchema = estagioCadastroSchema.extend({
  tceStatus: tceStatusSchema.default("AGUARDANDO_ASSINATURA"),
  periodicidadeDocumentoMeses: z.coerce
    .number()
    .int()
    .positive()
    .max(120)
    .optional(),
});

const createSchema = z
  .object({
    pessoa: pessoaCadastroSchema,
    vinculo: vinculoCadastroSchema,
    estagio: stagePayloadSchema.optional(),
  })
  .strict();
const editSchema = z
  .object({ vinculo: vinculoSchema, estagio: stagePayloadSchema.optional() })
  .strict();

function persistScale(data: Record<string, unknown>) {
  const { escalaEstruturada, ...link } = data;
  if (!escalaEstruturada)
    return {
      ...link,
      tipoEscala: null,
      diasSemana: [],
      quantidadeDiasSemana: null,
    };
  const scale = escalaEstruturada as Record<string, unknown>;
  return {
    ...link,
    tipoEscala: scale.tipo,
    diasSemana: scale.tipo === "DIAS_SEMANA" ? scale.diasSemana : [],
    quantidadeDiasSemana:
      scale.tipo === "QUANTIDADE_SEMANAL" ? scale.quantidadeDiasSemana : null,
  };
}

async function validateLink(tx: Tx, data: Record<string, unknown>) {
  const unit = await tx.unidade.findUnique({
    where: { id: String(data.unidadeId) },
  });
  if (!unit || !unit.ativa)
    throw new DomainError(422, "Selecione uma unidade ativa.");
  if (data.equipeId) {
    const team = await tx.equipe.findUnique({
      where: { id: String(data.equipeId) },
    });
    if (!team || !team.ativa)
      throw new DomainError(422, "Selecione uma equipe ativa.");
  }
}

function validateInternshipEnd(admission: Date, end: Date | null | undefined) {
  if (end && end < admission)
    throw new DomainError(
      422,
      "O fim previsto do estágio não pode ser anterior à admissão.",
    );
  if (end && end > addMonths(admission, 24))
    throw new DomainError(
      422,
      "O término do contrato/TCE não pode exceder 24 meses da admissão.",
    );
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

async function createDefaultRenewals(
  tx: Tx,
  vinculoId: string,
  admission: Date,
  contractEnd: Date,
  periodicityMonths: number,
) {
  for (
    let start = addMonths(admission, periodicityMonths);
    start < contractEnd;
    start = addMonths(start, periodicityMonths)
  ) {
    await tx.documentoVinculo.create({
      data: {
        vinculoId,
        tipo: "ADITIVO",
        status: "PENDENTE",
        dataReferencia: start,
        inicioVigencia: start,
        fimVigencia:
          addMonths(start, periodicityMonths) > contractEnd
            ? contractEnd
            : addMonths(start, periodicityMonths),
      },
    });
  }
}

async function ensureTce(
  tx: Tx,
  vinculoId: string,
  status: "ASSINADO" | "AGUARDANDO_ASSINATURA",
  userId: string | null,
  inicioVigencia?: Date,
  periodicityMonths = 6,
) {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  if (status === "ASSINADO" && inicioVigencia && inicioVigencia > today)
    throw new DomainError(
      422,
      "Um TCE planejado só pode ser marcado como assinado quando sua vigência começar.",
    );
  const persistedStatus = status === "ASSINADO" ? "VIGENTE" : "PENDENTE";
  const existing = await tx.documentoVinculo.findFirst({
    where: { vinculoId, tipo: "TCE" },
  });
  if (existing) {
    const updated = await tx.documentoVinculo.update({
      where: { id: existing.id },
      data: { status: persistedStatus },
    });
    if (updated.status !== existing.status)
      await audit(
        tx,
        userId,
        "ALTERAR",
        "documentoVinculo",
        updated.id,
        existing,
        updated,
      );
    return updated;
  }
  const created = await tx.documentoVinculo.create({
    data: {
      vinculoId,
      tipo: "TCE",
      status: persistedStatus,
      ...(inicioVigencia
        ? {
            inicioVigencia,
            fimVigencia: addMonths(inicioVigencia, periodicityMonths),
          }
        : {}),
    },
  });
  await audit(
    tx,
    userId,
    "CRIAR",
    "documentoVinculo",
    created.id,
    undefined,
    created,
  );
  return created;
}

export function registerPeopleComposite(
  app: FastifyInstance,
  db: PrismaClient,
) {
  app.post("/api/pessoas-com-vinculo", async (req, reply) => {
    const body = createSchema.parse(req.body);
    if (body.vinculo.tipo === "ESTAGIO" && !body.estagio)
      throw new DomainError(422, "Informe os dados do estágio.");
    if (body.vinculo.tipo !== "ESTAGIO" && body.estagio)
      throw new DomainError(
        422,
        "Dados de estágio só são permitidos para vínculo ESTAGIO.",
      );
    if (body.vinculo.tipo === "ESTAGIO" && body.vinculo.dataDesligamento)
      throw new DomainError(
        422,
        "O desligamento de estágio deve ser registrado pelo distrato.",
      );
    const result = await transaction(db, async (tx) => {
      const pessoaData = dateData(pessoaCadastroSchema.parse(body.pessoa), [
        "dataNascimento",
      ]);
      const pessoa = await tx.pessoa.create({ data: pessoaData as never });
      const linkData = dateData(
        persistScale({
          ...vinculoCadastroSchema.parse(body.vinculo),
          pessoaId: pessoa.id,
          status: "ATIVO",
        }),
        ["dataAdmissao", "dataDesligamento"],
      );
      await validateLink(tx, linkData);
      await assertCurrentEmployment(tx, pessoa.id, "ATIVO");
      const vinculo = await tx.vinculo.create({
        data: linkData as never,
        include: { pessoa: true, unidade: true, equipe: true },
      });
      if (vinculo.equipeId)
        await tx.vinculoEquipeHistorico.create({
          data: {
            vinculoId: vinculo.id,
            equipeId: vinculo.equipeId,
            inicioEm: new Date(),
          },
        });
      await acquire(tx, vinculo.id, req.userId!);
      await audit(
        tx,
        req.userId,
        "CRIAR",
        "pessoa",
        pessoa.id,
        undefined,
        pessoa,
      );
      await audit(
        tx,
        req.userId,
        "CRIAR",
        "vinculo",
        vinculo.id,
        undefined,
        vinculo,
      );
      let estagio;
      if (body.estagio) {
        const { tceStatus, periodicidadeDocumentoMeses, ...stagePayload } =
          body.estagio;
        const data = dateData(
          {
            ...estagioCadastroSchema.parse({
              ...stagePayload,
              dataTerminoPrevista:
                stagePayload.dataTerminoPrevista ??
                addMonths(linkData.dataAdmissao as Date, 24)
                  .toISOString()
                  .slice(0, 10),
            }),
            vinculoId: vinculo.id,
          },
          ["dataTerminoPrevista"],
        );
        validateInternshipEnd(
          linkData.dataAdmissao as Date,
          data.dataTerminoPrevista as Date | null | undefined,
        );
        if (data.instituicaoEnsinoId) {
          const institution = await tx.instituicaoEnsino.findUnique({
            where: { id: String(data.instituicaoEnsinoId) },
          });
          if (!institution || !institution.ativa)
            throw new DomainError(422, "Selecione uma instituição ativa.");
        }
        let periodicity = periodicidadeDocumentoMeses ?? 6;
        if (data.instituicaoEnsinoId && periodicidadeDocumentoMeses == null) {
          const unitRule = await tx.instituicaoRegraEstagio.findFirst({
            where: {
              instituicaoId: String(data.instituicaoEnsinoId),
              unidadeId: vinculo.unidadeId,
              ativa: true,
              periodicidadeMeses: { not: null },
            },
          });
          const genericRule = unitRule
            ? null
            : await tx.instituicaoRegraEstagio.findFirst({
                where: {
                  instituicaoId: String(data.instituicaoEnsinoId),
                  unidadeId: null,
                  ativa: true,
                  periodicidadeMeses: { not: null },
                },
              });
          if (unitRule?.periodicidadeMeses ?? genericRule?.periodicidadeMeses)
            periodicity =
              unitRule?.periodicidadeMeses ?? genericRule!.periodicidadeMeses!;
        }
        estagio = await tx.estagio.create({ data: data as never });
        await audit(
          tx,
          req.userId,
          "CRIAR",
          "estagio",
          estagio.id,
          undefined,
          estagio,
        );
        await ensureTce(
          tx,
          vinculo.id,
          tceStatus,
          req.userId,
          linkData.dataAdmissao as Date,
          periodicity,
        );
        await createDefaultRenewals(
          tx,
          vinculo.id,
          linkData.dataAdmissao as Date,
          data.dataTerminoPrevista as Date,
          periodicity,
        );
      }
      return { pessoa, vinculo, estagio };
    });
    reply.code(201);
    return result;
  });
  app.put("/api/vinculos/:id/detalhes", async (req) => {
    const id = z
      .string()
      .uuid()
      .parse((req.params as { id: string }).id);
    const body = editSchema.parse(req.body);
    const result = await transaction(db, async (tx) => {
      const previous = await tx.vinculo.findUnique({
        where: { id },
        include: { estagio: true },
      });
      if (!previous) throw new DomainError(404, "Vínculo não encontrado.");
      if (
        body.vinculo.pessoaId !== previous.pessoaId ||
        body.vinculo.tipo !== previous.tipo ||
        body.vinculo.dataAdmissao !==
          previous.dataAdmissao.toISOString().slice(0, 10)
      )
        throw new DomainError(
          409,
          "Pessoa, tipo e admissão são imutáveis; encerre e crie outro vínculo.",
        );
      if (
        previous.tipo === "ESTAGIO" &&
        (body.vinculo.status === "DESLIGADO" ||
          body.vinculo.dataDesligamento) &&
        (body.vinculo.status !== previous.status ||
          body.vinculo.dataDesligamento !==
            previous.dataDesligamento?.toISOString().slice(0, 10))
      )
        throw new DomainError(
          409,
          "O desligamento de estágio deve ser registrado pelo distrato.",
        );
      if (previous.tipo === "ESTAGIO" && body.estagio) {
        const { tceStatus, ...stagePayload } = body.estagio;
        delete stagePayload.periodicidadeDocumentoMeses;
        const stageData = dateData(
          { ...estagioCadastroSchema.parse(stagePayload), vinculoId: id },
          ["dataTerminoPrevista"],
        );
        const proposedEnd = stageData.dataTerminoPrevista as
          | Date
          | null
          | undefined;
        if (
          proposedEnd &&
          proposedEnd > addMonths(previous.dataAdmissao, 24) &&
          (!previous.estagio?.dataTerminoPrevista ||
            proposedEnd > previous.estagio.dataTerminoPrevista)
        )
          throw new DomainError(
            422,
            "O término do contrato/TCE não pode exceder 24 meses da admissão.",
          );
        if (proposedEnd && proposedEnd < previous.dataAdmissao)
          throw new DomainError(
            422,
            "O fim previsto do estágio não pode ser anterior à admissão.",
          );
        if (stageData.instituicaoEnsinoId) {
          const institution = await tx.instituicaoEnsino.findUnique({
            where: { id: String(stageData.instituicaoEnsinoId) },
          });
          if (!institution || !institution.ativa)
            throw new DomainError(422, "Selecione uma instituição ativa.");
        }
        const stage = previous.estagio
          ? await tx.estagio.update({
              where: { vinculoId: id },
              data: stageData as never,
            })
          : await tx.estagio.create({ data: stageData as never });
        await audit(
          tx,
          req.userId,
          previous.estagio ? "ALTERAR" : "CRIAR",
          "estagio",
          stage.id,
          previous.estagio ?? undefined,
          stage,
        );
        await ensureTce(tx, id, tceStatus, req.userId);
      } else if ((previous.tipo as string) === "ESTAGIO") {
        await ensureTce(tx, id, "AGUARDANDO_ASSINATURA", req.userId);
      } else if (previous.tipo !== "ESTAGIO" && body.estagio) {
        throw new DomainError(
          422,
          "Dados de estágio só são permitidos para vínculo ESTAGIO.",
        );
      }
      const linkData = dateData(
        persistScale({ ...body.vinculo, status: body.vinculo.status }),
        ["dataAdmissao", "dataDesligamento"],
      );
      await validateLink(tx, linkData);
      await assertCurrentEmployment(tx, previous.pessoaId, linkData.status, id);
      const current = await tx.vinculo.update({
        where: { id },
        data: linkData as never,
        include: { pessoa: true, unidade: true, equipe: true },
      });
      if (current.equipeId !== previous.equipeId) {
        const now = new Date();
        await tx.vinculoEquipeHistorico.updateMany({
          where: { vinculoId: id, fimEm: null },
          data: { fimEm: now },
        });
        if (current.equipeId)
          await tx.vinculoEquipeHistorico.create({
            data: { vinculoId: id, equipeId: current.equipeId, inicioEm: now },
          });
      }
      await audit(tx, req.userId, "ALTERAR", "vinculo", id, previous, current);
      return current;
    });
    return result;
  });
}
