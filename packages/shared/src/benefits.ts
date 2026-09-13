import { z } from "zod";
import {
  id,
  date,
  optionalDate,
  optionalText,
  shortText,
  money,
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
] as const;
export const cartaoTransporteSchema = z
  .object({ nome: shortText, ativo: z.boolean().default(true) })
  .strict();
const transporteItemBase = z
  .object({
    beneficioVinculoId: id,
    tipoConducao: z.enum(transportTypes),
    cartaoTransporteId: id,
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
  .strict();
export const transporteCompetenciaSchema = z
  .object({
    beneficioVinculoId: id,
    configuracaoId: id,
    competencia: date.refine(
      (v) => v.endsWith("-01"),
      "Informe o primeiro dia do mês.",
    ),
    quantidadeDias: z.coerce
      .number()
      .finite()
      .min(0)
      .max(99999)
      .multipleOf(0.01),
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
const recurringQuantity = z.coerce
  .number()
  .min(0)
  .max(99999)
  .multipleOf(0.01)
  .nullable()
  .optional();
export const beneficioVinculoSchema = z
  .object({
    vinculoId: id,
    tipo: z.enum(benefitTypes),
    inicioVigencia: date,
    fimVigencia: optionalDate,
    status: z.enum(["ATIVO", "ENCERRADO"]).default("ATIVO"),
    configuracaoRecorrenteId: id.nullable().optional(),
    valorDiario: money.nullable().optional(),
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
    diasTransporte: z.coerce
      .number()
      .min(0)
      .max(999)
      .multipleOf(0.01)
      .optional(),
    diasAlimentacao: z.coerce
      .number()
      .min(0)
      .max(999)
      .multipleOf(0.01)
      .optional(),
    quantidadePadrao: z.coerce
      .number()
      .min(0)
      .max(99999)
      .multipleOf(0.01)
      .optional(),
    excecoes: z
      .array(
        z
          .object({
            beneficioVinculoId: id,
            quantidadeDias: z.coerce.number().min(0).max(999).multipleOf(0.01),
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
    cartaoTransporteId: id.nullable().optional(),
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
export const beneficioLoteSchema = z
  .object({
    unidadeId: id,
    tipo: z.enum(benefitTypes),
    competencia: date.refine(
      (v) => v.endsWith("-01"),
      "Informe o primeiro dia do mês.",
    ),
    configuracaoId: id,
    itens: z
      .array(
        z
          .object({
            vinculoId: id,
            valorDiario: money.nullable().optional(),
            quantidadeDias: recurringQuantity,
            quantidade: recurringQuantity,
            valorUnitario: money.nullable().optional(),
            transporteItens: z
              .array(
                z
                  .object({
                    tipoConducao: z.enum(transportTypes),
                    cartaoTransporteId: id,
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
  .strict();
export const aquisicaoConfirmarSchema = z
  .object({
    referenciaExterna: optionalText,
    dataCompra: date,
    itens: z
      .array(
        z
          .object({
            itemId: id,
            valor: money.min(0),
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
