import { z } from "zod";
import {
  id,
  date,
  optionalDate,
  optionalText,
  shortText,
  money,
  nonNegativeNumber,
} from "./schemas.js";
export const benefitTypes = [
  "TRANSPORTE",
  "ALIMENTACAO",
  "CESTA_BASICA",
  "PREMIACAO",
  "OUTRO",
] as const;
export const transportTypes = [
  "ONIBUS",
  "ONIBUS_INTER",
  "BARCA",
  "METRO",
  "TREM",
] as const;
const transporteItemBase = z
  .object({
    beneficioVinculoId: id,
    tipoConducao: z.enum(transportTypes),
    fornecedorId: id,
    valorDiario: money,
    inicioVigencia: date,
    fimVigencia: optionalDate,
    ativo: z.boolean().default(true),
  })
  .strict();
export const transporteItemSchema = transporteItemBase.superRefine((v, ctx) => {
  if (v.fimVigencia && v.fimVigencia < v.inicioVigencia)
    ctx.addIssue({
      code: "custom",
      path: ["fimVigencia"],
      message: "Fim anterior ao início.",
    });
});
export const transporteItemInputSchema = transporteItemBase
  .omit({ beneficioVinculoId: true })
  .extend({ id: id.optional() })
  .strict()
  .superRefine((v, ctx) => {
    if (v.fimVigencia && v.fimVigencia < v.inicioVigencia)
      ctx.addIssue({
        code: "custom",
        path: ["fimVigencia"],
        message: "Fim anterior ao início.",
      });
  });
export const transporteCompetenciaSchema = z
  .object({
    beneficioVinculoId: id,
    configuracaoId: id,
    competencia: date.refine(
      (v) => v.endsWith("-01"),
      "Informe o primeiro dia do mês.",
    ),
    quantidadeDias: nonNegativeNumber(),
    valorInformado: money.nullable().optional(),
    status: z
      .enum(["PENDENTE", "CONFERIDO", "PAGO", "CANCELADO"])
      .default("PENDENTE"),
    observacoes: optionalText,
  })
  .strict();
export const fornecedorSchema = z
  .object({ nome: shortText, ativo: z.boolean().default(true) })
  .strict();
export const configuracaoBeneficioSchema = z
  .object({
    unidadeId: id,
    tipo: z.enum(benefitTypes),
    fornecedorId: id,
    ativa: z.boolean().default(true),
    observacoes: optionalText,
  })
  .strict();
const recurringQuantity = nonNegativeNumber().nullable().optional();
export const beneficioVinculoSchema = z
  .object({
    vinculoId: id,
    tipo: z.enum(benefitTypes),
    inicioVigencia: date,
    fimVigencia: optionalDate,
    status: z.enum(["ATIVO", "ENCERRADO"]).default("ATIVO"),
    configuracaoRecorrenteId: id.nullable().optional(),
    valorDiario: money.nullable().optional(),
    valorMensalRecorrente: money.nullable().optional(),
    quantidadeRecorrente: recurringQuantity,
    valorUnitarioRecorrente: money.nullable().optional(),
    observacoes: optionalText,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.fimVigencia && v.fimVigencia < v.inicioVigencia)
      ctx.addIssue({
        code: "custom",
        path: ["fimVigencia"],
        message: "Fim anterior ao início.",
      });
  });
