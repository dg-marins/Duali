import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { ApiError, api, display, type Row } from "./api";
import {
  DataTable,
  ActionMenu,
  ConfirmDialog,
  CurrencyInput,
  EmptyState,
  LoadingSkeleton,
  MetricCard,
  money,
  maskCpf,
  maskPhone,
  PageHeader,
  Pagination,
  RefreshingContent,
  StatusBadge,
  formatDate,
  FormDialog,
  FormSheet,
  useFormDirty,
} from "./ui";
import { Notice, RecordForm } from "./components";
import { screens } from "./resources";
import { X } from "lucide-react";

type Navigate = (path: string) => void;
const benefitLabels: Record<string, string> = {
  ALIMENTACAO: "Alimentação",
  TRANSPORTE: "Transporte",
  CESTA_BASICA: "Cesta básica",
  PREMIACAO: "Premiação",
  OUTRO: "Outro",
  ATIVO: "Ativo",
  ENCERRADO: "Encerrado",
  PENDENTE: "Pendente",
  CONFERIDO: "Conferido",
  PAGO: "Pago",
  CANCELADO: "Cancelado",
};
const documentLabels: Record<string, string> = {
  TCE: "TCE",
  ADITIVO: "Aditivo ao TCE",
  RENOVACAO: "Renovação histórica",
  DISTRATO: "Distrato",
  OUTRO: "Outro documento",
};
const conductionLabels: Record<string, string> = {
  ONIBUS: "Ônibus",
  ONIBUS_INTER: "Ônibus Intermunicipal",
  BARCA: "Barca",
  METRO: "Metrô",
  TREM: "Trem",
};
const decimalInputValue = (value: string) => {
  const cleaned = value.replace(/[^\d,.-]/g, "").trim();
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : 0;
};
type ListResult = {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
};
function useOptions() {
  const [options, setOptions] = useState<{
    units: Row[];
    teams: Row[];
    institutions: Row[];
    suppliers: Row[];
  }>({ units: [], teams: [], institutions: [], suppliers: [] });
  useEffect(() => {
    const loadAll = async (resource: string) => {
      const first = await api<ListResult>(`${resource}?page=1&pageSize=100`);
      const pages = Math.ceil(first.total / first.pageSize);
      const remaining = await Promise.all(
        Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
          api<ListResult>(`${resource}?page=${index + 2}&pageSize=100`),
        ),
      );
      return [...first.items, ...remaining.flatMap((page) => page.items)];
    };
    void Promise.all([
      loadAll("unidades"),
      loadAll("equipes"),
      loadAll("instituicoes"),
      loadAll("fornecedores"),
    ]).then(([units, teams, institutions, suppliers]) =>
      setOptions({ units, teams, institutions, suppliers }),
    );
  }, []);
  return options;
}
function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <label>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Todos</option>
        {children}
      </select>
    </label>
  );
}
function filtersQuery(filters: Record<string, string>, page: number) {
  const query = new URLSearchParams({ page: String(page) });
  Object.entries(filters).forEach(([key, value]) => {
    if (value) query.set(key, value);
  });
  return query.toString();
}

export function PeoplePage({ navigate }: { navigate: Navigate }) {
  const options = useOptions(),
    initial = new URLSearchParams(location.search);
  const [filters, setFilters] = useState({
    q: initial.get("q") ?? "",
    status: initial.get("status") ?? "",
    tipo: initial.get("segmento") ?? initial.get("tipo") ?? "",
    instituicaoId: initial.get("instituicaoId") ?? "",
    unidadeId: initial.get("unidadeId") ?? "",
    equipeId: initial.get("equipeId") ?? "",
  });
  const [page, setPage] = useState(Number(initial.get("page") ?? 1)),
    [data, setData] = useState<
      ListResult & { segmentos?: Record<string, number> }
    >({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
    }),
    [loading, setLoading] = useState(true),
    [hasLoaded, setHasLoaded] = useState(false),
    [error, setError] = useState(""),
    [creating, setCreating] = useState(false),
    [version, setVersion] = useState(0),
    [advanced, setAdvanced] = useState(
      Boolean(
        initial.get("equipeId") ||
          initial.get("status") ||
          initial.get("instituicaoId"),
      ),
    );
  useEffect(() => {
    let active = true;
    const query = filtersQuery(filters, page);
    history.replaceState({}, "", `/app/pessoas?${query}`);
    setLoading(true);
    const timer = setTimeout(
      () =>
        void api<ListResult & { segmentos: Record<string, number> }>(
          `pessoas-operacional?${query}`,
        )
          .then((result) => {
            if (active) {
              setData(result);
              setError("");
            }
          })
          .catch((e) => {
            if (active) setError((e as Error).message);
          })
          .finally(() => {
            if (active) {
              setLoading(false);
              setHasLoaded(true);
            }
          }),
      180,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [filters, page, version]);
  useEffect(() => {
    if (loading || !hasLoaded) return;
    const stored = sessionStorage.getItem("duali.people.return");
    if (!stored) return;
    const context = JSON.parse(stored) as {
      url: string;
      scroll: number;
      id: string;
    };
    if (context.url !== location.pathname + location.search) return;
    requestAnimationFrame(() => {
      const row = document.querySelector<HTMLElement>(
        `[data-person-id="${context.id}"]`,
      );
      row?.focus({ preventScroll: true });
      window.scrollTo({ top: context.scroll });
      sessionStorage.removeItem("duali.people.return");
    });
  }, [loading, hasLoaded]);
  const update = (key: string, value: string) => {
    setFilters({ ...filters, [key]: value });
    setPage(1);
  };
  return (
    <div
      className={`golden-people${filters.tipo === "ESTAGIO" ? " people-stage" : ""}`}
    >
      <PageHeader
        title="Pessoas"
        description="Encontre rapidamente uma pessoa e acompanhe sua situação atual."
        action={
          <button onClick={() => setCreating(true)}>+ Nova pessoa</button>
        }
      />
      <FormDialog
        open={creating}
        onOpenChange={setCreating}
        title="Nova pessoa"
        description="Cadastre a pessoa e, se desejar, seu vínculo inicial."
        hideHeader
        className="person-create-dialog"
      >
        {creating && (
          <PersonForm
            modal
            options={options}
            onClose={() => setCreating(false)}
            onSaved={() => {
              setCreating(false);
              setVersion((value) => value + 1);
            }}
          />
        )}
      </FormDialog>
      <Notice text={error} error />
      <div className="people-segments" aria-label="Situação atual das pessoas">
        {[
          ["CLT", "CLT"],
          ["ESTAGIO", "Estágio"],
          ["APRENDIZ", "Aprendiz"],
          ["TRAINEE", "Trainee"],
          ["SEM_VINCULO", "Sem vínculo"],
          ["INATIVO", "Inativas"],
        ].map(([value, title]) => (
          <button
            key={value}
            data-segment={value}
            className={
              filters.tipo === value
                ? "people-segment selected"
                : "people-segment"
            }
            aria-pressed={filters.tipo === value}
            onClick={() => update("tipo", filters.tipo === value ? "" : value!)}
          >
            <span>{title}</span>
            <strong>{data.segmentos?.[value!] ?? "—"}</strong>
          </button>
        ))}
      </div>
      <section className="panel filter-panel">
        <div className="filter-grid">
          <label>
            <span>Buscar pessoa</span>
            <input
              aria-label="Buscar pessoa"
              placeholder="Nome, CPF, e-mail ou matrícula"
              value={filters.q}
              onChange={(e) => update("q", e.target.value)}
            />
          </label>
          <FilterSelect
            label="Unidade"
            value={filters.unidadeId}
            onChange={(v) => update("unidadeId", v)}
          >
            {options.units.map((row) => (
              <option key={String(row.id)} value={String(row.id)}>
                {display(row)}
              </option>
            ))}
          </FilterSelect>
          <button
            className="secondary"
            aria-expanded={advanced}
            onClick={() => setAdvanced(!advanced)}
          >
            Filtros
          </button>
          <button
            className="secondary clear-filter"
            onClick={() => {
              setFilters({
                q: "",
                status: "",
                tipo: "",
                instituicaoId: "",
                unidadeId: "",
                equipeId: "",
              });
              setPage(1);
            }}
          >
            Limpar filtros
          </button>
        </div>
        {advanced && (
          <div className="filter-grid advanced-filters">
            {" "}
            <FilterSelect
              label="Status"
              value={filters.status}
              onChange={(v) => update("status", v)}
            >
              <option>ATIVO</option>
              <option>AFASTADO</option>
            </FilterSelect>
            <FilterSelect
              label="Equipe"
              value={filters.equipeId}
              onChange={(v) => update("equipeId", v)}
            >
              {options.teams.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {display(row)}
                </option>
              ))}
            </FilterSelect>
            {(filters.tipo === "ESTAGIO" || Boolean(filters.instituicaoId)) && (
              <FilterSelect
                label="Instituição"
                value={filters.instituicaoId}
                onChange={(v) => update("instituicaoId", v)}
              >
                {options.institutions.map((row) => (
                  <option key={String(row.id)} value={String(row.id)}>
                    {display(row)}
                  </option>
                ))}
              </FilterSelect>
            )}
          </div>
        )}
      </section>
      <section className="panel">
        <div className="result-count">{data.total} pessoas encontradas</div>
        {loading && !hasLoaded ? (
          <LoadingSkeleton label="Carregando pessoas…" />
        ) : (
          <RefreshingContent refreshing={loading}>
            <DataTable
              rows={data.items}
              primaryKey="nomeCompleto"
              onRow={(row) => {
                sessionStorage.setItem(
                  "duali.people.return",
                  JSON.stringify({
                    url: location.pathname + location.search,
                    scroll: window.scrollY,
                    id: row.id,
                  }),
                );
                navigate(`/app/pessoas/${row.id}`);
              }}
              empty={
                <EmptyState
                  title="Nenhuma pessoa encontrada"
                  description="Ajuste os filtros, cadastre uma pessoa ou importe uma planilha."
                  action={
                    <button onClick={() => setCreating(true)}>
                      + Nova pessoa
                    </button>
                  }
                />
              }
              columns={[
                {
                  key: "nomeCompleto",
                  label: "Nome",
                  render: (row) => (
                    <button
                      className="link-button people-name"
                      data-person-id={String(row.id)}
                      title={String(row.nomeCompleto)}
                      onClick={(event) => {
                        event.stopPropagation();
                        sessionStorage.setItem(
                          "duali.people.return",
                          JSON.stringify({
                            url: location.pathname + location.search,
                            scroll: window.scrollY,
                            id: row.id,
                          }),
                        );
                        navigate(`/app/pessoas/${row.id}`);
                      }}
                    >
                      {String(row.nomeCompleto)}
                    </button>
                  ),
                },
                {
                  key: "vinculo",
                  label: "Vínculo",
                  mobile: "hidden",
                  render: (row) =>
                    (
                      ({
                        ESTAGIO: "Estágio",
                        APRENDIZ: "Aprendiz",
                        TRAINEE: "Trainee",
                        CLT: "CLT",
                      }) as Record<string, string>
                    )[String(row.vinculo)] ?? "Sem vínculo",
                },
                {
                  key: "unidade",
                  label: "Unidade",
                  mobile: "hidden",
                  render: (row) => display(row.unidade),
                },
                {
                  key: "equipe",
                  label: "Equipe",
                  render: (row) => display(row.equipe),
                },
                ...(filters.tipo === "ESTAGIO"
                  ? [
                      {
                        key: "instituicao",
                        label: "Instituição",
                        render: (row: Row) => {
                          const institution = row.instituicao as Row | null;
                          if (!institution) return "—";
                          const name = String(institution.nome ?? "");
                          const abbreviation = String(
                            institution.sigla ?? "",
                          ).trim();
                          const label = abbreviation
                            ? `${abbreviation} - ${name}`
                            : name;
                          return (
                            <span className="people-institution" title={label}>
                              {label}
                            </span>
                          );
                        },
                      },
                      {
                        key: "admissao",
                        label: "Início",
                        render: (row: Row) => formatDate(row.admissao),
                      },
                      {
                        key: "terminoPrevisto",
                        label: "Término do contrato",
                        render: (row: Row) => formatDate(row.terminoPrevisto),
                      },
                    ]
                  : []),
                {
                  key: "status",
                  label: "Situação",
                  render: (row) => (
                    <>
                      <StatusBadge value={row.status} />
                      {Number(row.vinculosAtivos) > 1 && (
                        <StatusBadge value="INCONSISTÊNCIA" />
                      )}
                    </>
                  ),
                },
              ]}
            />
          </RefreshingContent>
        )}
        <Pagination page={page} total={data.total} onChange={setPage} />
      </section>
    </div>
  );
}

