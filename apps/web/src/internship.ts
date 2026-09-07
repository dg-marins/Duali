import type { Screen, Field } from "./resources";
const vinculo: Field = {
  key: "vinculoId",
  label: "Vínculo",
  resource: "vinculos",
  required: true,
};
const obs: Field = {
  key: "observacoes",
  label: "Observações",
  type: "textarea",
};
const dates: Field[] = [
  { key: "inicioVigencia", label: "Início de vigência", type: "date" },
  { key: "fimVigencia", label: "Fim de vigência", type: "date" },
];
export const internshipScreens: Screen[] = [
  {
    path: "estagios",
    title: "Estágios",
    description: "Dados acadêmicos e bolsa associados ao vínculo de estágio.",
    columns: ["vinculo", "instituicaoEnsino", "curso", "valorBolsa"],
    fields: [
      vinculo,
      {
        key: "instituicaoEnsinoId",
        label: "Instituição",
        resource: "instituicoes",
      },
      { key: "matriculaAcademica", label: "Matrícula acadêmica" },
      { key: "curso", label: "Curso" },
      { key: "periodoAcademico", label: "Período acadêmico" },
      { key: "valorBolsa", label: "Bolsa (R$)", type: "number" },
      { key: "dataTerminoPrevista", label: "Término previsto", type: "date" },
      { key: "horario", label: "Horário" },
      { key: "area", label: "Área" },
      { key: "representanteTce", label: "Representante do TCE" },
      { key: "dadosBancarios", label: "Dados bancários", type: "textarea" },
      { key: "agenteIntegracao", label: "Agente de integração" },
      obs,
    ],
  },
  {
    path: "instituicoes",
    title: "Instituições",
    description: "Instituições de ensino.",
    columns: ["nome", "sigla", "ativa"],
    fields: [
      { key: "nome", label: "Nome", required: true },
      { key: "sigla", label: "Sigla" },
      { key: "ativa", label: "Ativa", type: "checkbox", default: true },
      obs,
    ],
  },
  {
    path: "documentos",
    title: "Documentos",
    description:
      "TCE, aditivos, renovações e distratos sem limite de registros.",
    columns: ["vinculo", "tipo", "numero", "fimVigencia", "status"],
    fields: [
      vinculo,
      {
        key: "tipo",
        label: "Tipo",
        options: ["TCE", "ADITIVO", "RENOVACAO", "DISTRATO", "OUTRO"],
        required: true,
      },
      { key: "numero", label: "Número" },
      { key: "dataReferencia", label: "Data de referência", type: "date" },
      ...dates,
      {
        key: "status",
        label: "Status",
        options: ["PENDENTE", "VIGENTE", "VENCIDO", "CANCELADO"],
        default: "PENDENTE",
      },
      obs,
    ],
  },
  {
    path: "seguros",
    title: "Seguros",
    description: "Apólices e vigências do seguro de estágio.",
    columns: ["seguradora", "numeroApolice", "fimVigencia", "status"],
    fields: [
      vinculo,
      { key: "seguradora", label: "Seguradora", required: true },
      { key: "numeroApolice", label: "Apólice" },
      ...dates,
      {
        key: "status",
        label: "Status",
        options: ["ATIVO", "ENCERRADO", "PENDENTE"],
        default: "PENDENTE",
      },
      obs,
    ],
  },
  {
    path: "seguro-movimentacoes",
    title: "Movimentações de seguro",
    description:
      "Histórico de inclusão, exclusão e alteração. Registros não são sobrescritos.",
    columns: ["seguroEstagio", "tipo", "dataMovimentacao"],
    fields: [
      {
        key: "seguroEstagioId",
        label: "Seguro",
        resource: "seguros",
        required: true,
      },
      {
        key: "tipo",
        label: "Tipo",
        options: ["INCLUSAO", "EXCLUSAO", "ALTERACAO"],
        required: true,
      },
      {
        key: "dataMovimentacao",
        label: "Data da movimentação",
        type: "date",
        required: true,
      },
      obs,
    ],
  },
];
