import { z } from "zod";
import { id, date, optionalDate, optionalText, shortText } from "./schemas.js";
export function addMonthsClamped(start: Date, months: number): Date {
  const d = new Date(
    Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + months, 1),
  );
  const last = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0),
  ).getUTCDate();
  d.setUTCDate(Math.min(start.getUTCDate(), last));
  return d;
}
export function entitlements(
  admission: Date,
  type: "CLT" | "ESTAGIO" | "APRENDIZ",
  until: Date,
  termination: Date | null = null,
) {
  if (type === "APRENDIZ") return [];
  const end = termination && termination < until ? termination : until,
    months = type === "CLT" ? 12 : 6,
    days = type === "CLT" ? 30 : 15;
  const events: {
    dataAquisicao: Date;
    inicioAquisitivo: Date;
    fimAquisitivo: Date;
    quantidadeDias: number;
  }[] = [];
  for (let n = 1; n <= 2000; n++) {
    const acquired = addMonthsClamped(admission, months * n);
    if (acquired > end) break;
    events.push({
      dataAquisicao: acquired,
      inicioAquisitivo: addMonthsClamped(admission, months * (n - 1)),
      fimAquisitivo: new Date(acquired.getTime() - 86400000),
      quantidadeDias: days,
    });
  }
  return events;
}
export const inclusiveDays = (start: string, end: string) =>
  (Date.parse(end) - Date.parse(start)) / 86400000 + 1;
const days = z.coerce.number().positive().max(999).multipleOf(0.01);
export const direitoSchema = z
  .object({
    vinculoId: id,
    dataAquisicao: date,
    inicioAquisitivo: optionalDate,
    fimAquisitivo: optionalDate,
    quantidadeDias: days,
    origem: z
      .enum(["AUTOMATICA", "IMPORTACAO", "AJUSTE_MANUAL"])
      .default("IMPORTACAO"),
    prazoConcessivo: optionalDate,
    observacoes: optionalText,
  })
  .strict();
export const periodoSchema = z
  .object({
    vinculoId: id,
    dataInicio: date,
    dataFim: date,
    quantidadeDias: days,
    tipo: z.enum(["FERIAS", "DESCANSO_ESTAGIO"]),
    status: z
      .enum(["PROGRAMADO", "EM_GOZO", "CONCLUIDO", "CANCELADO"])
      .default("PROGRAMADO"),
    motivo: optionalText,
    observacoes: optionalText,
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.dataFim < v.dataInicio)
      ctx.addIssue({
        code: "custom",
        path: ["dataFim"],
        message: "Fim anterior ao início.",
      });
    if (
      inclusiveDays(v.dataInicio, v.dataFim) !== v.quantidadeDias &&
      !v.motivo?.trim()
    )
      ctx.addIssue({
        code: "custom",
        path: ["motivo"],
        message:
          "Justifique a diferença em relação aos dias corridos inclusivos.",
      });
  });
export const ajusteSchema = z
  .object({
    vinculoId: id,
    tipo: z.enum(["CREDITO", "DEBITO"]),
    quantidadeDias: days,
    dataReferencia: optionalDate,
    motivo: shortText,
  })
  .strict();
export const consumoSchema = z
  .object({
    periodoId: id,
    direitoId: id.nullable().optional(),
    quantidadeDias: days,
    motivo: optionalText,
  })
  .strict();
