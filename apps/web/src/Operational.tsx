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
  EmptyState,
  MetricCard,
  money,
  maskCpf,
  PageHeader,
  Pagination,
  StatusBadge,
  formatDate,
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
    [error, setError] = useState(""),
    [editing, setEditing] = useState(false),
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
            if (active) setLoading(false);
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
        action={<button onClick={() => setEditing(true)}>+ Nova pessoa</button>}
      />
      <Notice text={error} error />
      {editing && (
        <PersonForm
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setVersion(version + 1);
          }}
        />
      )}
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
        <div className="result-count">
          {loading ? "Carregando…" : `${data.total} pessoas encontradas`}
        </div>
        {!loading && (
          <DataTable
            rows={data.items}
            onRow={(row) => navigate(`/app/pessoas/${row.id}`)}
            empty={
              <EmptyState
                title="Nenhuma pessoa encontrada"
                description="Ajuste os filtros, cadastre uma pessoa ou importe uma planilha."
                action={
                  <button onClick={() => setEditing(true)}>Nova pessoa</button>
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
        )}
        <Pagination page={page} total={data.total} onChange={setPage} />
      </section>
    </>
  );
}

function PersonForm({
  person,
  onClose,
  onSaved,
}: {
  person?: Row;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [data, setData] = useState<Row>({
      nomeCompleto: "",
      nomeSocial: "",
      cpf: "",
      rg: "",
      dataNascimento: "",
      email: "",
      telefone: "",
      endereco: person?.endereco ?? "",
      cep: "",
      logradouro: "",
      numeroEndereco: "",
      complemento: "",
      bairro: "",
      cidadeEndereco: "",
      ufEndereco: "",
      observacoes: "",
      ativa: true,
      ...person,
    }),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
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
              !["id", "criadoEm", "atualizadoEm", "vinculos"].includes(key),
          )
          .map(([key, value]) => [key, value === "" ? null : value]),
      );
      await api(
        `pessoas${person?.id ? `/${person.id}` : ""}`,
        person?.id ? "PUT" : "POST",
        payload,
      );
      onSaved();
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
        <button className="secondary" onClick={onClose}>
          Fechar
        </button>
      </div>
      <Notice text={error} error />
      <form onSubmit={(e) => void submit(e)}>
        <fieldset>
          <legend>Dados pessoais</legend>
          <div className="form-grid">
            {field("nomeCompleto", "Nome completo *")}
            {field("nomeSocial", "Nome social")}
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
          <button type="button" className="secondary" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </form>
    </section>
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
    [editing, setEditing] = useState(false),
    [formScreen, setFormScreen] = useState<string | null>(null),
    [version, setVersion] = useState(0);
  useEffect(() => {
    void api<Row>(`pessoas/${id}/perfil`)
      .then(setProfile)
      .catch((e) => setError((e as Error).message));
  }, [id, version]);
  if (error) return <Notice text={error} error />;
  if (!profile) return <p role="status">Carregando perfil…</p>;
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
    <>
      <PageHeader
        title={String(person.nomeCompleto)}
        description={`${current?.tipo === "ESTAGIO" ? "Estagiário(a)" : (current?.tipo ?? "Sem vínculo")} · ${display(current?.unidade)}`}
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
            <button
              className="secondary"
              onClick={() => setFormScreen("vinculos")}
            >
              Novo vínculo
            </button>
            <button onClick={() => setEditing(true)}>Editar pessoa</button>
          </div>
        }
      />
      {profile.multiplosVinculosAtivos && (
        <Notice
          text="Mais de um vínculo ativo encontrado. Revise esta situação."
          error
        />
      )}
      {editing && (
        <PersonForm
          person={person}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setVersion(version + 1);
          }}
        />
      )}
      {formScreen && (
        <RecordForm
          screen={screens.find((screen) => screen.path === formScreen)!}
          record={null}
          {...(formScreen === "vinculos" ? { defaults: { pessoaId: id } } : {})}
          onClose={() => setFormScreen(null)}
          onSaved={() => {
            setFormScreen(null);
            setVersion(version + 1);
          }}
        />
      )}
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
        <Timeline
          items={links.map((link) => ({
            date: link.dataAdmissao,
            title: `${link.tipo} · ${display(link.unidade)}`,
            detail: `${link.status} · ${display(link.equipe)}`,
          }))}
        />
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
                  date: item.dataAquisicao ?? item.dataInicio ?? item.criadoEm,
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
                  {String(benefit.tipo)} <StatusBadge value={benefit.status} />
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
          if (active) setLoading(false);
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
      {formScreen && (
        <RecordForm
          screen={screens.find((screen) => screen.path === formScreen)!}
          record={null}
          onClose={() => setFormScreen(null)}
          onSaved={() => {
            setFormScreen(null);
            setVersion(version + 1);
          }}
        />
      )}
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
            <MetricCard label="Valor informado" value={money(summary.total)} />
            <MetricCard
              label="Pendências"
              value={summary.pending}
              tone="warning"
            />
          </>
        ) : (
          <>
            <MetricCard label="Estagiários encontrados" value={data.total} />
            <MetricCard
              label="Alertas nesta página"
              value={summary.alerts}
              tone="warning"
            />
          </>
        )}
      </div>
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
        {loading ? (
          <p role="status">Carregando…</p>
        ) : (
          <DataTable
            rows={rows}
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
  <OperationalList
    kind="beneficios"
    title="Benefícios"
    description="Competências, fornecedores, valores e pendências."
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
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
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
        }
      })
      .catch((reason) => {
        if (active) setError((reason as Error).message);
      });
    return () => {
      active = false;
    };
  }, [id, resource, version]);
  if (error) return <Notice text={error} error />;
  if (!record) return <p role="status">Carregando detalhes…</p>;
  return (
    <>
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
      {editing && (
        <RecordForm
          screen={screen}
          record={record}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            setVersion(version + 1);
          }}
        />
      )}
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
