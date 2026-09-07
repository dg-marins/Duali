export interface Field {
  key: string;
  label: string;
  type?:
    | "text"
    | "email"
    | "password"
    | "date"
    | "number"
    | "checkbox"
    | "textarea";
  required?: boolean;
  options?: string[];
  resource?: string;
  default?: unknown;
}
export interface Screen {
  path: string;
  title: string;
  description: string;
  fields: Field[];
  columns: string[];
}
import { internshipScreens } from "./internship";
import { leaveScreens } from "./leave";
import { benefitScreens } from "./benefits";
export const screens: Screen[] = [
  ...internshipScreens,
  ...leaveScreens,
  ...benefitScreens,
  {
    path: "pessoas",
    title: "Pessoas",
    description: "Cadastro único, com histórico de vínculos CLT e estágio.",
    columns: ["nomeCompleto", "cpf", "email", "ativa"],
    fields: [
      { key: "nomeCompleto", label: "Nome completo", required: true },
      { key: "nomeSocial", label: "Nome social" },
      { key: "cpf", label: "CPF" },
      { key: "rg", label: "RG" },
      { key: "dataNascimento", label: "Nascimento", type: "date" },
      { key: "email", label: "E-mail", type: "email" },
      { key: "telefone", label: "Telefone" },
      { key: "cep", label: "CEP" },
      { key: "logradouro", label: "Logradouro" },
      { key: "numeroEndereco", label: "Número" },
      { key: "complemento", label: "Complemento" },
      { key: "bairro", label: "Bairro" },
      { key: "cidadeEndereco", label: "Cidade" },
      { key: "ufEndereco", label: "UF" },
      {
        key: "endereco",
        label: "Endereço legado importado",
        type: "textarea",
      },
      { key: "observacoes", label: "Observações", type: "textarea" },
      {
        key: "ativa",
        label: "Cadastro ativo",
        type: "checkbox",
        default: true,
      },
    ],
  },
  {
    path: "vinculos",
    title: "Vínculos",
    description: "Admissão, unidade, equipe e situação de cada vínculo.",
    columns: ["pessoa", "tipo", "unidade", "equipe", "status"],
    fields: [
      { key: "pessoaId", label: "Pessoa", resource: "pessoas", required: true },
      {
        key: "tipo",
        label: "Tipo",
        options: ["CLT", "ESTAGIO"],
        required: true,
      },
      {
        key: "unidadeId",
        label: "Unidade",
        resource: "unidades",
        required: true,
      },
      { key: "equipeId", label: "Equipe", resource: "equipes" },
      { key: "dataAdmissao", label: "Admissão", type: "date", required: true },
      {
        key: "status",
        label: "Status",
        options: ["ATIVO", "AFASTADO", "DESLIGADO"],
        default: "ATIVO",
        required: true,
      },
      { key: "dataDesligamento", label: "Desligamento", type: "date" },
      { key: "matricula", label: "Matrícula" },
      { key: "cargoFuncao", label: "Cargo / função" },
      { key: "gestor", label: "Gestor" },
      { key: "observacoes", label: "Observações", type: "textarea" },
    ],
  },
  {
    path: "unidades",
    title: "Unidades",
    description: "Configurações operacionais por unidade.",
    columns: ["nome", "sigla", "cidade", "uf", "ativa"],
    fields: [
      { key: "nome", label: "Nome", required: true },
      { key: "sigla", label: "Sigla", required: true },
      { key: "cidade", label: "Cidade" },
      { key: "uf", label: "UF", required: true },
      {
        key: "diasAlerta",
        label: "Antecedência dos alertas (dias)",
        type: "number",
        default: 30,
        required: true,
      },
      { key: "ativa", label: "Ativa", type: "checkbox", default: true },
    ],
  },
  {
    path: "equipes",
    title: "Equipes",
    description: "Preserve a nomenclatura utilizada pela operação.",
    columns: ["nome", "ativa"],
    fields: [
      { key: "nome", label: "Nome", required: true },
      { key: "observacoes", label: "Observações", type: "textarea" },
      { key: "ativa", label: "Ativa", type: "checkbox", default: true },
    ],
  },
  {
    path: "usuarios",
    title: "Administradores",
    description:
      "Acesso individual. Alterar senha revoga todas as sessões do usuário.",
    columns: ["nome", "email", "ativo"],
    fields: [
      { key: "nome", label: "Nome", required: true },
      { key: "email", label: "E-mail", type: "email", required: true },
      {
        key: "senha",
        label: "Nova senha (mínimo 12 caracteres)",
        type: "password",
      },
      { key: "ativo", label: "Acesso ativo", type: "checkbox", default: true },
    ],
  },
];
export const labels: Record<string, string> = {
  pessoa: "Pessoa",
  unidade: "Unidade",
  equipe: "Equipe",
  id: "Identificador",
  criadoEm: "Data",
  acao: "Ação",
  entidade: "Entidade",
  usuario: "Usuário",
};
export function label(key: string, screen?: Screen) {
  return screen?.fields.find((f) => f.key === key)?.label ?? labels[key] ?? key;
}
