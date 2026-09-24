import { validCpf } from "@duali/shared";

export type LinkType = "CLT" | "ESTAGIO" | "APRENDIZ" | "TRAINEE";
export type ScaleValue =
  | { tipo: "DIAS_SEMANA"; diasSemana: string[] }
  | { tipo: "QUANTIDADE_SEMANAL"; quantidadeDiasSemana: number }
  | null;

export type PersonCreateState = {
  pessoa: {
    nomeCompleto: string;
    cpf: string;
    rg: string;
    dataNascimento: string;
    email: string;
    telefone: string;
    observacoes: string;
  };
  incluirVinculo: boolean;
  vinculo: {
    unidadeId: string;
    equipeId: string;
    tipo: LinkType;
    dataAdmissao: string;
    matricula: string;
    cargoFuncao: string;
    gestor: string;
    escalaEstruturada: ScaleValue;
  };
  estagio: {
    instituicaoEnsinoId: string;
    periodoAcademico: string;
    valorBolsa: string;
    dataTerminoPrevista: string;
    periodicidadeDocumentoMeses: string;
    tceStatus: "AGUARDANDO_ASSINATURA" | "ASSINADO";
  };
};

export const initialPersonCreateState: PersonCreateState = {
  pessoa: {
    nomeCompleto: "",
    cpf: "",
    rg: "",
    dataNascimento: "",
    email: "",
    telefone: "",
    observacoes: "",
  },
  incluirVinculo: true,
  vinculo: {
    unidadeId: "",
    equipeId: "",
    tipo: "CLT",
    dataAdmissao: "",
    matricula: "",
    cargoFuncao: "",
    gestor: "",
    escalaEstruturada: null,
  },
  estagio: {
    instituicaoEnsinoId: "",
    periodoAcademico: "",
    valorBolsa: "",
    dataTerminoPrevista: "",
    periodicidadeDocumentoMeses: "6",
    tceStatus: "AGUARDANDO_ASSINATURA",
  },
};

const nullable = (value: string) => value.trim() || null;
const digits = (value: string) => value.replace(/\D/g, "");

export function buildPersonCreateRequest(state: PersonCreateState) {
  const pessoa = {
    nomeCompleto: state.pessoa.nomeCompleto.trim(),
    cpf: nullable(digits(state.pessoa.cpf)),
    rg: nullable(digits(state.pessoa.rg)),
    dataNascimento: nullable(state.pessoa.dataNascimento),
    email: nullable(state.pessoa.email),
    telefone: nullable(digits(state.pessoa.telefone)),
    observacoes: nullable(state.pessoa.observacoes),
    ativa: true,
  };
  if (!state.incluirVinculo)
    return { endpoint: "pessoas", payload: pessoa } as const;
  const vinculo = {
    unidadeId: state.vinculo.unidadeId,
    equipeId: nullable(state.vinculo.equipeId),
    tipo: state.vinculo.tipo,
    dataAdmissao: state.vinculo.dataAdmissao,
    matricula: nullable(state.vinculo.matricula),
    cargoFuncao: nullable(state.vinculo.cargoFuncao),
    gestor: nullable(state.vinculo.gestor),
    escala: null,
    escalaEstruturada: state.vinculo.escalaEstruturada,
  };
  return {
    endpoint: "pessoas-com-vinculo",
    payload: {
      pessoa,
      vinculo,
      ...(state.vinculo.tipo === "ESTAGIO"
        ? {
            estagio: {
              instituicaoEnsinoId: nullable(state.estagio.instituicaoEnsinoId),
              periodoAcademico: nullable(state.estagio.periodoAcademico),
              valorBolsa: nullable(state.estagio.valorBolsa),
              dataTerminoPrevista: nullable(state.estagio.dataTerminoPrevista),
              periodicidadeDocumentoMeses: Number(
                state.estagio.periodicidadeDocumentoMeses,
              ),
              tceStatus: state.estagio.tceStatus,
            },
          }
        : {}),
    },
  } as const;
}

export type CreateStep = "personal" | "link" | "internship" | "review";
export type FieldErrors = Record<string, string>;

function validDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

export function validateCreateStep(
  state: PersonCreateState,
  step: CreateStep,
): FieldErrors {
  const errors: FieldErrors = {};
  if (step === "personal") {
    if (!state.pessoa.nomeCompleto.trim())
      errors.nomeCompleto = "Informe o nome completo.";
    const cpf = digits(state.pessoa.cpf);
    if (cpf && !validCpf(cpf)) errors.cpf = "Informe um CPF válido.";
    const phone = digits(state.pessoa.telefone);
    if (phone && ![10, 11].includes(phone.length))
      errors.telefone = "Informe um telefone com 10 ou 11 dígitos.";
    if (
      state.pessoa.email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(state.pessoa.email)
    )
      errors.email = "Informe um e-mail válido.";
    if (state.pessoa.dataNascimento && !validDate(state.pessoa.dataNascimento))
      errors.dataNascimento = "Informe uma data válida.";
  }
  if (step === "link" && state.incluirVinculo) {
    if (!state.vinculo.unidadeId) errors.unidadeId = "Selecione a unidade.";
    if (!validDate(state.vinculo.dataAdmissao))
      errors.dataAdmissao = "Informe a data de admissão.";
    const scale = state.vinculo.escalaEstruturada;
    if (scale?.tipo === "DIAS_SEMANA" && scale.diasSemana.length === 0)
      errors.escalaEstruturada = "Selecione pelo menos um dia da semana.";
    if (
      scale?.tipo === "QUANTIDADE_SEMANAL" &&
      (scale.quantidadeDiasSemana < 1 || scale.quantidadeDiasSemana > 7)
    )
      errors.escalaEstruturada = "Informe uma quantidade entre 1 e 7.";
  }
  if (step === "internship" && state.vinculo.tipo === "ESTAGIO") {
    const periodicity = Number(state.estagio.periodicidadeDocumentoMeses);
    if (!Number.isInteger(periodicity) || periodicity < 1 || periodicity > 120)
      errors.periodicidadeDocumentoMeses =
        "Informe uma periodicidade entre 1 e 120 meses.";
    if (state.estagio.dataTerminoPrevista) {
      if (!validDate(state.estagio.dataTerminoPrevista))
        errors.dataTerminoPrevista = "Informe uma data válida.";
      else if (
        state.vinculo.dataAdmissao &&
        state.estagio.dataTerminoPrevista < state.vinculo.dataAdmissao
      )
        errors.dataTerminoPrevista =
          "O fim previsto não pode ser anterior à admissão.";
      else if (state.vinculo.dataAdmissao) {
        const admission = new Date(`${state.vinculo.dataAdmissao}T00:00:00Z`);
        const limit = new Date(admission);
        limit.setUTCMonth(limit.getUTCMonth() + 24);
        if (
          state.estagio.dataTerminoPrevista > limit.toISOString().slice(0, 10)
        )
          errors.dataTerminoPrevista =
            "O fim previsto não pode exceder 24 meses da admissão.";
      }
    }
  }
  return errors;
}

export function applicableSteps(state: PersonCreateState): CreateStep[] {
  if (!state.incluirVinculo) return ["personal", "link", "review"];
  return state.vinculo.tipo === "ESTAGIO"
    ? ["personal", "link", "internship", "review"]
    : ["personal", "link", "review"];
}
