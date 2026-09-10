import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { api, display, type Row } from "./api";
import {
  DataTable,
  ActionMenu,
  ConfirmDialog,
  EmptyState,
  LoadingSkeleton,
  MetricCard,
  money,
  maskCpf,
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

type Navigate = (path: string) => void;
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
    void Promise.all([
      api<ListResult>("unidades?pageSize=100"),
      api<ListResult>("equipes?pageSize=100"),
      api<ListResult>("instituicoes?pageSize=100"),
      api<ListResult>("fornecedores?pageSize=100"),
    ]).then(([units, teams, institutions, suppliers]) =>
      setOptions({
        units: units.items,
        teams: teams.items,
        institutions: institutions.items,
        suppliers: suppliers.items,
      }),
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
    tipo: initial.get("tipo") ?? "",
    unidadeId: initial.get("unidadeId") ?? "",
    equipeId: initial.get("equipeId") ?? "",
  });
  const [page, setPage] = useState(Number(initial.get("page") ?? 1)),
    [data, setData] = useState<ListResult>({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
    }),
    [loading, setLoading] = useState(true),
    [hasLoaded, setHasLoaded] = useState(false),
    [error, setError] = useState(""),
    [creating, setCreating] = useState(false),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    const query = filtersQuery(filters, page);
    history.replaceState({}, "", `/app/pessoas?${query}`);
    setLoading(true);
    const timer = setTimeout(
      () =>
        void api<ListResult>(`pessoas-operacional?${query}`)
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
  const update = (key: string, value: string) => {
    setFilters({ ...filters, [key]: value });
    setPage(1);
  };
  return (
    <>
      <PageHeader
        title="Pessoas"
        description="Encontre rapidamente uma pessoa e acompanhe sua situação atual."
        action={
          <button onClick={() => setCreating(true)}>+ Nova pessoa</button>
        }
      />
      <FormSheet
        open={creating}
        onOpenChange={setCreating}
        title="Nova pessoa"
        description="Cadastre a pessoa e seu vínculo inicial."
      >
        {creating && (
          <PersonForm
            options={options}
            onClose={() => setCreating(false)}
            onSaved={() => {
              setCreating(false);
              setVersion((value) => value + 1);
            }}
          />
        )}
      </FormSheet>
      <Notice text={error} error />
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
            label="Status"
            value={filters.status}
            onChange={(v) => update("status", v)}
          >
            <option>ATIVO</option>
            <option>AFASTADO</option>
            <option>DESLIGADO</option>
          </FilterSelect>
          <FilterSelect
            label="Vínculo"
            value={filters.tipo}
            onChange={(v) => update("tipo", v)}
          >
            <option value="CLT">CLT</option>
            <option value="ESTAGIO">Estágio</option>
            <option value="APRENDIZ">Aprendiz</option>
          </FilterSelect>
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
          <button
            className="secondary clear-filter"
            onClick={() => {
              setFilters({
                q: "",
                status: "",
                tipo: "",
                unidadeId: "",
                equipeId: "",
              });
              setPage(1);
            }}
          >
            Limpar filtros
          </button>
        </div>
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
              onRow={(row) => navigate(`/app/pessoas/${row.id}`)}
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
                { key: "nomeCompleto", label: "Nome" },
                { key: "vinculo", label: "Vínculo" },
                {
                  key: "unidade",
                  label: "Unidade",
                  render: (row) => display(row.unidade),
                },
                {
                  key: "equipe",
                  label: "Equipe",
                  render: (row) => display(row.equipe),
                },
                {
                  key: "admissao",
                  label: "Admissão",
                  render: (row) => formatDate(row.admissao),
                },
                { key: "cpf", label: "CPF", render: (row) => maskCpf(row.cpf) },
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
    </>
  );
}