const weekdayLabels: Record<string, string> = {
  SEGUNDA: "Segunda",
  TERCA: "Terça",
  QUARTA: "Quarta",
  QUINTA: "Quinta",
  SEXTA: "Sexta",
  SABADO: "Sábado",
  DOMINGO: "Domingo",
};
function StructuredScaleFields({
  value,
  onChange,
}: {
  value: Row | null | undefined;
  onChange: (value: Row | null) => void;
}) {
  const type = String(value?.tipo ?? "");
  const selected = (value?.diasSemana as string[] | undefined) ?? [];
  return (
    <fieldset className="wide">
      <legend>Escala de dias trabalhados</legend>
      <div className="form-grid">
        <label>
          <span>Modalidade</span>
          <select
            value={type}
            onChange={(event) => {
              const next = event.target.value;
              onChange(
                next === "DIAS_SEMANA"
                  ? { tipo: next, diasSemana: [] }
                  : next === "QUANTIDADE_SEMANAL"
                    ? { tipo: next, quantidadeDiasSemana: 1 }
                    : null,
              );
            }}
          >
            <option value="">Não informar agora</option>
            <option value="DIAS_SEMANA">Dias específicos da semana</option>
            <option value="QUANTIDADE_SEMANAL">
              Quantidade de dias por semana
            </option>
          </select>
        </label>
        {type === "QUANTIDADE_SEMANAL" && (
          <label>
            <span>Dias por semana</span>
            <input
              type="number"
              min="1"
              max="7"
              value={String(value?.quantidadeDiasSemana ?? 1)}
              onChange={(event) =>
                onChange({
                  tipo: "QUANTIDADE_SEMANAL",
                  quantidadeDiasSemana: Number(event.target.value),
                })
              }
            />
          </label>
        )}
      </div>
      {type === "DIAS_SEMANA" && (
        <div
          className="scale-weekdays"
          role="group"
          aria-label="Dias da semana"
        >
          {Object.entries(weekdayLabels).map(([day, label]) => (
            <label
              className={`scale-weekday${selected.includes(day) ? " is-selected" : ""}`}
              key={day}
            >
              <input
                type="checkbox"
                checked={selected.includes(day)}
                onChange={(event) =>
                  onChange({
                    tipo: "DIAS_SEMANA",
                    diasSemana: event.target.checked
                      ? [...selected, day]
                      : selected.filter((item) => item !== day),
                  })
                }
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
function PersonForm({
  modal = false,
  person,
  options = { units: [], teams: [], institutions: [], suppliers: [] },
  onClose,
  onSaved,
  onDirtyChange,
}: {
  modal?: boolean;
  person?: Row;
  options?: ReturnType<typeof useOptions>;
  onClose: () => void;
  onSaved: (id?: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const initial = useMemo<Row>(
    () => ({
      nomeCompleto: "",
      cpf: "",
      rg: "",
      dataNascimento: "",
      email: "",
      telefone: "",
      observacoes: "",
      ativa: true,
      incluirVinculo: true,
      unidadeId: "",
      equipeId: "",
      tipo: "CLT",
      dataAdmissao: "",
      matricula: "",
      cargoFuncao: "",
      gestor: "",
      escala: "",
      escalaEstruturada: null,
      instituicaoEnsinoId: "",
      periodoAcademico: "",
      valorBolsa: "",
      dataTerminoPrevista: "",
      periodicidadeDocumentoMeses: "6",
      tceStatus: "AGUARDANDO_ASSINATURA",
      ...person,
    }),
    [person],
  );
  const [data, setData] = useState<Row>(initial),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirmClose, setConfirmClose] = useState(false);
  const dirty = JSON.stringify(data) !== JSON.stringify(initial);
  useFormDirty(dirty);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);
  const close = () => (dirty ? setConfirmClose(true) : onClose());
  const field = (key: string, label: string, type = "text") => (
    <label>
      <span>{label}</span>
      {type === "currency" ? (
        <CurrencyInput
          value={String(data[key] ?? "")}
          onValueChange={(value) => setData({ ...data, [key]: value })}
        />
      ) : (
        <input
          type={type}
          value={String(data[key] ?? "").slice(
            0,
            type === "date" ? 10 : undefined,
          )}
          onChange={(e) =>
            setData({
              ...data,
              [key]: ["cpf", "rg", "telefone"].includes(key)
                ? e.target.value.replace(/\D/g, "") || null
                : e.target.value || null,
            })
          }
        />
      )}
    </label>
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const payload = Object.fromEntries(
        Object.entries(data)
          .filter(
            ([key]) =>
              ![
                "id",
                "criadoEm",
                "atualizadoEm",
                "vinculos",
                "unidadeId",
                "equipeId",
                "tipo",
                "dataAdmissao",
                "matricula",
                "cargoFuncao",
                "gestor",
                "escala",
                "escalaEstruturada",
                "instituicaoEnsinoId",
                "periodoAcademico",
                "valorBolsa",
                "dataTerminoPrevista",
                "periodicidadeDocumentoMeses",
                "tceStatus",
                "incluirVinculo",
              ].includes(key),
          )
          .map(([key, value]) => [key, value === "" ? null : value]),
      );
      const saved = person?.id
        ? await api<Row>(`pessoas/${person.id}`, "PUT", payload)
        : !data.incluirVinculo
          ? await api<Row>("pessoas", "POST", payload)
          : await api<Row>("pessoas-com-vinculo", "POST", {
              pessoa: payload,
              vinculo: Object.fromEntries(
                [
                  "unidadeId",
                  "equipeId",
                  "tipo",
                  "dataAdmissao",
                  "matricula",
                  "cargoFuncao",
                  "gestor",
                  "escala",
                  "escalaEstruturada",
                ].map((key) => [key, data[key] === "" ? null : data[key]]),
              ),
              ...(data.tipo === "ESTAGIO"
                ? {
                    estagio: {
                      instituicaoEnsinoId: data.instituicaoEnsinoId || null,
                      periodoAcademico: data.periodoAcademico || null,
                      valorBolsa:
                        data.valorBolsa === "" ? null : data.valorBolsa,
                      dataTerminoPrevista:
                        data.dataTerminoPrevista === ""
                          ? null
                          : data.dataTerminoPrevista,
                      periodicidadeDocumentoMeses:
                        data.periodicidadeDocumentoMeses === ""
                          ? undefined
                          : data.periodicidadeDocumentoMeses,
                      tceStatus: data.tceStatus || "AGUARDANDO_ASSINATURA",
                    },
                  }
                : {}),
            });
      onSaved(String(saved.id ?? person?.id ?? ""));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel form-panel">
      <div className="section-heading">
        <h2>{person ? "Editar pessoa" : "Nova pessoa"}</h2>
        <button
          type="button"
          className={modal ? "person-modal-close" : "secondary"}
          aria-label="Fechar"
          onClick={close}
        >
          {modal ? <X size={18} aria-hidden="true" /> : "Fechar"}
        </button>
      </div>
      <Notice text={error} error />
      <form onSubmit={(e) => void submit(e)}>
        <fieldset>
          <legend>Dados pessoais</legend>
          <div className="form-grid">
            {field("nomeCompleto", "Nome completo *")}
            {field("cpf", "CPF")}
            {field("rg", "RG")}
            {field("dataNascimento", "Data de nascimento", "date")}
          </div>
        </fieldset>
        <fieldset>
          <legend>Contato</legend>
          <div className="form-grid">
            {field("email", "E-mail", "email")}
            {field("telefone", "Telefone")}
          </div>
        </fieldset>
        {/* Legacy address fields remain in the data model but are intentionally hidden from this form. */}
        {/* eslint-disable-next-line no-constant-binary-expression */}
        {false && (
          <fieldset>
            <legend>Endereço</legend>
            <div className="form-grid">
              {field("cep", "CEP")}
              {field("logradouro", "Logradouro")}
              {field("numeroEndereco", "Número")}
              {field("complemento", "Complemento")}
              {field("bairro", "Bairro")}
              {field("cidadeEndereco", "Cidade")}
              {field("ufEndereco", "UF")}{" "}
              {Boolean(data.endereco) && (
                <label className="wide">
                  <span>Endereço legado importado</span>
                  <textarea value={String(data.endereco)} readOnly />
                </label>
              )}
            </div>
          </fieldset>
        )}
        {!person && (
          <label className="optional-link">
            <input
              type="checkbox"
              checked={Boolean(data.incluirVinculo)}
              onChange={(e) =>
                setData({ ...data, incluirVinculo: e.target.checked })
              }
            />
            <span>Adicionar vínculo inicial</span>
          </label>
        )}
        {!person && Boolean(data.incluirVinculo) && (
          <fieldset>
            <legend>Vínculo inicial</legend>
            <div className="form-grid">
              <label>
                <span>Unidade *</span>
                <select
                  required
                  value={String(data.unidadeId ?? "")}
                  onChange={(e) =>
                    setData({ ...data, unidadeId: e.target.value })
                  }
                >
                  <option value="">Selecione</option>
                  {options.units.map((row) => (
                    <option key={String(row.id)} value={String(row.id)}>
                      {`${String(row.sigla ?? "").trim() ? `${String(row.sigla).trim()} - ` : ""}${String(row.nome ?? "")}`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Equipe</span>
                <select
                  value={String(data.equipeId ?? "")}
                  onChange={(e) =>
                    setData({ ...data, equipeId: e.target.value || null })
                  }
                >
                  <option value="">Sem equipe</option>
                  {[...options.teams]
                    .sort((a, b) =>
                      display(a).localeCompare(display(b), "pt-BR", {
                        sensitivity: "base",
                      }),
                    )
                    .map((row) => (
                      <option key={String(row.id)} value={String(row.id)}>
                        {display(row)}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                <span>Tipo *</span>
                <select
                  required
                  value={String(data.tipo)}
                  onChange={(e) => setData({ ...data, tipo: e.target.value })}
                >
                  <option value="CLT">CLT</option>
                  <option value="ESTAGIO">Estágio</option>
                  <option value="APRENDIZ">Aprendiz</option>
                  <option value="TRAINEE">Trainee</option>
                </select>
              </label>
              {field("dataAdmissao", "Admissão *", "date")}
              {field("matricula", "Matrícula")}
              {field("cargoFuncao", "Cargo/Função")}
              {field("gestor", "Gestor")}
            </div>
            <StructuredScaleFields
              value={(data.escalaEstruturada as Row | null | undefined) ?? null}
              onChange={(escalaEstruturada) =>
                setData({ ...data, escalaEstruturada })
              }
            />
            {data.tipo === "ESTAGIO" && (
              <div className="form-grid">
                <label>
                  <span>Instituição de ensino</span>
                  <select
                    value={String(data.instituicaoEnsinoId ?? "")}
                    onChange={(e) =>
                      setData({
                        ...data,
                        instituicaoEnsinoId: e.target.value || null,
                      })
                    }
                  >
                    <option value="">Selecione</option>
                    {options.institutions.map((row) => (
                      <option key={String(row.id)} value={String(row.id)}>
                        {`${String(row.sigla ?? "").trim() ? `${String(row.sigla).trim()} - ` : ""}${String(row.nome ?? "")}`}
                      </option>
                    ))}
                  </select>
                </label>
                {field("periodoAcademico", "Período acadêmico")}
                {field("valorBolsa", "Bolsa", "currency")}
                {field(
                  "periodicidadeDocumentoMeses",
                  "Periodicidade do TCE/aditivo (meses)",
                  "number",
                )}
                {field(
                  "dataTerminoPrevista",
                  "Fim previsto do estágio",
                  "date",
                )}
                <label>
                  <span>TCE *</span>
                  <select
                    required
                    value={String(data.tceStatus ?? "AGUARDANDO_ASSINATURA")}
                    onChange={(e) =>
                      setData({ ...data, tceStatus: e.target.value })
                    }
                  >
                    <option value="AGUARDANDO_ASSINATURA">
                      Aguardando assinatura
                    </option>
                    {new Date(String(data.dataAdmissao)).setHours(0, 0, 0, 0) <=
                      new Date().setHours(0, 0, 0, 0) && (
                      <option value="ASSINADO">Assinado</option>
                    )}
                  </select>
                </label>
              </div>
            )}
          </fieldset>
        )}
        <fieldset>
          <legend>Observações</legend>
          <textarea
            value={String(data.observacoes ?? "")}
            onChange={(e) =>
              setData({ ...data, observacoes: e.target.value || null })
            }
          />
        </fieldset>
        <div className="form-actions">
          <button disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button>
          <button type="button" className="secondary" onClick={close}>
            Cancelar
          </button>
        </div>
      </form>
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Descartar alterações?"
        description="As informações preenchidas serão perdidas."
        confirmLabel="Descartar"
        onConfirm={onClose}
      />
    </section>
  );
}

export function PersonEditor({
  id,
  navigate,
}: {
  id?: string;
  navigate: Navigate;
}) {
  const [person, setPerson] = useState<Row | undefined>(),
    [loading, setLoading] = useState(Boolean(id)),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false),
    [confirmBack, setConfirmBack] = useState(false);
  const destination = id ? `/app/pessoas/${id}` : "/app/pessoas";
  useEffect(() => {
    if (!id) return;
    void api<Row>(`pessoas/${id}`)
      .then(setPerson)
      .catch((reason) => setError((reason as Error).message))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);
  if (loading)
    return <LoadingSkeleton variant="detail" label="Carregando pessoa…" />;
  if (error) return <Notice text={error} error />;
  return (
    <>
      <PageHeader
        title={id ? "Editar pessoa" : "Nova pessoa"}
        description="Dados pessoais, contato e endereço."
        breadcrumb={
          <button
            className="link-button"
            onClick={() =>
              dirty ? setConfirmBack(true) : navigate(destination)
            }
          >
            ← Voltar
          </button>
        }
      />
      <PersonForm
        {...(person ? { person } : {})}
        onClose={() => navigate(destination)}
        onSaved={(savedId) =>
          navigate(id && savedId ? `/app/pessoas/${savedId}` : "/app/pessoas")
        }
        onDirtyChange={setDirty}
      />
      <ConfirmDialog
        open={confirmBack}
        onOpenChange={setConfirmBack}
        title="Descartar alterações?"
        description="As informações preenchidas serão perdidas."
        confirmLabel="Descartar"
        onConfirm={() => navigate(destination)}
      />
    </>
  );
}

function TransportSupplierSummary({ items }: { items: Row[] }) {
  if (!items.length)
    return <p className="muted">Transporte não configurado.</p>;
  const suppliers = new Map<string, { name: string; items: Row[] }>();
  for (const item of items) {
    const supplier = item.fornecedor as Row | undefined;
    const name = supplier?.nome
      ? String(supplier.nome)
      : "Fornecedor não informado";
    const key = String(item.fornecedorId ?? name);
    const group = suppliers.get(key) ?? { name, items: [] };
    group.items.push(item);
    suppliers.set(key, group);
  }
  return (
    <section
      className="transport-suppliers"
      aria-label="Fornecedores de transporte"
    >
      <h3>Fornecedores e conduções</h3>
      <div className="transport-supplier-grid">
        {[...suppliers].map(([key, supplier]) => (
          <section className="transport-supplier-card" key={key}>
            <h4>{supplier.name}</h4>
            <ul>
              {supplier.items.map((item) => (
                <li key={String(item.id)}>
                  <span>
                    {conductionLabels[String(item.tipoConducao)] ??
                      display(item.tipoConducao)}
                    {item.ativo === false && (
                      <small className="muted"> · Inativo</small>
                    )}
                  </span>
                  <strong>
                    {money(item.valorDiario)}
                    <small> / dia</small>
                  </strong>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

function ProfileBenefitForm({
  person,
  link,
  record,
  ambiguousLink,
  onClose,
  onSaved,
}: {
  person: Row;
  link: Row | null;
  record: Row | null;
  ambiguousLink: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialType = String(record?.tipo ?? "ALIMENTACAO");
  const [type, setType] = useState(initialType),
    [start, setStart] = useState(
      String(record?.inicioVigencia ?? new Date().toISOString()).slice(0, 10),
    ),
    [end, setEnd] = useState(String(record?.fimVigencia ?? "").slice(0, 10)),
    [status, setStatus] = useState(String(record?.status ?? "ATIVO")),
    [configId, setConfigId] = useState(
      String(record?.configuracaoRecorrenteId ?? ""),
    ),
    [dailyValue, setDailyValue] = useState(String(record?.valorDiario ?? "")),
    [quantity, setQuantity] = useState(
      String(record?.quantidadeRecorrente ?? ""),
    ),
    [unitValue, setUnitValue] = useState(
      String(record?.valorUnitarioRecorrente ?? ""),
    ),
    [notes, setNotes] = useState(String(record?.observacoes ?? "")),
    [configs, setConfigs] = useState<Row[]>([]),
    [transportItems, setTransportItems] = useState<
      Array<{
        id?: string;
        tipoConducao: string;
        fornecedorId: string;
        valorDiario: string;
      }>
    >(
      ((record?.transporteItens as Row[] | undefined) ?? [])
        .filter((item) => item.ativo !== false)
        .map((item) => ({
          ...(item.id ? { id: String(item.id) } : {}),
          tipoConducao: String(item.tipoConducao ?? "ONIBUS"),
          fornecedorId: String(item.fornecedorId ?? ""),
          valorDiario: String(item.valorDiario ?? ""),
        })),
    ),
    [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false),
    [confirmClose, setConfirmClose] = useState(false);
  const unit = link?.unidade as Row | undefined;
  useFormDirty(dirty);
  useEffect(() => {
    if (!link?.unidadeId) return;
    let active = true;
    setLoading(true);
    void api<ListResult>(
      `configuracoes-beneficios?page=1&pageSize=100&unidadeId=${link.unidadeId}&tipo=${type}`,
    )
      .then((result) => {
        if (!active) return;
        const valid = result.items.filter(
          (item) =>
            (item.ativa && (item.fornecedor as Row | undefined)?.ativo) ||
            String(item.id) === String(record?.configuracaoRecorrenteId ?? ""),
        );
        setConfigs(valid);
        setConfigId((current) =>
          valid.some((item) => String(item.id) === current)
            ? current
            : String(valid[0]?.id ?? ""),
        );
        setError("");
      })
      .catch((reason) => active && setError((reason as Error).message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [link?.unidadeId, type]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!link || ambiguousLink) return;
    setSaving(true);
    setError("");
    try {
      const benefit = {
        vinculoId: link.id,
        tipo: type,
        inicioVigencia: start,
        fimVigencia: end || null,
        status,
        configuracaoRecorrenteId:
          type === "TRANSPORTE" ? null : configId || null,
        valorDiario: type === "ALIMENTACAO" ? dailyValue || null : null,
        quantidadeRecorrente: ["ALIMENTACAO", "TRANSPORTE"].includes(type)
          ? null
          : quantity || null,
        valorUnitarioRecorrente: ["ALIMENTACAO", "TRANSPORTE"].includes(type)
          ? null
          : unitValue || null,
        observacoes: notes || null,
      };
      if (type === "TRANSPORTE")
        await api(
          `configuracoes-transporte${record ? `/${record.id}` : ""}`,
          record ? "PUT" : "POST",
          {
            beneficio: benefit,
            items: transportItems.map((item) => ({
              ...(record && item.id ? { id: item.id } : {}),
              tipoConducao: item.tipoConducao,
              fornecedorId: item.fornecedorId,
              valorDiario: item.valorDiario,
              inicioVigencia: start,
              fimVigencia: end || null,
              ativo: status === "ATIVO",
            })),
          },
        );
      else
        await api(
          `beneficios-vinculo${record ? `/${record.id}` : ""}`,
          record ? "PUT" : "POST",
          benefit,
        );
      onSaved();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }
  if (!link || ambiguousLink)
    return (
      <Notice
        error
        text="Não foi possível identificar um único vínculo ativo. Revise os vínculos da pessoa antes de adicionar o benefício."
      />
    );
  const typeOptions = [
    "TRANSPORTE",
    "ALIMENTACAO",
    "CESTA_BASICA",
    "PREMIACAO",
    "OUTRO",
  ];
  return (
    <>
      <form className="embedded-form" onSubmit={(event) => void submit(event)}>
        <Notice text={error} error />
        <div className="form-context-card">
          <span>Pessoa</span>
          <strong>{String(person.nomeCompleto)}</strong>
          <small>{display(unit)}</small>
        </div>
        <div className="form-grid">
          <label>
            <span>Tipo *</span>
            <select
              value={type}
              disabled={Boolean(record)}
              onChange={(event) => {
                setType(event.target.value);
                setDirty(true);
              }}
            >
              {typeOptions.map((value) => (
                <option key={value} value={value}>
                  {benefitLabels[value]}
                </option>
              ))}
            </select>
          </label>
          {type !== "TRANSPORTE" && (
            <label>
              <span>Fornecedor recorrente *</span>
              <select
                value={configId}
                required
                disabled={loading || !configs.length}
                onChange={(event) => {
                  setConfigId(event.target.value);
                  setDirty(true);
                }}
              >
                <option value="">Selecione…</option>
                {configs.map((config) => (
                  <option key={String(config.id)} value={String(config.id)}>
                    {display(config.fornecedor)}
                    {!config.ativa ||
                    !(config.fornecedor as Row | undefined)?.ativo
                      ? " (inativo)"
                      : ""}
                  </option>
                ))}
              </select>
              {!loading && !configs.length && (
                <small className="field-error">
                  Não há fornecedor ativo configurado para {display(unit)} e{" "}
                  {benefitLabels[type]?.toLowerCase()}.
                </small>
              )}
            </label>
          )}
          <label>
            <span>Início da vigência *</span>
            <input
              type="date"
              required
              value={start}
              onChange={(event) => {
                setStart(event.target.value);
                setDirty(true);
              }}
            />
          </label>
          <label>
            <span>Fim da vigência</span>
            <input
              type="date"
              value={end}
              onChange={(event) => {
                setEnd(event.target.value);
                setDirty(true);
              }}
            />
          </label>
          <label>
            <span>Status</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setDirty(true);
              }}
            >
              <option value="ATIVO">Ativo</option>
              <option value="ENCERRADO">Encerrado</option>
            </select>
          </label>
          {type === "ALIMENTACAO" && (
            <label>
              <span>Valor diário</span>
              <CurrencyInput
                value={dailyValue}
                onValueChange={(value) => {
                  setDailyValue(value);
                  setDirty(true);
                }}
              />
            </label>
          )}
          {!["ALIMENTACAO", "TRANSPORTE"].includes(type) && (
            <>
              <label>
                <span>Quantidade recorrente</span>
                <input
                  inputMode="decimal"
                  value={quantity}
                  onChange={(event) => {
                    setQuantity(event.target.value);
                    setDirty(true);
                  }}
                />
              </label>
              <label>
                <span>Valor unitário recorrente</span>
                <CurrencyInput
                  value={unitValue}
                  onValueChange={(value) => {
                    setUnitValue(value);
                    setDirty(true);
                  }}
                />
              </label>
            </>
          )}
          {type === "TRANSPORTE" && (
            <div className="wide transport-editor">
              <div>
                <strong>Transportes recorrentes</strong>
                <p className="muted">
                  O fornecedor realiza a compra e recebe a solicitação de
                  crédito.
                </p>
              </div>
              {transportItems.map((item, index) => (
                <div className="transport-editor-row" key={item.id ?? index}>
                  <label>
                    <span>Condução *</span>
                    <select
                      value={item.tipoConducao}
                      onChange={(event) => {
                        setTransportItems((all) =>
                          all.map((current, itemIndex) =>
                            itemIndex === index
                              ? { ...current, tipoConducao: event.target.value }
                              : current,
                          ),
                        );
                        setDirty(true);
                      }}
                    >
                      <option value="ONIBUS">Ônibus</option>
                      <option value="ONIBUS_INTER">
                        Ônibus Intermunicipal
                      </option>
                      <option value="BARCA">Barca</option>
                      <option value="METRO">Metrô</option>
                      <option value="TREM">Trem</option>
                    </select>
                  </label>
                  <label>
                    <span>Fornecedor *</span>
                    <select
                      required
                      value={item.fornecedorId}
                      onChange={(event) => {
                        setTransportItems((all) =>
                          all.map((current, itemIndex) =>
                            itemIndex === index
                              ? { ...current, fornecedorId: event.target.value }
                              : current,
                          ),
                        );
                        setDirty(true);
                      }}
                    >
                      <option value="">Selecione…</option>
                      {configs.map((config) => (
                        <option
                          key={String(config.fornecedorId)}
                          value={String(config.fornecedorId)}
                        >
                          {display(config.fornecedor)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Valor diário *</span>
                    <CurrencyInput
                      required
                      value={item.valorDiario}
                      onValueChange={(value) => {
                        setTransportItems((all) =>
                          all.map((current, itemIndex) =>
                            itemIndex === index
                              ? { ...current, valorDiario: value }
                              : current,
                          ),
                        );
                        setDirty(true);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setTransportItems((all) =>
                        all.filter((_, itemIndex) => itemIndex !== index),
                      );
                      setDirty(true);
                    }}
                  >
                    Remover
                  </button>
                </div>
              ))}
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setTransportItems((all) => [
                      ...all,
                      {
                        tipoConducao: "ONIBUS",
                        fornecedorId: "",
                        valorDiario: "",
                      },
                    ]);
                    setDirty(true);
                  }}
                >
                  + Adicionar transporte
                </button>
                <strong>
                  Total diário:{" "}
                  {money(
                    transportItems.reduce(
                      (sum, item) => sum + decimalInputValue(item.valorDiario),
                      0,
                    ),
                  )}
                </strong>
              </div>
            </div>
          )}
          <label className="wide">
            <span>Observações</span>
            <textarea
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                setDirty(true);
              }}
            />
          </label>
        </div>
        <div className="form-actions">
          <button
            disabled={
              saving ||
              loading ||
              !configs.length ||
              (type === "TRANSPORTE" && !transportItems.length)
            }
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => (dirty ? setConfirmClose(true) : onClose())}
          >
            Cancelar
          </button>
        </div>
      </form>
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Descartar alterações?"
        description="As informações preenchidas serão perdidas."
        confirmLabel="Descartar"
        onConfirm={onClose}
      />
    </>
  );
}

function CompetenceEditor({
  competence,
  onClose,
  onSaved,
}: {
  competence: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const benefit = competence.beneficioVinculo as Row;
  const type = String(benefit.tipo);
  const [days, setDays] = useState(String(competence.quantidadeDias ?? "")),
    [quantity, setQuantity] = useState(String(competence.quantidade ?? "")),
    [unitValue, setUnitValue] = useState(
      String(competence.valorUnitario ?? ""),
    ),
    [notes, setNotes] = useState(String(competence.observacoes ?? "")),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({}),
    [confirmClose, setConfirmClose] = useState(false);
  const dirty =
    days !== String(competence.quantidadeDias ?? "") ||
    quantity !== String(competence.quantidade ?? "") ||
    unitValue !== String(competence.valorUnitario ?? "") ||
    notes !== String(competence.observacoes ?? "");
  useFormDirty(dirty);
  async function submit(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    setFieldErrors({});
    try {
      await api(`competencias/${competence.id}`, "PUT", {
        beneficioVinculoId: competence.beneficioVinculoId,
        configuracaoId: competence.configuracaoId,
        componente: competence.componente,
        competencia: String(competence.competencia).slice(0, 10),
        quantidadeDias: ["ALIMENTACAO", "TRANSPORTE"].includes(type)
          ? days || null
          : null,
        quantidade: ["ALIMENTACAO", "TRANSPORTE"].includes(type)
          ? null
          : quantity || null,
        valorUnitario: type === "TRANSPORTE" ? null : unitValue || null,
        valorInformado: competence.valorInformado ?? null,
        status: competence.status,
        observacoes: notes || null,
      });
      onSaved();
    } catch (reason) {
      setError((reason as Error).message);
      if (reason instanceof ApiError) setFieldErrors(reason.fields);
    } finally {
      setSaving(false);
    }
  }
  return (
    <>
      <form className="embedded-form" onSubmit={(event) => void submit(event)}>
        <Notice text={error} error />
        <div className="form-context-card">
          <span>{benefitLabels[type] ?? type}</span>
          <strong>{display((benefit.vinculo as Row)?.pessoa)}</strong>
          <small>Competência {formatDate(competence.competencia)}</small>
        </div>
        <div className="form-grid">
          {["ALIMENTACAO", "TRANSPORTE"].includes(type) ? (
            <label>
              <span>Dias *</span>
              <input
                inputMode="decimal"
                required
                value={days}
                onChange={(event) => setDays(event.target.value)}
              />
              {fieldErrors.quantidadeDias?.map((message) => (
                <small className="field-error" key={message}>
                  {message}
                </small>
              ))}
            </label>
          ) : (
            <label>
              <span>Quantidade *</span>
              <input
                inputMode="decimal"
                required
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
              {fieldErrors.quantidade?.map((message) => (
                <small className="field-error" key={message}>
                  {message}
                </small>
              ))}
            </label>
          )}
          {type !== "TRANSPORTE" && (
            <label>
              <span>
                {type === "ALIMENTACAO" ? "Valor diário" : "Valor unitário"} *
              </span>
              <input
                inputMode="decimal"
                required
                value={unitValue}
                onChange={(event) => setUnitValue(event.target.value)}
              />
              {fieldErrors.valorUnitario?.map((message) => (
                <small className="field-error" key={message}>
                  {message}
                </small>
              ))}
            </label>
          )}
          <label className="wide">
            <span>Observações</span>
            <textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
        </div>
        <p className="muted">
          Ao salvar uma competência conferida, ela voltará para Pendente e
          deverá ser conferida novamente.
        </p>
        <div className="form-actions">
          <button disabled={saving}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => (dirty ? setConfirmClose(true) : onClose())}
          >
            Cancelar
          </button>
        </div>
      </form>
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Descartar alterações?"
        description="As informações preenchidas serão perdidas."
        confirmLabel="Descartar"
        onConfirm={onClose}
      />
    </>
  );
}

export function PersonProfile({
  id,
  navigate,
}: {
  id: string;
  navigate: Navigate;
}) {
  const [profile, setProfile] = useState<Row | null>(null),
    [tab, setTab] = useState(
      () => new URLSearchParams(location.search).get("tab") ?? "visao",
    ),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [formScreen, setFormScreen] = useState<string | null>(null),
    [editingLink, setEditingLink] = useState<Row | null>(null),
    [editingBenefit, setEditingBenefit] = useState<Row | null>(null),
    [endingBenefit, setEndingBenefit] = useState<Row | null>(null),
    [benefitEndDate, setBenefitEndDate] = useState(""),
    [benefitEndReason, setBenefitEndReason] = useState(""),
    [editingDocument, setEditingDocument] = useState<Row | null>(null),
    [reversingDistrato, setReversingDistrato] = useState<Row | null>(null),
    [reversalReason, setReversalReason] = useState(""),
    [benefitMonth, setBenefitMonth] = useState(
      () =>
        new URLSearchParams(location.search).get("competencia")?.slice(0, 7) ??
        new Date().toISOString().slice(0, 7),
    ),
    [version, setVersion] = useState(0);
  const options = useOptions();
  useEffect(() => {
    setLoading(true);
    void api<Row>(`pessoas/${id}/perfil`)
      .then((result) => {
        setProfile(result);
        setError("");
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id, version]);
  useEffect(() => {
    const query = new URLSearchParams(location.search);
    query.set("tab", tab);
    if (tab === "beneficios") query.set("competencia", `${benefitMonth}-01`);
    else query.delete("competencia");
    history.replaceState({}, "", `${location.pathname}?${query.toString()}`);
  }, [tab, benefitMonth]);
  if (error && !profile) return <Notice text={error} error />;
  if (!profile)
    return <LoadingSkeleton variant="detail" label="Carregando perfil…" />;
  const person = profile.pessoa as Row,
    current = profile.vinculoAtual as Row | null,
    links = person.vinculos as Row[],
    balances = profile.saldos as Record<string, Row>,
    alerts = profile.alertas as Row[];
  const tabs: Array<[string, string]> = [
    ["visao", "Visão geral"],
    ["vinculo", "Vínculo"],
    ["descanso", current?.tipo === "ESTAGIO" ? "Descanso" : "Férias"],
    ["beneficios", "Benefícios"],
    ["documentos", "Documentos"],
    ["historico", "Histórico"],
  ];
  const ProfileOverlay =
    formScreen === "beneficios-vinculo" ? FormDialog : FormSheet;
  return (
    <RefreshingContent refreshing={loading}>
      <div className="golden-profile">
        <Notice text={error} error />
        <div className="profile-identity">
          <div className="person-avatar" aria-hidden="true">
            {String(person.nomeCompleto)
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((name) => name[0])
              .join("")}
          </div>
          <PageHeader
            title={String(person.nomeCompleto)}
            description={`${current?.tipo === "ESTAGIO" ? "Estagiário(a)" : current?.tipo === "APRENDIZ" ? "Aprendiz" : current?.tipo === "TRAINEE" ? "Trainee" : (current?.tipo ?? "Sem vínculo")} · ${display(current?.unidade)}`}
            breadcrumb={
              <button
                className="link-button"
                onClick={() => {
                  const stored = sessionStorage.getItem("duali.people.return");
                  if (stored)
                    navigate((JSON.parse(stored) as { url: string }).url);
                  else navigate("/app/pessoas");
                }}
              >
                ← Pessoas
              </button>
            }
            action={
              <div className="form-actions">
                <button onClick={() => navigate(`/app/pessoas/${id}/editar`)}>
                  Editar pessoa
                </button>
              </div>
            }
          />
        </div>
        {Boolean(profile.multiplosVinculosAtivos) && (
          <Notice
            text="Mais de um vínculo ativo encontrado. Revise esta situação."
            error
          />
        )}
        <ProfileOverlay
          className={
            formScreen === "beneficios-vinculo" ? "benefit-dialog" : undefined
          }
          open={Boolean(formScreen)}
          onOpenChange={(open) => {
            if (!open) setFormScreen(null);
          }}
          title={
            screens.find((screen) => screen.path === formScreen)?.title ??
            "Novo registro"
          }
          description="Preencha os dados desta operação."
        >
          {formScreen && editingDocument ? (
            <RecordForm
              embedded
              screen={screens.find((screen) => screen.path === "documentos")!}
              record={editingDocument}
              defaults={{ vinculoId: editingDocument.vinculoId }}
              onClose={() => {
                setFormScreen(null);
                setEditingDocument(null);
              }}
              onSaved={() => {
                setFormScreen(null);
                setEditingDocument(null);
                setVersion(version + 1);
              }}
            />
          ) : formScreen === "beneficios-vinculo" ? (
            <ProfileBenefitForm
              person={person}
              link={current}
              record={editingBenefit}
              ambiguousLink={Boolean(profile.multiplosVinculosAtivos)}
              onClose={() => {
                setFormScreen(null);
                setEditingBenefit(null);
              }}
              onSaved={() => {
                setFormScreen(null);
                setEditingBenefit(null);
                setVersion(version + 1);
              }}
            />
          ) : formScreen && editingLink ? (
            <LinkEditorForm
              link={editingLink}
              options={options}
              onClose={() => {
                setFormScreen(null);
                setEditingLink(null);
                setEditingBenefit(null);
              }}
              onSaved={() => {
                setFormScreen(null);
                setEditingLink(null);
                setEditingBenefit(null);
                setVersion(version + 1);
              }}
            />
          ) : formScreen ? (
            <RecordForm
              embedded
              screen={screens.find((screen) => screen.path === formScreen)!}
              record={editingLink ?? null}
              defaults={{ pessoaId: id, vinculoId: current?.id }}
              onClose={() => {
                setFormScreen(null);
                setEditingLink(null);
              }}
              onSaved={() => {
                setFormScreen(null);
                setEditingLink(null);
                setVersion(version + 1);
              }}
            />
          ) : null}
        </ProfileOverlay>
        <FormDialog
          open={Boolean(endingBenefit)}
          onOpenChange={(open) => {
            if (!open) {
              setEndingBenefit(null);
              setBenefitEndDate("");
              setBenefitEndReason("");
            }
          }}
          title="Encerrar benefício"
          description="A adesão será encerrada, mas competências e histórico continuarão disponíveis."
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!endingBenefit || !benefitEndDate || !benefitEndReason.trim())
                return;
              void api(
                `beneficios-vinculo/${endingBenefit.id}/encerrar`,
                "POST",
                {
                  fimVigencia: benefitEndDate,
                  motivo: benefitEndReason.trim(),
                },
              )
                .then(() => {
                  setEndingBenefit(null);
                  setBenefitEndDate("");
                  setBenefitEndReason("");
                  setVersion((current) => current + 1);
                })
                .catch((cause) => setError((cause as Error).message));
            }}
          >
            <label>
              <span>Data de encerramento</span>
              <input
                type="date"
                required
                value={benefitEndDate}
                onChange={(event) => setBenefitEndDate(event.target.value)}
              />
            </label>
            <label>
              <span>Motivo</span>
              <textarea
                required
                minLength={3}
                value={benefitEndReason}
                onChange={(event) => setBenefitEndReason(event.target.value)}
              />
            </label>
            <div className="form-actions">
              <button type="submit" className="danger">
                Encerrar benefício
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => setEndingBenefit(null)}
              >
                Cancelar
              </button>
            </div>
          </form>
        </FormDialog>
        <FormDialog
          open={Boolean(reversingDistrato)}
          onOpenChange={(open) => {
            if (!open) {
              setReversingDistrato(null);
              setReversalReason("");
            }
          }}
          title="Reverter distrato"
          description="O vínculo voltará para ativo e a data de desligamento será removida."
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!reversingDistrato || !reversalReason.trim()) return;
              void api(
                `documentos/${reversingDistrato.id}/reverter-distrato`,
                "POST",
                { motivo: reversalReason.trim() },
              )
                .then(() => {
                  setReversingDistrato(null);
                  setReversalReason("");
                  setVersion((current) => current + 1);
                })
                .catch((cause) => setError((cause as Error).message));
            }}
          >
            <label>
              <span>Motivo da reversão</span>
              <textarea
                required
                minLength={3}
                value={reversalReason}
                onChange={(event) => setReversalReason(event.target.value)}
              />
            </label>
            <div className="form-actions">
              <button type="submit">Confirmar reversão</button>
              <button
                type="button"
                className="secondary"
                onClick={() => setReversingDistrato(null)}
              >
                Cancelar
              </button>
            </div>
          </form>
        </FormDialog>
        <div className="tabs" role="tablist">
          {tabs.map(([key, label]) => (
            <button
              role="tab"
              aria-selected={tab === key}
              className={tab === key ? "active" : "secondary"}
              key={key}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab !== "visao" && tab !== "historico" && (
          <div className="context-actions">
            {tab === "vinculo" && (
              <button onClick={() => setFormScreen("vinculos")}>
                Adicionar vínculo
              </button>
            )}
            {tab === "descanso" && (
              <button onClick={() => setFormScreen("periodos")}>
                Programar descanso
              </button>
            )}
            {tab === "documentos" && (
              <>
                <button onClick={() => setFormScreen("documentos")}>
                  Adicionar documento
                </button>
                <button
                  className="secondary"
                  onClick={() => setFormScreen("seguros")}
                >
                  Adicionar seguro
                </button>
              </>
            )}
          </div>
        )}
        {tab === "visao" && (
          <div className="profile-grid">
            <InfoCard
              title="Dados pessoais"
              rows={[
                ["CPF", maskCpf(person.cpf)],
                ["Nascimento", formatDate(person.dataNascimento)],
                ["Telefone", maskPhone(person.telefone)],
                ["E-mail", display(person.email)],
              ]}
            />
            <InfoCard
              title="Vínculo atual"
              rows={[
                ["Tipo", display(current?.tipo)],
                ["Unidade", display(current?.unidade)],
                ["Equipe", display(current?.equipe)],
                ["Admissão", formatDate(current?.dataAdmissao)],
                ["Status", <StatusBadge value={current?.status} />],
              ]}
            />
            <InfoCard
              title="Situação"
              rows={[
                [
                  "Saldo disponível",
                  current
                    ? `${balances[String(current.id)]?.saldo ?? 0} dias`
                    : "—",
                ],
                [
                  "Categorias solicitadas no mês",
                  String(
                    (current?.beneficios as Row[] | undefined)?.filter((b) =>
                      ((b.competencias as Row[] | undefined) ?? []).some(
                        (c) =>
                          String(c.competencia).slice(0, 7) === benefitMonth,
                      ),
                    ).length ?? 0,
                  ),
                ],
                [
                  "Término previsto",
                  formatDate(
                    (current?.estagio as Row | undefined)?.dataTerminoPrevista,
                  ),
                ],
              ]}
            />
            <InfoCard
              title="Documento atual"
              rows={(() => {
                const cycle = current?.cicloDocumental as Row | undefined;
                const document = cycle?.atual as Row | undefined;
                const next = cycle?.proximo as Row | undefined;
                return [
                  [
                    "Atual",
                    document
                      ? `${documentLabels[String(document.tipo)] ?? display(document.tipo)} · ${display(document.estadoOperacional)}`
                      : "Nenhum em vigência",
                  ],
                  [
                    "Vigência",
                    document
                      ? `${formatDate(document.inicioVigencia)} até ${formatDate(document.fimVigencia)}`
                      : next
                        ? `Próximo: ${formatDate(next.inicioVigencia)}`
                        : "—",
                  ],
                ] as [string, ReactNode][];
              })()}
            />
            <section className="panel">
              <h2>Alertas</h2>
              {alerts.length ? (
                alerts.map((alert, index) => (
                  <div className="alert-row" key={index}>
                    <StatusBadge value={alert.tipo} />
                    <span>{String(alert.mensagem)}</span>
                  </div>
                ))
              ) : (
                <EmptyState
                  title="Nenhuma pendência"
                  description="Tudo certo por aqui."
                />
              )}
            </section>
          </div>
        )}
        {tab === "vinculo" && (
          <>
            <div className="stack">
              {links.map((link) => (
                <section className="panel" key={String(link.id)}>
                  <div className="section-heading">
                    <h2>
                      {String(link.tipo)} · {display(link.unidade)}
                    </h2>
                    <button
                      className="secondary"
                      onClick={() => {
                        setEditingLink(link);
                        setFormScreen("vinculos");
                      }}
                    >
                      Editar vínculo
                    </button>
                  </div>
                  <p>
                    {String(link.status)} · {display(link.equipe)} ·{" "}
                    {formatDate(link.dataAdmissao)}
                  </p>
                </section>
              ))}
            </div>
            {/* eslint-disable-next-line no-constant-binary-expression */}
            {false && (
              <Timeline
                items={links.map((link) => ({
                  date: link.dataAdmissao,
                  title: `${link.tipo} · ${display(link.unidade)}`,
                  detail: `${link.status} · ${display(link.equipe)}`,
                }))}
              />
            )}
          </>
        )}
        {tab === "descanso" && (
          <div className="stack">
            {links.map((link) => (
              <section className="panel" key={String(link.id)}>
                <h2>
                  {String(link.tipo)} · {formatDate(link.dataAdmissao)}
                </h2>
                <div className="metrics">
                  <MetricCard
                    label="Adquiridos"
                    value={String(balances[String(link.id)]?.adquiridos ?? 0)}
                  />
                  <MetricCard
                    label="Utilizados"
                    value={String(balances[String(link.id)]?.consumidos ?? 0)}
                  />
                  <MetricCard
                    label="Programados"
                    value={String(balances[String(link.id)]?.programados ?? 0)}
                  />
                  <MetricCard
                    label="Saldo"
                    value={String(balances[String(link.id)]?.saldo ?? 0)}
                  />
                </div>
                <Timeline
                  items={[
                    ...(link.direitos as Row[]),
                    ...(link.periodos as Row[]),
                    ...(link.ajustes as Row[]),
                  ].map((item) => ({
                    date:
                      item.dataAquisicao ?? item.dataInicio ?? item.criadoEm,
                    title: item.quantidadeDias
                      ? `${item.quantidadeDias} dias`
                      : String(item.tipo),
                    detail: String(
                      item.origem ?? item.status ?? item.motivo ?? "",
                    ),
                  }))}
                />
              </section>
            ))}
          </div>
        )}
        {tab === "beneficios" && (
          <div className="stack">
            <section className="panel benefit-month-filter">
              <label>
                <span>Competência exibida</span>
                <input
                  type="month"
                  value={benefitMonth}
                  onChange={(event) => setBenefitMonth(event.target.value)}
                />
              </label>
            </section>
            {[...links]
              .sort(
                (a, b) =>
                  Number(b.id === current?.id) - Number(a.id === current?.id),
              )
              .flatMap((link) =>
                [...((link.beneficios as Row[] | undefined) ?? [])]
                  .filter((benefit) =>
                    ((benefit.competencias as Row[] | undefined) ?? []).some(
                      (item) =>
                        String(item.competencia).slice(0, 7) === benefitMonth,
                    ),
                  )
                  .sort(
                    (a, b) =>
                      Number(b.status === "ATIVO") -
                      Number(a.status === "ATIVO"),
                  )
                  .map((benefit) => {
                    const competencies =
                      (benefit.competencias as Row[] | undefined) ?? [];
                    const competence = competencies.find(
                      (item) =>
                        String(item.competencia).slice(0, 7) === benefitMonth,
                    );
                    const config = competence?.configuracao as Row | undefined;
                    return (
                      <details
                        className="panel benefit-profile-card"
                        key={String(benefit.id)}
                        open={
                          link.id === current?.id && benefit.status === "ATIVO"
                        }
                      >
                        <summary>
                          Competência mensal ·{" "}
                          {benefitLabels[String(benefit.tipo)] ??
                            String(benefit.tipo)}{" "}
                          · {display(link.unidade)}
                        </summary>
                        <section>
                          <div className="section-heading">
                            <div>
                              <h2>
                                {benefitLabels[String(benefit.tipo)] ??
                                  String(benefit.tipo)}
                              </h2>
                              <p>
                                {benefit.tipo !== "TRANSPORTE" && (
                                  <>{display(config?.fornecedor)} · </>
                                )}
                                {benefitMonth.split("-").reverse().join("/")}
                              </p>
                            </div>
                          </div>
                          <dl className="benefit-compact-grid">
                            {benefit.tipo !== "TRANSPORTE" && (
                              <div>
                                <dt>Fornecedor</dt>
                                <dd>{display(config?.fornecedor)}</dd>
                              </div>
                            )}
                            <div>
                              <dt>Competência</dt>
                              <dd>
                                {benefitMonth.split("-").reverse().join("/")}
                              </dd>
                            </div>
                            {benefit.tipo === "ALIMENTACAO" && (
                              <div>
                                <dt>Valor diário</dt>
                                <dd>{money(competence?.valorUnitario)}</dd>
                              </div>
                            )}
                            <div>
                              <dt>Dias</dt>
                              <dd>
                                {competence?.quantidadeDias == null
                                  ? "Não informado"
                                  : display(competence.quantidadeDias)}
                              </dd>
                            </div>
                            <div>
                              <dt>Valor total</dt>
                              <dd>
                                {competence
                                  ? money(competence.valorFinal)
                                  : "Não informado"}
                              </dd>
                            </div>
                            <div>
                              <dt>Situação</dt>
                              <dd>
                                {competence ? (
                                  <StatusBadge value={competence.status} />
                                ) : (
                                  "Mês não preparado"
                                )}
                              </dd>
                            </div>
                          </dl>
                          <div className="info-list">
                            {!["ALIMENTACAO", "TRANSPORTE"].includes(
                              String(benefit.tipo),
                            ) && (
                              <p>
                                Quantidade: {display(competence?.quantidade)} ·
                                Valor unitário:{" "}
                                {money(competence?.valorUnitario)}
                              </p>
                            )}
                            {benefit.tipo === "TRANSPORTE" && (
                              <TransportSupplierSummary
                                items={
                                  (competence?.transporteItens as
                                    | Row[]
                                    | undefined) ?? []
                                }
                              />
                            )}
                            {(
                              (competence?.aquisicaoItens as
                                | Row[]
                                | undefined) ?? []
                            ).map((item) => (
                              <p key={String(item.id)}>
                                Pedido:{" "}
                                {display(
                                  (
                                    (item.aquisicao as Row | undefined)
                                      ?.fornecedor as Row | undefined
                                  )?.nome,
                                )}{" "}
                                · Solicitado:{" "}
                                {money(
                                  item.valorSolicitado ?? item.valorReservado,
                                )}{" "}
                                ·
                                <StatusBadge value={item.status} />
                              </p>
                            ))}
                          </div>
                          <button
                            className="link-button benefit-history-link"
                            onClick={() =>
                              navigate(
                                `/app/beneficios/competencias?competencia=${benefitMonth}-01&unidadeId=${link.unidadeId}&tipo=${benefit.tipo}`,
                              )
                            }
                          >
                            Ver histórico
                          </button>
                        </section>
                      </details>
                    );
                  }),
              )}
            {!links.some((link) =>
              ((link.beneficios as Row[] | undefined) ?? []).some((benefit) =>
                ((benefit.competencias as Row[] | undefined) ?? []).some(
                  (item) =>
                    String(item.competencia).slice(0, 7) === benefitMonth,
                ),
              ),
            ) && (
              <EmptyState
                title="Nenhuma competência de benefício"
                description="Os pedidos mensais desta pessoa aparecerão aqui após a emissão."
              />
            )}
          </div>
        )}
        {tab === "documentos" && (
          <div className="profile-grid">
            {links.map((link) => (
              <section className="panel" key={String(link.id)}>
                <h2>Documentos e seguro · {String(link.tipo)}</h2>
                {(link.documentos as Row[]).map((item) => {
                  const statusLabels: Record<string, string> = {
                    PLANEJADO: "Planejado",
                    AGUARDANDO_ASSINATURA: "Aguardando assinatura",
                    ASSINADO: "Assinado",
                    VENCIDO: "Vencido",
                    CANCELADO: "Cancelado",
                    VIGENCIA_INCOMPLETA: "Vigência incompleta",
                  };
                  const status =
                    statusLabels[String(item.estadoOperacional)] ??
                    String(item.status);
                  return (
                    <div className="section-heading" key={String(item.id)}>
                      <div>
                        <strong>
                          {documentLabels[String(item.tipo)] ??
                            String(item.tipo)}
                        </strong>
                        <p>{status}</p>
                        <p>
                          Início: {formatDate(item.inicioVigencia)} · Fim:{" "}
                          {formatDate(item.fimVigencia)}
                        </p>
                      </div>
                      <button
                        className="secondary"
                        onClick={() => {
                          setEditingDocument(item);
                          setFormScreen("documentos");
                        }}
                      >
                        Editar documento
                      </button>
                      {item.tipo === "DISTRATO" &&
                        item.status !== "CANCELADO" && (
                          <button
                            className="secondary"
                            onClick={() => setReversingDistrato(item)}
                          >
                            Reverter distrato
                          </button>
                        )}
                    </div>
                  );
                })}
                <Timeline
                  items={(link.seguros as Row[]).map((insurance) => ({
                    date: insurance.inicioVigencia,
                    title: `Seguro ? ${insurance.seguradora}`,
                    detail: String(insurance.status),
                  }))}
                />
              </section>
            ))}
          </div>
        )}
        {tab === "historico" && (
          <Timeline
            items={(profile.historico as Row[]).map((item) => ({
              date: item.criadoEm,
              title: `${({ CRIAR: "Cadastro criado", ALTERAR: "Dados atualizados", CANCELAR: "Registro cancelado", CANCELAR_DISTRATO: "Distrato revertido", REATIVAR_POR_REVERSAO_DISTRATO: "Vínculo reativado" } as Record<string, string>)[String(item.acao)] ?? String(item.acao).replaceAll("_", " ")} · ${({ pessoa: "Pessoa", vinculo: "Vínculo", estagio: "Estágio", documentoVinculo: "Documento", beneficioVinculo: "Benefício", beneficioCompetencia: "Competência" } as Record<string, string>)[String(item.entidade)] ?? String(item.entidade)}`,
              detail: `Por ${display(item.usuario)}`,
            }))}
          />
        )}
      </div>
    </RefreshingContent>
  );
}
function LinkEditorForm({
  link,
  options,
  onClose,
  onSaved,
}: {
  link: Row;
  options: ReturnType<typeof useOptions>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const stage = (link.estagio as Row | undefined) ?? {};
  const [data, setData] = useState<Row>({
    ...link,
    dataAdmissao: String(link.dataAdmissao ?? "").slice(0, 10),
    dataDesligamento: String(link.dataDesligamento ?? "").slice(0, 10),
    instituicaoEnsinoId: stage.instituicaoEnsinoId ?? "",
    periodoAcademico: stage.periodoAcademico ?? "",
    valorBolsa: stage.valorBolsa ?? "",
    dataTerminoPrevista: String(stage.dataTerminoPrevista ?? "").slice(0, 10),
    escalaEstruturada: link.tipoEscala
      ? {
          tipo: link.tipoEscala,
          ...(link.tipoEscala === "DIAS_SEMANA"
            ? { diasSemana: link.diasSemana ?? [] }
            : { quantidadeDiasSemana: link.quantidadeDiasSemana ?? 1 }),
        }
      : null,
  });
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const initial = useMemo(() => JSON.stringify(data), []);
  const dirty = JSON.stringify(data) !== initial;
  useFormDirty(dirty);
  const set = (key: string, value: unknown) =>
    setData({ ...data, [key]: value });
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`vinculos/${link.id}/detalhes`, "PUT", {
        vinculo: {
          pessoaId: link.pessoaId,
          unidadeId: data.unidadeId,
          equipeId: data.equipeId || null,
          tipo: link.tipo,
          status: data.status,
          matricula: data.matricula || null,
          dataAdmissao: data.dataAdmissao,
          dataDesligamento:
            data.status === "DESLIGADO" ? data.dataDesligamento || null : null,
          cargoFuncao: data.cargoFuncao || null,
          gestor: data.gestor || null,
          escala: data.escala || null,
          escalaEstruturada: data.escalaEstruturada ?? null,
          observacoes: data.observacoes || null,
        },
        ...(link.tipo === "ESTAGIO"
          ? {
              estagio: {
                instituicaoEnsinoId: data.instituicaoEnsinoId || null,
                periodoAcademico: data.periodoAcademico || null,
                valorBolsa: data.valorBolsa || null,
                dataTerminoPrevista: data.dataTerminoPrevista || null,
              },
            }
          : {}),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-panel embedded-form">
      <Notice text={error} error />
      <form onSubmit={(e) => void submit(e)}>
        <fieldset>
          <legend>Dados do vínculo</legend>
          <div className="form-grid">
            <label>
              <span>Unidade</span>
              <select
                required
                value={String(data.unidadeId ?? "")}
                onChange={(e) => set("unidadeId", e.target.value)}
              >
                {options.units.map((row) => (
                  <option key={String(row.id)} value={String(row.id)}>
                    {`${String(row.sigla ?? "").trim() ? `${String(row.sigla).trim()} - ` : ""}${String(row.nome ?? "")}`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Equipe</span>
              <select
                value={String(data.equipeId ?? "")}
                onChange={(e) => set("equipeId", e.target.value || null)}
              >
                <option value="">Sem equipe</option>
                {options.teams.map((row) => (
                  <option key={String(row.id)} value={String(row.id)}>
                    {`${String(row.sigla ?? "").trim() ? `${String(row.sigla).trim()} - ` : ""}${String(row.nome ?? "")}`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Tipo</span>
              <input value={String(link.tipo)} readOnly />
            </label>
            <label>
              <span>Admissão</span>
              <input type="date" value={String(data.dataAdmissao)} readOnly />
            </label>
            <label>
              <span>Status</span>
              <select
                value={String(data.status)}
                onChange={(e) => set("status", e.target.value)}
                disabled={link.tipo === "ESTAGIO"}
              >
                <option>ATIVO</option>
                <option>AFASTADO</option>
                {link.tipo !== "ESTAGIO" && <option>DESLIGADO</option>}
              </select>
            </label>
            <label>
              <span>Data de desligamento</span>
              <input
                type="date"
                value={String(data.dataDesligamento ?? "")}
                onChange={(e) => set("dataDesligamento", e.target.value)}
                readOnly={link.tipo === "ESTAGIO"}
              />
              {link.tipo === "ESTAGIO" && (
                <small>
                  O desligamento do estágio é registrado pelo distrato.
                </small>
              )}
            </label>
            <label>
              <span>Matrícula</span>
              <input
                value={String(data.matricula ?? "")}
                onChange={(e) => set("matricula", e.target.value)}
              />
            </label>
            <label>
              <span>Cargo / função</span>
              <input
                value={String(data.cargoFuncao ?? "")}
                onChange={(e) => set("cargoFuncao", e.target.value)}
              />
            </label>
          </div>
          <StructuredScaleFields
            value={(data.escalaEstruturada as Row | null | undefined) ?? null}
            onChange={(escalaEstruturada) =>
              set("escalaEstruturada", escalaEstruturada)
            }
          />
        </fieldset>
        {link.tipo === "ESTAGIO" && (
          <fieldset>
            <legend>Dados do estágio</legend>
            <div className="form-grid">
              <label>
                <span>Instituição de ensino</span>
                <select
                  value={String(data.instituicaoEnsinoId ?? "")}
                  onChange={(e) =>
                    set("instituicaoEnsinoId", e.target.value || null)
                  }
                >
                  <option value="">Selecione</option>
                  {options.institutions.map((row) => (
                    <option key={String(row.id)} value={String(row.id)}>
                      {`${String(row.sigla ?? "").trim() ? `${String(row.sigla).trim()} - ` : ""}${String(row.nome ?? "")}`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Período acadêmico</span>
                <input
                  value={String(data.periodoAcademico ?? "")}
                  onChange={(e) => set("periodoAcademico", e.target.value)}
                />
              </label>
              <label>
                <span>Bolsa</span>
                <CurrencyInput
                  value={String(data.valorBolsa ?? "")}
                  onValueChange={(value) => set("valorBolsa", value)}
                />
              </label>
              <label>
                <span>Término do contrato/TCE</span>
                <input
                  type="date"
                  value={String(data.dataTerminoPrevista ?? "")}
                  onChange={(e) => set("dataTerminoPrevista", e.target.value)}
                />
              </label>
            </div>
          </fieldset>
        )}
        <div className="form-actions">
          <button disabled={busy}>{busy ? "Salvando…" : "Salvar"}</button>
          <button type="button" className="secondary" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}

function InfoCard({
  title,
  rows,
}: {
  title: string;
  rows: [string, ReactNode][];
}) {
  return (
    <section className="panel info-card">
      <h2>{title}</h2>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
function Timeline({
  items,
}: {
  items: { date: unknown; title: string; detail?: string }[];
}) {
  return (
    <section className="panel timeline">
      {items.length ? (
        items
          .sort((a, b) => String(b.date).localeCompare(String(a.date)))
          .map((item, index) => (
            <div className="timeline-item" key={index}>
              <time>{formatDate(item.date)}</time>
              <div>
                <strong>{item.title}</strong>
                {item.detail && <p>{item.detail}</p>}
              </div>
            </div>
          ))
      ) : (
        <EmptyState
          title="Nenhum histórico"
          description="Ainda não existem eventos neste contexto."
        />
      )}
    </section>
  );
}

function OperationalList({
  kind,
  title,
  description,
  navigate,
}: {
  kind: "estagiarios" | "descansos" | "beneficios";
  title: string;
  description: string;
  navigate: Navigate;
}) {
  const initialFilters = new URLSearchParams(location.search);
  const options = useOptions(),
    [filters, setFilters] = useState({
      q: initialFilters.get("q") ?? "",
      status: initialFilters.get("status") ?? "",
      tipo: initialFilters.get("tipo") ?? "",
      unidadeId: initialFilters.get("unidadeId") ?? "",
      equipeId: initialFilters.get("equipeId") ?? "",
      instituicaoId: initialFilters.get("instituicaoId") ?? "",
      fornecedorId: initialFilters.get("fornecedorId") ?? "",
      categoria: initialFilters.get("categoria") ?? "",
      visao: initialFilters.get("visao") ?? "",
      competencia:
        kind === "beneficios"
          ? (initialFilters.get("competencia")?.slice(0, 7) ??
            new Date().toISOString().slice(0, 7))
          : "",
    }),
    [page, setPage] = useState(Number(initialFilters.get("page") ?? 1)),
    [data, setData] = useState<ListResult>({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
    }),
    [loading, setLoading] = useState(true),
    [hasLoaded, setHasLoaded] = useState(false),
    [error, setError] = useState(""),
    [formScreen, setFormScreen] = useState<string | null>(
      kind === "beneficios" && initialFilters.get("novo") === "1"
        ? "beneficios-vinculo"
        : null,
    ),
    [editingCompetence, setEditingCompetence] = useState<Row | null>(null),
    [cancelingCompetence, setCancelingCompetence] = useState<Row | null>(null),
    [actionPending, setActionPending] = useState(false),
    [version, setVersion] = useState(0);
  const endpoint =
    kind === "estagiarios"
      ? "estagiarios-operacional"
      : kind === "descansos"
        ? "descansos-operacional"
        : "beneficios-operacional";
  useEffect(() => {
    let active = true;
    if (kind === "beneficios")
      history.replaceState(
        {},
        "",
        `${location.pathname}?${filtersQuery(filters, page)}`,
      );
    const timer = setTimeout(() => {
      setLoading(true);
      void api<ListResult>(`${endpoint}?${filtersQuery(filters, page)}`)
        .then((result) => {
          if (active) {
            setData(result);
            setError("");
          }
        })
        .catch((e) => {
          if (active) setError((e as Error).message);
        })
        .finally(() => {
          if (active) {
            setLoading(false);
            setHasLoaded(true);
          }
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [endpoint, filters, page, version]);
  const update = (key: string, value: string) => {
    setFilters({ ...filters, [key]: value });
    setPage(1);
  };
  async function competenceAction(row: Row, action: "conferir" | "cancelar") {
    setActionPending(true);
    setError("");
    try {
      await api(`competencias/${row.id}/${action}`, "POST", {});
      setCancelingCompetence(null);
      setVersion((current) => current + 1);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setActionPending(false);
    }
  }
  const rows = data.items;
  const columns =
    kind === "estagiarios"
      ? [
          {
            key: "pessoa",
            label: "Estagiário",
            render: (row: Row) => display(row.pessoa),
          },
          {
            key: "unidade",
            label: "Unidade",
            render: (row: Row) => display(row.unidade),
          },
          {
            key: "equipe",
            label: "Equipe",
            render: (row: Row) => display(row.equipe),
          },
          {
            key: "instituicao",
            label: "Instituição",
            render: (row: Row) => display(row.instituicao),
          },
          {
            key: "terminoPrevisto",
            label: "Término",
            render: (row: Row) => formatDate(row.terminoPrevisto),
          },
          {
            key: "saldo",
            label: "Descanso",
            render: (row: Row) => `${row.saldo} dias`,
          },
          {
            key: "status",
            label: "Situação",
            render: (row: Row) => <StatusBadge value={row.status} />,
          },
        ]
      : kind === "descansos"
        ? [
            {
              key: "pessoa",
              label: "Pessoa",
              render: (row: Row) => display(row.pessoa),
            },
            { key: "tipo", label: "Tipo" },
            {
              key: "unidade",
              label: "Unidade",
              render: (row: Row) => display(row.unidade),
            },
            {
              key: "adquiridos",
              label: "Adquiridos",
              render: (row: Row) => String((row.saldo as Row).adquiridos),
            },
            {
              key: "consumidos",
              label: "Utilizados",
              render: (row: Row) => String((row.saldo as Row).consumidos),
            },
            {
              key: "saldo",
              label: "Saldo",
              render: (row: Row) => `${(row.saldo as Row).saldo} dias`,
            },
            {
              key: "situacao",
              label: "Situação",
              render: (row: Row) => (
                <StatusBadge
                  value={
                    Array.isArray((row.saldo as Row).alertas) &&
                    ((row.saldo as Row).alertas as unknown[]).length > 0
                      ? "ATENÇÃO"
                      : "REGULAR"
                  }
                />
              ),
            },
          ]
        : [
            {
              key: "pessoa",
              label: "Pessoa",
              render: (row: Row) => {
                const link = (row.beneficioVinculo as Row).vinculo as Row;
                return (
                  <button
                    className="table-primary-link"
                    onClick={() =>
                      navigate(
                        `/app/pessoas/${link.pessoaId}?tab=beneficios&competencia=${filters.competencia}-01`,
                      )
                    }
                  >
                    {display(link.pessoa)}
                  </button>
                );
              },
            },
            {
              key: "unidade",
              label: "Unidade",
              render: (row: Row) =>
                display(((row.beneficioVinculo as Row).vinculo as Row).unidade),
            },
            {
              key: "beneficio",
              label: "Benefício",
              render: (row: Row) =>
                benefitLabels[String((row.beneficioVinculo as Row).tipo)] ??
                String((row.beneficioVinculo as Row).tipo),
            },
            {
              key: "fornecedor",
              label: "Fornecedor",
              render: (row: Row) =>
                display((row.configuracao as Row).fornecedor),
            },
            {
              key: "dias",
              label: "Dias",
              render: (row: Row) => display(row.quantidadeDias),
            },
            {
              key: "valor",
              label: "Valor",
              align: "end" as const,
              render: (row: Row) => money(row.valorFinal),
            },
            {
              key: "status",
              label: "Situação",
              render: (row: Row) => <StatusBadge value={row.status} />,
            },
            {
              key: "acoes",
              label: "Ações",
              mobile: "primary" as const,
              render: (row: Row) => {
                const editable = ["PENDENTE", "CONFERIDO"].includes(
                  String(row.status),
                );
                const link = (row.beneficioVinculo as Row).vinculo as Row;
                return (
                  <ActionMenu
                    label="Ações da competência"
                    items={[
                      {
                        label: "Editar lançamento",
                        disabled: !editable,
                        onSelect: () => setEditingCompetence(row),
                      },
                      {
                        label: "Marcar como conferido",
                        disabled: row.status !== "PENDENTE",
                        onSelect: () => void competenceAction(row, "conferir"),
                      },
                      {
                        label: "Cancelar competência",
                        disabled: !editable,
                        onSelect: () => setCancelingCompetence(row),
                      },
                      {
                        label: "Abrir aquisição",
                        onSelect: () =>
                          navigate(
                            `/app/beneficios/aquisicao?unidadeId=${link.unidadeId}&competencia=${String(row.competencia).slice(0, 10)}&tipo=${String((row.beneficioVinculo as Row).tipo)}`,
                          ),
                      },
                    ]}
                  />
                );
              },
            },
          ];
  const summary = useMemo(
    () =>
      kind === "descansos"
        ? {
            regular: rows.filter(
              (r) => !((r.saldo as Row).alertas as unknown[]).length,
            ).length,
            warning: rows.filter(
              (r) => ((r.saldo as Row).alertas as unknown[]).length,
            ).length,
          }
        : kind === "beneficios"
          ? {}
          : {
              alerts: rows.reduce(
                (sum, row) => sum + (row.alertas as unknown[]).length,
                0,
              ),
            },
    [kind, rows],
  );
  return (
    <>
      <PageHeader
        title={title}
        description={description}
        action={
          <div className="form-actions">
            {kind === "beneficios" && (
              <button
                className="secondary"
                onClick={() => {
                  const params = new URLSearchParams({
                    competencia: `${filters.competencia}-01`,
                  });
                  if (filters.unidadeId)
                    params.set("unidadeId", filters.unidadeId);
                  if (filters.categoria)
                    params.set("categoria", filters.categoria);
                  navigate(`/app/beneficios?${params}`);
                }}
              >
                Voltar ao resumo
              </button>
            )}
            {kind === "estagiarios" && (
              <>
                <button
                  className="secondary"
                  onClick={() => setFormScreen("documentos")}
                >
                  Novo documento
                </button>
                <button
                  className="secondary"
                  onClick={() => setFormScreen("seguros")}
                >
                  Novo seguro
                </button>
              </>
            )}
            {kind !== "beneficios" && (
              <button
                onClick={() =>
                  setFormScreen(
                    kind === "estagiarios" ? "estagios" : "periodos",
                  )
                }
              >
                {kind === "estagiarios" ? "Novo estágio" : "Programar período"}
              </button>
            )}
          </div>
        }
      />
      {error && <Notice text={error} error />}
      <FormSheet
        open={Boolean(formScreen) || Boolean(editingCompetence)}
        onOpenChange={(open) => {
          if (!open) {
            setFormScreen(null);
            setEditingCompetence(null);
          }
        }}
        title={
          editingCompetence
            ? "Editar lançamento mensal"
            : (screens.find((screen) => screen.path === formScreen)?.title ??
              "Novo registro")
        }
        description="Preencha os dados desta operação."
      >
        {editingCompetence ? (
          <CompetenceEditor
            competence={editingCompetence}
            onClose={() => setEditingCompetence(null)}
            onSaved={() => {
              setEditingCompetence(null);
              setVersion((current) => current + 1);
            }}
          />
        ) : formScreen ? (
          <RecordForm
            embedded
            screen={screens.find((screen) => screen.path === formScreen)!}
            record={null}
            onClose={() => setFormScreen(null)}
            onSaved={() => {
              setFormScreen(null);
              setVersion(version + 1);
            }}
          />
        ) : null}
      </FormSheet>
      <ConfirmDialog
        open={Boolean(cancelingCompetence)}
        onOpenChange={(open) => {
          if (!open) setCancelingCompetence(null);
        }}
        title="Cancelar competência?"
        description="O lançamento deste mês será cancelado. A adesão recorrente e o histórico da pessoa serão preservados."
        confirmLabel={actionPending ? "Cancelando…" : "Cancelar competência"}
        onConfirm={() => {
          if (cancelingCompetence)
            void competenceAction(cancelingCompetence, "cancelar");
        }}
      />
      {loading && !hasLoaded ? (
        <LoadingSkeleton
          variant="metrics"
          label={`Carregando resumo de ${title.toLowerCase()}…`}
        />
      ) : (
        <RefreshingContent refreshing={loading}>
          <div className="metrics">
            {kind === "descansos" ? (
              <>
                <MetricCard
                  label="Regulares nesta página"
                  value={summary.regular}
                />
                <MetricCard
                  label="Com atenção"
                  value={summary.warning}
                  tone="warning"
                />
              </>
            ) : kind === "beneficios" ? null : (
              <>
                <MetricCard
                  label="Estagiários encontrados"
                  value={data.total}
                />
                <MetricCard
                  label="Alertas nesta página"
                  value={summary.alerts}
                  tone="warning"
                />
              </>
            )}
          </div>
        </RefreshingContent>
      )}
      <section className="panel filter-panel">
        <div className="filter-grid">
          <label>
            <span>Buscar</span>
            <input
              value={filters.q}
              onChange={(e) => update("q", e.target.value)}
            />
          </label>
          {kind !== "beneficios" && (
            <FilterSelect
              label="Status"
              value={filters.status}
              onChange={(v) => update("status", v)}
            >
              <option>ATIVO</option>
              <option>AFASTADO</option>
              <option>DESLIGADO</option>
            </FilterSelect>
          )}
          {kind === "beneficios" && (
            <FilterSelect
              label="Visão"
              value={filters.visao}
              onChange={(value) => update("visao", value)}
            >
              <option value="previsto">Previsto</option>
              <option value="comprado">Com compra líquida</option>
              <option value="pedido">Em pedido</option>
              <option value="pendente">Aguardando conferência</option>
            </FilterSelect>
          )}
          {kind === "beneficios" && (
            <FilterSelect
              label="Situação"
              value={filters.status}
              onChange={(v) => update("status", v)}
            >
              <option>PENDENTE</option>
              <option>CONFERIDO</option>
              <option>PAGO</option>
              <option>CANCELADO</option>
            </FilterSelect>
          )}
          {kind === "descansos" && (
            <FilterSelect
              label="Tipo"
              value={filters.tipo}
              onChange={(v) => update("tipo", v)}
            >
              <option value="CLT">CLT</option>
              <option value="ESTAGIO">Estágio</option>
              <option value="APRENDIZ">Aprendiz</option>
              <option value="TRAINEE">Trainee</option>
            </FilterSelect>
          )}
          <FilterSelect
            label="Unidade"
            value={filters.unidadeId}
            onChange={(v) => update("unidadeId", v)}
          >
            {options.units.map((r) => (
              <option key={String(r.id)} value={String(r.id)}>
                {display(r)}
              </option>
            ))}
          </FilterSelect>
          {kind === "estagiarios" && (
            <FilterSelect
              label="Instituição"
              value={filters.instituicaoId}
              onChange={(v) => update("instituicaoId", v)}
            >
              {options.institutions.map((r) => (
                <option key={String(r.id)} value={String(r.id)}>
                  {`${String(r.sigla ?? "").trim() ? `${String(r.sigla).trim()} - ` : ""}${String(r.nome ?? "")}`}
                </option>
              ))}
            </FilterSelect>
          )}
          {kind === "beneficios" && (
            <>
              <FilterSelect
                label="Categoria"
                value={filters.categoria}
                onChange={(value) => update("categoria", value)}
              >
                <option value="ALIMENTACAO">Alimentação</option>
                <option value="TRANSPORTE">Transporte</option>
                <option value="CESTA_BASICA">Cesta básica</option>
                <option value="PREMIACAO">Premiação</option>
                <option value="OUTRO">Outro</option>
              </FilterSelect>
              <label>
                <span>Competência</span>
                <input
                  type="month"
                  value={filters.competencia}
                  onChange={(e) => update("competencia", e.target.value)}
                />
              </label>
              <FilterSelect
                label="Fornecedor"
                value={filters.fornecedorId}
                onChange={(v) => update("fornecedorId", v)}
              >
                {options.suppliers.map((r) => (
                  <option key={String(r.id)} value={String(r.id)}>
                    {display(r)}
                  </option>
                ))}
              </FilterSelect>
            </>
          )}
        </div>
      </section>
      <section className="panel">
        {loading && !hasLoaded ? (
          <LoadingSkeleton label={`Carregando ${title.toLowerCase()}…`} />
        ) : (
          <RefreshingContent refreshing={loading}>
            <DataTable
              rows={rows}
              primaryKey="pessoa"
              columns={columns}
              {...(kind === "beneficios"
                ? {}
                : {
                    onRow: (row: Row) => {
                      const personId = row.pessoaId;
                      if (personId) navigate(`/app/pessoas/${personId}`);
                    },
                  })}
              empty={
                <EmptyState
                  title="Nenhum resultado"
                  description="Não há registros para os filtros selecionados."
                />
              }
            />
          </RefreshingContent>
        )}
        <Pagination page={page} total={data.total} onChange={setPage} />
      </section>
    </>
  );
}
export const InternsPage = ({ navigate }: { navigate: Navigate }) => (
  <OperationalList
    kind="estagiarios"
    title="Estagiários"
    description="Acompanhe estágio, instituição, documentos e férias."
    navigate={navigate}
  />
);
export const LeavePage = ({ navigate }: { navigate: Navigate }) => (
  <OperationalList
    kind="descansos"
    title="Férias"
    description="Saldos reconstruídos, prazos e inconsistências por vínculo."
    navigate={navigate}
  />
);
export const BenefitLaunchesPage = ({ navigate }: { navigate: Navigate }) => (
  <OperationalList
    kind="beneficios"
    title="Lançamentos de benefícios"
    description="Consulte, confira e corrija os lançamentos da competência."
    navigate={navigate}
  />
);

const registryRelations: Record<
  string,
  Array<{ title: string; endpoint: (id: string) => string }>
> = {
  unidades: [
    {
      title: "Vínculos da unidade",
      endpoint: (id) => `vinculos?unidadeId=${id}`,
    },
    {
      title: "Configurações de benefícios",
      endpoint: (id) => `configuracoes-beneficios?unidadeId=${id}`,
    },
  ],
  equipes: [
    {
      title: "Vínculos da equipe",
      endpoint: (id) => `vinculos?equipeId=${id}`,
    },
  ],
  instituicoes: [
    {
      title: "Estágios relacionados",
      endpoint: (id) => `estagios?instituicaoEnsinoId=${id}`,
    },
  ],
  fornecedores: [
    {
      title: "Configurações relacionadas",
      endpoint: (id) => `configuracoes-beneficios?fornecedorId=${id}`,
    },
  ],
};

export function RegistryDetail({
  resource,
  id,
  navigate,
}: {
  resource: string;
  id: string;
  navigate: Navigate;
}) {
  const screen = screens.find((item) => item.path === resource)!;
  const [record, setRecord] = useState<Row | null>(null),
    [relations, setRelations] = useState<
      Array<{ title: string; items: Row[] }>
    >([]),
    [editing, setEditing] = useState(false),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const definitions = registryRelations[resource] ?? [];
    void Promise.all([
      api<Row>(`${resource}/${id}`),
      ...definitions.map((definition) =>
        api<ListResult>(definition.endpoint(id)).then((result) => ({
          title: definition.title,
          items: result.items,
        })),
      ),
    ])
      .then(([current, ...related]) => {
        if (active) {
          setRecord(current as Row);
          setRelations(related as Array<{ title: string; items: Row[] }>);
          setError("");
        }
      })
      .catch((reason) => {
        if (active) setError((reason as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, resource, version]);
  if (error && !record) return <Notice text={error} error />;
  if (!record)
    return <LoadingSkeleton variant="detail" label="Carregando detalhes…" />;
  return (
    <RefreshingContent refreshing={loading}>
      <>
        <Notice text={error} error />
        <PageHeader
          title={display(record)}
          description={`Detalhes e relacionamentos de ${screen.title.toLowerCase()}.`}
          breadcrumb={
            <button
              className="link-button"
              onClick={() => navigate(`/app/cadastros/${resource}`)}
            >
              ← {screen.title}
            </button>
          }
          action={
            <button onClick={() => setEditing(true)}>Editar cadastro</button>
          }
        />
        <FormDialog
          open={editing}
          onOpenChange={setEditing}
          title={`Editar · ${screen.title}`}
          description={screen.description}
        >
          {editing && (
            <RecordForm
              embedded
              screen={screen}
              record={record}
              onClose={() => setEditing(false)}
              onSaved={() => {
                setEditing(false);
                setVersion(version + 1);
              }}
            />
          )}
        </FormDialog>
        <InfoCard
          title="Cadastro"
          rows={screen.columns.map((key) => [
            screen.fields.find((field) => field.key === key)?.label ?? key,
            display(record[key]),
          ])}
        />
        {relations.map((relation) => (
          <section className="panel" key={relation.title}>
            <h2>{relation.title}</h2>
            <DataTable
              rows={relation.items}
              columns={[
                {
                  key: "registro",
                  label: "Registro",
                  render: (row) => display(row),
                },
                { key: "tipo", label: "Tipo" },
                { key: "status", label: "Situação" },
              ]}
              empty={
                <EmptyState
                  title="Nenhum relacionamento"
                  description="Ainda não há registros relacionados."
                />
              }
            />
          </section>
        ))}
      </>
    </RefreshingContent>
  );
}

export function AuxiliaryPage({ resource }: { resource: string }) {
  const screen = screens.find((item) => item.path === resource)!;
  return <RecordFormHost screen={screen} />;
}
function RecordFormHost({ screen }: { screen: (typeof screens)[number] }) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <PageHeader
        title={screen.title}
        description={screen.description}
        action={
          <button onClick={() => setEditing(true)}>+ Novo registro</button>
        }
      />
      {editing ? (
        <RecordForm
          screen={screen}
          record={null}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      ) : (
        <EmptyState
          title={`Gerencie ${screen.title.toLowerCase()}`}
          description="Use a listagem operacional para consultar e editar os registros."
        />
      )}
    </>
  );
}
