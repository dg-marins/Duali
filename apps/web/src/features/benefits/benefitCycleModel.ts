import type { Row } from "../../api";

export type CycleState = "PREVISTO" | "SOLICITADO" | "CONCLUIDO" | "CANCELADO";

export type CycleUnitSummary = Row & {
  id: string;
  unidadeId: string;
  unidade: string;
  possuiPrevisao: boolean;
  pessoasPrevistas: number;
  valorPrevisto: string;
  valorSolicitado: string;
  valorConcluido: string;
  saldoPendente: string;
  estado: CycleState;
  ocorrencias: string[];
  impedimentos: string[];
  fechamento: "ABERTA" | "EM_REVISAO" | "FECHADA";
};

export type BenefitCycleSummary = {
  competencia: string;
  possuiPrevisao: boolean;
  previsto: string;
  solicitado: string;
  concluido: string;
  compradoLiquido: string;
  emPedido: string;
  cancelado: string;
  pessoasPrevistas: number;
  estado: CycleState;
  ocorrencias: string[];
  impedimentos: string[];
  unidades: CycleUnitSummary[];
  cicloMensal: Row[];
  previsaoPersistida: boolean;
  lancamentosPendentes: number;
};

export function decimalToCents(value: unknown): bigint {
  const normalized = String(value ?? "0")
    .trim()
    .replace(",", ".");
  const match = normalized.match(/^(-?)(\d+)(?:\.(\d{1,2}))?$/);
  if (!match) return 0n;
  const cents =
    BigInt(match[2]!) * 100n + BigInt((match[3] ?? "").padEnd(2, "0"));
  return match[1] === "-" ? -cents : cents;
}

export function centsToDecimal(value: bigint) {
  const sign = value < 0n ? "-" : "";
  const absolute = value < 0n ? -value : value;
  return `${sign}${absolute / 100n}.${String(absolute % 100n).padStart(2, "0")}`;
}

export function sumDecimal(values: unknown[]) {
  return centsToDecimal(
    values.reduce<bigint>((total, value) => total + decimalToCents(value), 0n),
  );
}

export const benefitLabels: Record<string, string> = {
  ALIMENTACAO: "Alimentação",
  TRANSPORTE: "Transporte",
  CESTA_BASICA: "Cesta básica",
  PREMIACAO: "Premiação",
  OUTRO: "Outro",
};

export const occurrenceLabels: Record<string, string> = {
  PEDIDO_CANCELADO: "Pedido cancelado",
  CONFIRMACAO_PARCIAL: "Parcialmente confirmado",
  REJEICAO: "Com rejeição",
  REVERSAO: "Com reversão",
  FORNECEDOR_INATIVO: "Fornecedor inativo",
  COMPOSICAO_INCOMPLETA: "Composição incompleta",
  BASE_REABERTA: "Base reaberta",
  VINCULO_AFASTADO: "Vínculo afastado",
  VINCULO_DESLIGADO: "Vínculo desligado",
  VINCULO_NAO_ENCONTRADO: "Vínculo não encontrado",
  PESSOA_INATIVA: "Pessoa inativa",
  ADMISSAO_POSTERIOR: "Admissão posterior",
  DESLIGAMENTO_ANTERIOR: "Desligamento anterior",
};