function PersonForm({
  person,
  options = { units: [], teams: [], institutions: [], suppliers: [] },
  onClose,
  onSaved,
  onDirtyChange,
}: {
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
      unidadeId: "",
      equipeId: "",
      tipo: "CLT",
      dataAdmissao: "",
      matricula: "",
      cargoFuncao: "",
      gestor: "",
      escala: "",
      instituicaoEnsinoId: "",
      periodoAcademico: "",
      valorBolsa: "",
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
      <input
        type={type}
        value={String(data[key] ?? "").slice(
          0,
          type === "date" ? 10 : undefined,
        )}
        onChange={(e) => setData({ ...data, [key]: e.target.value || null })}
      />
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
                "instituicaoEnsinoId",
                "periodoAcademico",
                "valorBolsa",
              ].includes(key),
          )
          .map(([key, value]) => [key, value === "" ? null : value]),
      );
      const saved = person?.id
        ? await api<Row>(`pessoas/${person.id}`, "PUT", payload)
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
              ].map((key) => [key, data[key] === "" ? null : data[key]]),
            ),
            ...(data.tipo === "ESTAGIO"
              ? {
                  estagio: {
                    instituicaoEnsinoId: data.instituicaoEnsinoId || null,
                    periodoAcademico: data.periodoAcademico || null,
                    valorBolsa: data.valorBolsa === "" ? null : data.valorBolsa,
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
        <button type="button" className="secondary" onClick={close}>
          Fechar
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
                      {display(row)}
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
                  {options.teams.map((row) => (
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
                </select>
              </label>
              {field("dataAdmissao", "Admissão *", "date")}
              {field("matricula", "Matrícula")}
              {field("cargoFuncao", "Cargo/Função")}
              {field("gestor", "Gestor")}
              {field("escala", "Escala")}
            </div>
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
                        {display(row)}
                      </option>
                    ))}
                  </select>
                </label>
                {field("periodoAcademico", "Período acadêmico")}
                {field("valorBolsa", "Bolsa (R$)", "number")}
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

export function PersonProfile({
  id,
  navigate,
}: {
  id: string;
  navigate: Navigate;
}) {
  const [profile, setProfile] = useState<Row | null>(null),
    [tab, setTab] = useState("visao"),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [formScreen, setFormScreen] = useState<string | null>(null),
    [editingLink, setEditingLink] = useState<Row | null>(null),
    [version, setVersion] = useState(0);
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
    ["descanso", "Férias / descanso"],
    ["beneficios", "Benefícios"],
    ["documentos", "Documentos"],
    ["historico", "Histórico"],
  ];
  return (
    <RefreshingContent refreshing={loading}>
      <>
        <Notice text={error} error />
        <PageHeader
          title={String(person.nomeCompleto)}
          description={`${current?.tipo === "ESTAGIO" ? "Estagiário(a)" : current?.tipo === "APRENDIZ" ? "Aprendiz" : (current?.tipo ?? "Sem vínculo")} · ${display(current?.unidade)}`}
          breadcrumb={
            <button
              className="link-button"
              onClick={() => {
                if (history.length > 1) history.back();
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
        {profile.multiplosVinculosAtivos && (
          <Notice
            text="Mais de um vínculo ativo encontrado. Revise esta situação."
            error
          />
        )}
        <FormSheet
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
          {formScreen && (
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
          )}
        </FormSheet>
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
              <>
                <button onClick={() => setFormScreen("periodos")}>
                  Programar descanso
                </button>
                <ActionMenu
                  items={[
                    {
                      label: "Registrar ajuste",
                      onSelect: () => setFormScreen("ajustes-descanso"),
                    },
                  ]}
                />
              </>
            )}
            {tab === "beneficios" && (
              <>
                <button onClick={() => setFormScreen("beneficios-vinculo")}>
                  Adicionar benefício
                </button>
                <ActionMenu
                  items={[
                    {
                      label: "Nova competência",
                      onSelect: () => setFormScreen("competencias"),
                    },
                    {
                      label: "Registrar ajuste",
                      onSelect: () => setFormScreen("ajustes-beneficios"),
                    },
                  ]}
                />
              </>
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
                ["Telefone", display(person.telefone)],
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
                  "Benefícios ativos",
                  String(
                    (current?.beneficios as Row[] | undefined)?.filter(
                      (b) => b.status === "ATIVO",
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
            {links
              .flatMap((link) => link.beneficios as Row[])
              .map((benefit) => (
                <section className="panel" key={String(benefit.id)}>
                  <h2>
                    {String(benefit.tipo)}{" "}
                    <StatusBadge value={benefit.status} />
                  </h2>
                  <Timeline
                    items={(benefit.competencias as Row[]).map((item) => ({
                      date: item.competencia,
                      title: `${String(item.componente)} · ${money(item.valorInformado)}`,
                      detail: display((item.configuracao as Row)?.fornecedor),
                    }))}
                  />
                </section>
              ))}
          </div>
        )}
        {tab === "documentos" && (
          <div className="profile-grid">
            {links.map((link) => (
              <section className="panel" key={String(link.id)}>
                <h2>Documentos e seguro · {String(link.tipo)}</h2>
                <Timeline
                  items={[
                    ...(link.documentos as Row[]).map((item) => ({
                      date: item.dataReferencia ?? item.fimVigencia,
                      title: String(item.tipo),
                      detail: `${item.status} · ${display(item.observacoes)}`,
                    })),
                    ...(link.seguros as Row[]).flatMap((insurance) => [
                      {
                        date: insurance.inicioVigencia,
                        title: `Seguro · ${insurance.seguradora}`,
                        detail: String(insurance.status),
                      },
                      ...(insurance.movimentacoes as Row[]).map((movement) => ({
                        date: movement.dataMovimentacao,
                        title: String(movement.tipo),
                        detail: display(movement.observacoes),
                      })),
                    ]),
                  ]}
                />
              </section>
            ))}
          </div>
        )}
        {tab === "historico" && (
          <Timeline
            items={(profile.historico as Row[]).map((item) => ({
              date: item.criadoEm,
              title: `${String(item.acao)} · ${String(item.entidade)}`,
              detail: `Por ${display(item.usuario)}`,
            }))}
          />
        )}
      </>
    </RefreshingContent>
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
  const options = useOptions(),
    [filters, setFilters] = useState({
      q: "",
      status: "",
      tipo: "",
      unidadeId: "",
      equipeId: "",
      instituicaoId: "",
      fornecedorId: "",
      competencia:
        kind === "beneficios" ? new Date().toISOString().slice(0, 7) : "",
    }),
    [page, setPage] = useState(1),
    [data, setData] = useState<ListResult>({
      items: [],
      total: 0,
      page: 1,
      pageSize: 25,
    }),
    [loading, setLoading] = useState(true),
    [hasLoaded, setHasLoaded] = useState(false),
    [error, setError] = useState(""),
    [formScreen, setFormScreen] = useState<string | null>(null),
    [version, setVersion] = useState(0);
  const endpoint =
    kind === "estagiarios"
      ? "estagiarios-operacional"
      : kind === "descansos"
        ? "descansos-operacional"
        : "beneficios-operacional";
  useEffect(() => {
    let active = true;
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
              render: (row: Row) =>
                display(((row.beneficioVinculo as Row).vinculo as Row).pessoa),
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
              render: (row: Row) => String((row.beneficioVinculo as Row).tipo),
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
              render: (row: Row) =>
                money(
                  row.valorInformado ??
                    Number(row.quantidadeDias ?? row.quantidade ?? 0) *
                      Number(row.valorUnitario ?? 0),
                ),
            },
            {
              key: "status",
              label: "Situação",
              render: (row: Row) => <StatusBadge value={row.status} />,
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
          ? {
              total: rows.reduce(
                (sum, row) => sum + Number(row.valorInformado ?? 0),
                0,
              ),
              pending: rows.filter((r) => r.status === "PENDENTE").length,
            }
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
            {kind === "descansos" && (
              <button
                className="secondary"
                onClick={() => setFormScreen("ajustes-descanso")}
              >
                Registrar ajuste
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
            {kind === "beneficios" && (
              <>
                <button
                  className="secondary"
                  onClick={() => setFormScreen("beneficios-vinculo")}
                >
                  Nova adesão
                </button>
                <button
                  className="secondary"
                  onClick={() => setFormScreen("ajustes-beneficios")}
                >
                  Registrar ajuste
                </button>
              </>
            )}
            <button
              onClick={() =>
                setFormScreen(
                  kind === "estagiarios"
                    ? "estagios"
                    : kind === "descansos"
                      ? "periodos"
                      : "competencias",
                )
              }
            >
              {kind === "estagiarios"
                ? "Novo estágio"
                : kind === "descansos"
                  ? "Programar período"
                  : "Nova competência"}
            </button>
          </div>
        }
      />
      {error && <Notice text={error} error />}
      <FormSheet
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
        {formScreen && (
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
        )}
      </FormSheet>
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
            ) : kind === "beneficios" ? (
              <>
                <MetricCard
                  label="Valor informado"
                  value={money(summary.total)}
                />
                <MetricCard
                  label="Pendências"
                  value={summary.pending}
                  tone="warning"
                />
              </>
            ) : (
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
                  {display(r)}
                </option>
              ))}
            </FilterSelect>
          )}
          {kind === "beneficios" && (
            <>
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
              onRow={(row) => {
                const personId =
                  row.pessoaId ??
                  ((row.beneficioVinculo as Row)?.vinculo as Row)?.pessoaId;
                if (personId) navigate(`/app/pessoas/${personId}`);
              }}
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
    description="Acompanhe estágio, instituição, documentos e descanso."
    navigate={navigate}
  />
);
export const LeavePage = ({ navigate }: { navigate: Navigate }) => (
  <OperationalList
    kind="descansos"
    title="Férias e descanso"
    description="Saldos reconstruídos, prazos e inconsistências por vínculo."
    navigate={navigate}
  />
);
export const BenefitsPage = ({ navigate }: { navigate: Navigate }) => (
  <>
    <div className="form-actions">
      <button onClick={() => navigate("/app/beneficios/fechamento")}>
        Fechamento por competência
      </button>
    </div>
    <OperationalList
      kind="beneficios"
      title="Benefícios"
      description="Competências, fornecedores, valores e pendências."
      navigate={navigate}
    />
  </>
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
