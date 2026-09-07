export const issueCodes = [
  "CPF_INVALIDO", "DATA_INVALIDA", "DATA_AMBIGUA", "PESSOA_NAO_IDENTIFICADA",
  "DUPLICIDADE_PROVAVEL", "DUPLICIDADE_POSSIVEL", "REFERENCIA_NAO_ENCONTRADA",
  "FORMULA_ORIGEM_INVALIDA", "PERIODO_ANTES_DA_ADMISSAO", "PERIODO_DATA_INVERTIDA",
  "DURACAO_PERIODO_DIVERGENTE", "DIREITO_CALCULADO_DIVERGE_DA_PLANILHA",
  "SALDO_CALCULADO_DIVERGE_DA_PLANILHA", "SALDO_NEGATIVO", "DOCUMENTO_VENCIDO",
  "DOCUMENTO_AGUARDANDO_ASSINATURA", "AJUSTE_BENEFICIO_PENDENTE",
  "APONTAMENTO_NAO_CLASSIFICADO", "DEPENDENCIA_NAO_PUBLICADA",
] as const;
export type IssueCode = (typeof issueCodes)[number];
export type ImportIssue = { codigo: IssueCode; severidade: "CRITICA" | "ATENCAO" | "REVISAO"; mensagem: string };

export function issuesFrom(messages: string[], status?: string): ImportIssue[] {
  const result: ImportIssue[] = [];
  const add = (codigo: IssueCode, mensagem: string, severidade: ImportIssue["severidade"] = "REVISAO") => {
    if (!result.some((item) => item.codigo === codigo && item.mensagem === mensagem)) result.push({ codigo, mensagem, severidade });
  };
  for (const message of messages) {
    const value = message.toLowerCase();
    if (/#[a-zÀ-ÿ0-9/!?]+|fórmula|formula/.test(value)) add("FORMULA_ORIGEM_INVALIDA", message);
    else if (value.includes("cpf")) add("CPF_INVALIDO", message);
    else if (value.includes("ambígua") || value.includes("ambigua")) add("DATA_AMBIGUA", message);
    else if (value.includes("data") || value.includes("fim anterior")) add("DATA_INVALIDA", message);
    else if (value.includes("duplicidade") || value.includes("nome semelhante")) add("DUPLICIDADE_POSSIVEL", message);
    else if (value.includes("refer") || value.includes("inexistente")) add("REFERENCIA_NAO_ENCONTRADA", message);
  }
  if (status === "AGUARDANDO_DEPENDENCIA") add("DEPENDENCIA_NAO_PUBLICADA", "Registro pai ainda não foi publicado.", "ATENCAO");
  return result;
}

export function classifyNotes(data: Record<string, unknown>) {
  return Object.entries(data).flatMap(([field, raw]) => {
    if (!/(observ|pend|apont|coment)/i.test(field) || typeof raw !== "string" || !raw.trim()) return [];
    const text = raw.trim();
    const lower = text.toLowerCase();
    const tipo = /férias|ferias|descanso/.test(lower) ? "EVENTO_FERIAS_POSSIVEL"
      : /acrescent|descont|retroativ|benef/.test(lower) ? "AJUSTE_BENEFICIO_POSSIVEL"
      : /deslig|admiss|cargo|escala|home office/.test(lower) ? "ALTERACAO_VINCULO_POSSIVEL"
      : /assinatura|document|tce|aditivo|distrato/.test(lower) ? "PENDENCIA_DOCUMENTAL"
      : /atestado|operacional/.test(lower) ? "APONTAMENTO_OPERACIONAL"
      : "NAO_CLASSIFICADO";
    return [{ campo: field, tipo, textoOriginal: text, requerConfirmacao: true }];
  });
}