export const aquisicaoPrepararSchema = z
  .object({
    unidadeId: id,
    competencia: date.refine(
      (v) => v.endsWith("-01"),
      "Informe o primeiro dia do mês.",
    ),
    diasTransporte: nonNegativeNumber(999).optional(),
    diasAlimentacao: nonNegativeNumber(999).optional(),
    quantidadePadrao: nonNegativeNumber().optional(),
    excecoes: z
      .array(
        z
          .object({
            beneficioVinculoId: id,
            quantidadeDias: nonNegativeNumber(999),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();
export const aquisicaoPedidoSchema = z
  .object({
    unidadeId: id,
    competencia: date.refine(
      (v) => v.endsWith("-01"),
      "Informe o primeiro dia do mês.",
    ),
    tipo: z.enum(benefitTypes),
    fornecedorId: id,
    itens: z
      .array(
        z
          .object({ competenciaId: id, valor: money.refine((v) => v > 0) })
          .strict(),
      )
      .min(1),
    observacoes: optionalText,
  })
  .strict();
export const pedidoMensalSimulacaoSchema = z
  .object({
    unidadeId: id,
    competencia: date.refine(
      (v) => v.endsWith("-01"),
      "Informe o primeiro dia do mês.",
    ),
    tipo: z.enum(benefitTypes),
  })
  .strict();
export const pedidoMensalGerarSchema = pedidoMensalSimulacaoSchema.extend({
  itens: z
    .array(
      z
        .object({
          vinculoId: id,
          configuracaoId: id.nullable().optional(),
          incluir: z.boolean().default(true),
          modoAlimentacao: z
            .enum(["DIAS_TRABALHADOS", "VALOR_MENSAL"])
            .optional(),
          quantidadeDias: nonNegativeNumber(999).nullable().optional(),
          quantidade: nonNegativeNumber().nullable().optional(),
          valorUnitario: money.nullable().optional(),
          valorMensalBase: money.nullable().optional(),
          valorSolicitado: money.nullable().optional(),
          motivoAfastado: optionalText,
          observacoes: optionalText,
          transporteItens: z
            .array(
              z
                .object({
                  tipoConducao: z.enum(transportTypes),
                  fornecedorId: id,
                  valorDiario: money,
                })
                .strict(),
            )
            .optional(),
        })
        .strict(),
    )
    .min(1),
});
export const beneficioLoteSchema = z
  .object({
    unidadeId: id,
    tipo: z.enum(benefitTypes),
    competencia: date.refine(
      (v) => v.endsWith("-01"),
      "Informe o primeiro dia do mês.",
    ),
    configuracaoId: id.nullable().optional(),
    itens: z
      .array(
        z
          .object({
            vinculoId: id,
            valorDiario: money.nullable().optional(),
            valorMensalRecorrente: money.nullable().optional(),
            quantidadeDias: recurringQuantity,
            quantidade: recurringQuantity,
            valorUnitario: money.nullable().optional(),
            transporteItens: z
              .array(
                z
                  .object({
                    tipoConducao: z.enum(transportTypes),
                    fornecedorId: id,
                    valorDiario: money,
                  })
                  .strict(),
              )
              .default([]),
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.tipo !== "TRANSPORTE" && !value.configuracaoId)
      ctx.addIssue({
        code: "custom",
        path: ["configuracaoId"],
        message: "Selecione o fornecedor.",
      });
  });
export const aquisicaoConfirmarSchema = z
  .object({
    referenciaExterna: optionalText,
    dataCompra: date,
    itens: z
      .array(
        z
          .object({
            itemId: id,
            valor: money.refine((value) => value >= 0),
            status: z.enum(["CONFIRMADO", "REJEITADO"]),
            motivo: optionalText,
          })
          .strict(),
      )
      .min(1),
  })
  .strict()
  .superRefine((v, ctx) => {
    for (const [index, item] of v.itens.entries())
      if (item.status === "CONFIRMADO" && item.valor <= 0)
        ctx.addIssue({
          code: "custom",
          path: ["itens", index, "valor"],
          message: "Informe o valor confirmado.",
        });
  });
export const aquisicaoReverterSchema = z
  .object({ valor: money.refine((v) => v > 0), data: date, motivo: shortText })
  .strict();
const quantity = z.coerce
  .number()
  .min(0)
  .max(99999)
  .multipleOf(0.01)
  .nullable()
  .optional();
export const competenciaSchema = z
  .object({
    beneficioVinculoId: id,
    configuracaoId: id,
    componente: shortText.default("Principal"),
    competencia: date.refine(
      (v) => v.endsWith("-01"),
      "Informe o primeiro dia do mês.",
    ),
    quantidadeDias: quantity,
    quantidade: quantity,
    valorUnitario: money.nullable().optional(),
    valorMensalBase: money.nullable().optional(),
    valorInformado: money.nullable().optional(),
    status: z
      .enum(["PENDENTE", "CONFERIDO", "PAGO", "CANCELADO"])
      .default("PENDENTE"),
    observacoes: optionalText,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.quantidadeDias != null && v.quantidade != null)
      ctx.addIssue({
        code: "custom",
        path: ["quantidade"],
        message: "Informe dias ou quantidade, não ambos.",
      });
  });
export const beneficioAjusteSchema = z
  .object({
    competenciaId: id,
    tipo: z.enum(["CREDITO", "DEBITO"]),
    valor: money.refine((v) => v > 0),
    motivo: shortText,
  })
  .strict();
export const beneficioAjusteDistribuicaoSchema = z
  .object({
    competenciaId: id,
    tipo: z.enum(["CREDITO", "DEBITO"]),
    valor: money.refine((v) => v > 0),
    motivo: shortText,
    distribuicoes: z
      .array(
        z
          .object({
            transporteCompetenciaItemId: id,
            valor: money.refine((v) => v > 0),
          })
          .strict(),
      )
      .default([]),
  })
  .strict();
export const fechamentoBeneficioSchema = z
  .object({
    unidadeId: id,
    competencia: date.refine(
      (v) => v.endsWith("-01"),
      "Informe o primeiro dia do mês.",
    ),
  })
  .strict();
export const reabrirBeneficioSchema = z.object({ motivo: shortText }).strict();
export const beneficioPeriodoSchema = z
  .object({
    beneficioVinculoId: id,
    anoInicio: z.coerce
      .number()
      .int()
      .min(1900)
      .max(2200)
      .nullable()
      .optional(),
    anoFim: z.coerce.number().int().min(1900).max(2200).nullable().optional(),
    referenciaOriginal: shortText,
    valor: money.nullable().optional(),
    status: z
      .enum(["PENDENTE", "PREVISTO", "PAGO", "ATUALIZADO", "CANCELADO"])
      .default("PENDENTE"),
    dataEvento: optionalDate,
    textoOriginal: shortText,
    observacoes: optionalText,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.anoInicio && v.anoFim && v.anoFim < v.anoInicio)
      ctx.addIssue({
        code: "custom",
        path: ["anoFim"],
        message: "Ano final anterior ao inicial.",
      });
  });
