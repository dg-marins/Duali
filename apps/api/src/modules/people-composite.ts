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

const createSchema = z
  .object({
    pessoa: pessoaCadastroSchema,
    vinculo: vinculoCadastroSchema,
    estagio: estagioCadastroSchema.optional(),
  })
  .strict();
const editSchema = z
  .object({ vinculo: vinculoSchema, estagio: estagioCadastroSchema.optional() })
  .strict();

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
    const result = await transaction(db, async (tx) => {
      const pessoaData = dateData(pessoaCadastroSchema.parse(body.pessoa), [
        "dataNascimento",
      ]);
      const pessoa = await tx.pessoa.create({ data: pessoaData as never });
      const linkData = dateData(
        {
          ...vinculoCadastroSchema.parse(body.vinculo),
          pessoaId: pessoa.id,
          status: "ATIVO",
        },
        ["dataAdmissao", "dataDesligamento"],
      );
      await validateLink(tx, linkData);
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
        const data = dateData(
          {
            ...estagioCadastroSchema.parse(body.estagio),
            vinculoId: vinculo.id,
          },
          ["dataTerminoPrevista"],
        );
        if (data.instituicaoEnsinoId) {
          const institution = await tx.instituicaoEnsino.findUnique({
            where: { id: String(data.instituicaoEnsinoId) },
          });
          if (!institution || !institution.ativa)
            throw new DomainError(422, "Selecione uma instituição ativa.");
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
      if (previous.tipo === "ESTAGIO" && body.estagio) {
        const stageData = dateData(
          { ...estagioCadastroSchema.parse(body.estagio), vinculoId: id },
          ["dataTerminoPrevista"],
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
      } else if (previous.tipo !== "ESTAGIO" && body.estagio) {
        throw new DomainError(
          422,
          "Dados de estágio só são permitidos para vínculo ESTAGIO.",
        );
      }
      const linkData = dateData(
        { ...body.vinculo, status: body.vinculo.status },
        ["dataAdmissao", "dataDesligamento"],
      );
      await validateLink(tx, linkData);
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
