import { useEffect, useState } from "react";
import { api, apiBlob, display, type Row } from "./api";
import { Lookup, Notice } from "./components";
import {
  EmptyState,
  DataTable,
  LoadingSkeleton,
  MetricCard,
  PageHeader,
  Pagination,
  RefreshingContent,
  StatusBadge,
  formatDate,
  money,
} from "./ui";

const reportColumns: Record<
  string,
  Array<{
    key: string;
    label: string;
    format: "date" | "money" | undefined;
    mobile: "primary" | "secondary" | "hidden";
  }>
> = {
  pessoas: [
    "Pessoa",
    "Unidade",
    "Equipe",
    "Vínculo",
    "Status",
    "Admissão",
    "CPF",
    "E-mail",
    "Telefone",
    "Cargo",
    "Desligamento",
  ].map((key, index) => ({
    key,
    label: key,
    format: /Admissão|Desligamento/.test(key) ? "date" : undefined,
    mobile: index === 0 ? "primary" : index > 4 ? "hidden" : "secondary",
  })),
  estagios: [
    "Pessoa",
    "Unidade",
    "Equipe",
    "Vínculo",
    "Status",
    "Admissão",
    "Instituição",
    "Curso",
    "Matrícula",
    "Bolsa",
  ].map((key, index) => ({
    key,
    label: key,
    format: key === "Admissão" ? "date" : key === "Bolsa" ? "money" : undefined,
    mobile: index === 0 ? "primary" : index > 5 ? "hidden" : "secondary",
  })),
  descansos: [
    "Pessoa",
    "Unidade",
    "Equipe",
    "Vínculo",
    "Status",
    "Admissão",
    "Adquiridos",
    "Consumidos",
    "Ajustes",
    "Saldo",
    "Programados",
    "Alertas",
  ].map((key, index) => ({
    key,
    label: key,
    format: key === "Admissão" ? "date" : undefined,
    mobile: index === 0 ? "primary" : index > 5 ? "hidden" : "secondary",
  })),
  beneficios: [
    "Pessoa",
    "Unidade",
    "Equipe",
    "Vínculo",
    "Benefício",
    "Fornecedor",
    "Componente",
    "Competência",
    "Dias",
    "Quantidade",
    "Valor unitário",
    "Valor calculado",
    "Valor informado",
    "Ajustes",
    "Divergência",
    "Status",
    "Observações",
  ].map((key, index) => ({
    key,
    label: key,
    format:
      key === "Competência"
        ? "date"
        : /^Valor|Ajustes|Divergência/.test(key)
          ? "money"
          : undefined,
    mobile: index === 0 ? "primary" : index > 5 ? "hidden" : "secondary",
  })),
  "aquisicoes-beneficios": [
    "Pessoa",
    "Unidade",
    "Equipe",
    "Competência",
    "Benefício",
    "Fornecedor",
    "Cartão",
    "Destino",
    "Previsto",
    "Reservado",
    "Comprado bruto",
    "Revertido",
    "Comprado líquido",
    "Situação",
    "Referência externa",
    "Data da compra",
  ].map((key, index) => ({
    key,
    label: key,
    format: /Previsto|Reservado|Comprado|Revertido/.test(key)
      ? "money"
      : /Competência|Data da compra/.test(key)
        ? "date"
        : undefined,
    mobile: index === 0 ? "primary" : index > 5 ? "hidden" : "secondary",
  })),
  inconsistencias: ["Pessoa", "Tipo", "Mensagem", "Prazo"].map(
    (key, index) => ({
      key,
      label: key,
      format: key === "Prazo" ? "date" : undefined,
      mobile: index === 0 ? "primary" : "secondary",
    }),
  ),
};
export function Dashboard({ navigate }: { navigate?: (path: string) => void }) {
  const initial = new URLSearchParams(location.search);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [unit, setUnit] = useState(initial.get("unidadeId") ?? "");
  const [competence, setCompetence] = useState(
    initial.get("competencia")?.slice(0, 7) ?? currentMonth,
  );
  const [units, setUnits] = useState<Row[]>([]);
  const [data, setData] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);

  useEffect(() => {
    void api<{ items: Row[] }>("unidades?pageSize=100")
      .then((result) => setUnits(result.items))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams();
    if (unit) params.set("unidadeId", unit);
    params.set("competencia", `${competence}-01`);
    history.replaceState(null, "", `${location.pathname}?${params}`);
    setLoading(true);
    void api<Row>(`dashboard?${params}`)
      .then((result) => {
        if (!active) return;
        setData(result);
        setError("");
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [unit, competence]);

  const metrics = [
    [
      "pendenciasCriticas",
      "Pendências críticas",
      "/app/pendencias?severidade=CRITICA",
      false,
    ],
    [
      "contratosVencendo",
      "Contratos vencendo em 30 dias",
      "/app/estagiarios",
      false,
    ],
    [
      "tcesAguardandoAssinatura",
      "TCEs aguardando assinatura",
      "/app/pendencias?modulo=ESTAGIO",
      false,
    ],
    ["feriasAtencao", "Férias exigindo atenção", "/app/ferias", false],
    ["custoBeneficios", "Custo de benefícios no mês", "/app/beneficios", true],
    [
      "divergenciasBeneficios",
      "Divergências de benefícios",
      "/app/pendencias?modulo=BENEFICIO",
      false,
    ],
  ] as const;
  const pendings = Array.isArray(data?.pendenciasPrioritarias)
    ? (data.pendenciasPrioritarias as Row[])
    : [];
  const readiness = Array.isArray(data?.prontidaoMensal)
    ? (data.prontidaoMensal as Row[])
    : [];
  const metricDetails = selectedMetric
    ? Array.isArray((data?.kpiDetalhes as Row | undefined)?.[selectedMetric])
      ? ((data?.kpiDetalhes as Row)[selectedMetric] as Row[])
      : []
    : [];
  const selectedTitle = metrics.find(([key]) => key === selectedMetric)?.[1];
  return (
    <>
      <PageHeader
        title="Visão geral"
        description="Acompanhe pessoas, prazos e pendências que precisam de atenção."
      />
      <Notice text={error} error />
      <section
        className="panel dashboard-filters"
        aria-label="Filtros do dashboard"
      >
        <label>
          <span>Unidade</span>
          <select
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
          >
            <option value="">Todas as unidades</option>
            {units.map((item) => (
              <option key={String(item.id)} value={String(item.id)}>
                {display(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Competência</span>
          <input
            type="month"
            value={competence}
            onChange={(event) => setCompetence(event.target.value)}
          />
        </label>
      </section>
      {!data && loading ? (
        <LoadingSkeleton variant="metrics" label="Carregando indicadores…" />
      ) : (
        data && (
          <RefreshingContent refreshing={loading}>
            <>
              <div className="metrics dashboard-metrics">
                {metrics.map(([key, title, , financial]) => (
                  <button
                    className="dashboard-kpi"
                    key={key}
                    aria-pressed={selectedMetric === key}
                    onClick={() =>
                      setSelectedMetric(selectedMetric === key ? null : key)
                    }
                  >
                    <MetricCard
                      label={title}
                      value={financial ? money(data[key]) : display(data[key])}
                      {...(Number(data[key]) > 0 && !financial
                        ? { tone: "warning" }
                        : {})}
                    />
                  </button>
                ))}
              </div>
              {selectedMetric && (
                <section
                  className="panel dashboard-drilldown"
                  aria-live="polite"
                >
                  <div className="section-heading">
                    <h2>{selectedTitle}</h2>
                    <button
                      className="secondary"
                      onClick={() => setSelectedMetric(null)}
                    >
                      Fechar
                    </button>
                  </div>
                  {metricDetails.length ? (
                    <div className="table-scroll">
                      <table>
                        <thead>
                          <tr>
                            <th>Registro</th>
                            <th>Detalhe</th>
                            <th>Prazo</th>
                            <th>Valor</th>
                          </tr>
                        </thead>
                        <tbody>
                          {metricDetails.map((row) => (
                            <tr key={String(row.id)}>
                              <td>
                                <button
                                  className="link-button"
                                  onClick={() => navigate?.(String(row.href))}
                                >
                                  {display(row.pessoa ?? row.descricao)}
                                </button>
                              </td>
                              <td>{display(row.unidade ?? row.descricao)}</td>
                              <td>{formatDate(row.prazo)}</td>
                              <td>
                                {row.valor == null ? "—" : money(row.valor)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <EmptyState
                      title="Nenhum registro"
                      description="Não há itens para este indicador nos filtros selecionados."
                    />
                  )}
                </section>
              )}
              <section className="panel dashboard-attention">
                <h2>Atenção necessária</h2>
                {pendings.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Pessoa</th>
                          <th>Severidade</th>
                          <th>Pendência</th>
                          <th>Prazo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pendings.slice(0, 5).map((row) => (
                          <tr key={String(row.id)}>
                            <td>
                              <button
                                className="link-button"
                                onClick={() => navigate?.(String(row.href))}
                              >
                                {display(row.pessoa)}
                              </button>
                            </td>
                            <td>
                              <StatusBadge value={row.severidade} />
                            </td>
                            <td className="wrap">{display(row.descricao)}</td>
                            <td>{formatDate(row.prazo)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    title="Nenhuma pendência encontrada"
                    description="Tudo certo por aqui."
                  />
                )}
              </section>
              <section className="panel dashboard-readiness">
                <div className="section-heading">
                  <div>
                    <h2>Preparação mensal</h2>
                    <p>
                      O mês está preparado quando cada categoria aplicável
                      estiver sem impedimentos.
                    </p>
                  </div>
                  <button
                    className="secondary"
                    onClick={() =>
                      navigate?.(
                        `/app/beneficios?unidadeId=${unit}&competencia=${competence}-01`,
                      )
                    }
                  >
                    Abrir benefícios
                  </button>
                </div>
                {readiness.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Unidade</th>
                          <th>Categoria</th>
                          <th>Adesões</th>
                          <th>Preparadas</th>
                          <th>Estado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {readiness.map((row) => (
                          <tr key={`${row.unidadeId}-${row.tipo}`}>
                            <td>{display(row.unidade)}</td>
                            <td>{display(row.tipo).replaceAll("_", " ")}</td>
                            <td>{display(row.beneficiosElegiveis)}</td>
                            <td>{display(row.competenciasPreparadas)}</td>
                            <td>
                              <StatusBadge
                                value={String(row.estado).replaceAll("_", " ")}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <EmptyState
                    title="Sem categorias aplicáveis"
                    description="Não há adesões de benefício vigentes nesta competência."
                  />
                )}
              </section>
            </>
          </RefreshingContent>
        )
      )}
    </>
  );
}

export function LegacyDashboard({
  navigate,
}: {
  navigate?: (path: string) => void;
}) {
  const [data, setData] = useState<Row | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    void api("dashboard")
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, []);
  const metrics: Record<string, string> = {
    pessoasAtivas: "Pessoas ativas",
    cltsAtivos: "CLTs ativos",
    estagiariosAtivos: "Estagiários ativos",
    aprendizesAtivos: "Aprendizes ativos",
    feriasProximas: "Férias próximas do prazo",
    feriasPendentes: "Férias vencidas / pendentes",
    descansosProximos: "Descansos próximos",
    documentosProximos: "Documentos / seguros",
    beneficiosPendentes: "Benefícios pendentes",
    inconsistencias: "Alertas operacionais",
    importacoesPendentes: "Importações em revisão",
  };
  const alerts = data
    ? [...((data.alertas as Row[]) ?? [])].sort((left, right) => {
        const leftDate = left.prazo
          ? new Date(String(left.prazo)).getTime()
          : Number.MAX_SAFE_INTEGER;
        const rightDate = right.prazo
          ? new Date(String(right.prazo)).getTime()
          : Number.MAX_SAFE_INTEGER;
        return leftDate - rightDate;
      })
    : [];
  return (
    <>
      <PageHeader
        title="Visão geral"
        description="Acompanhe pessoas, prazos e pendências que precisam de atenção."
      />
      <Notice text={error} error />
      {!data && !error ? (
        <>
          <LoadingSkeleton variant="metrics" label="Carregando indicadores…" />
          <section className="panel">
            <LoadingSkeleton rows={4} label="Carregando pendências…" />
          </section>
          <section className="panel">
            <LoadingSkeleton
              variant="detail"
              rows={3}
              label="Carregando atividades…"
            />
          </section>
        </>
      ) : (
        data && (
          <>
            {Number(data.pessoasAtivas) === 0 && (
              <section className="panel onboarding">
                <h2>Bem-vindo ao Duali</h2>
                <p>Configure as unidades e importe sua base para começar.</p>
                <div className="form-actions">
                  <button onClick={() => navigate?.("/app/cadastros/unidades")}>
                    Configurar unidades
                  </button>
                  <button
                    className="secondary"
                    onClick={() => navigate?.("/app/importacoes")}
                  >
                    Importar planilhas
                  </button>
                </div>
              </section>
            )}
            <section className="panel">
              <h2>Atenção necessária</h2>
              {!alerts.length ? (
                <EmptyState
                  title="Nenhuma pendência encontrada"
                  description="Tudo certo por aqui."
                />
              ) : (
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Pessoa</th>
                        <th>Categoria</th>
                        <th>Pendência</th>
                        <th>Prazo</th>
                      </tr>
                    </thead>
                    <tbody>
                      {alerts.map((row) => (
                        <tr
                          className="clickable-row"
                          tabIndex={0}
                          key={String(row.id)}
                          onClick={() => navigate?.("/app/pendencias")}
                          onKeyDown={(event) => {
                            if (event.key === "Enter")
                              navigate?.("/app/pendencias");
                          }}
                        >
                          <td>{display(row.pessoa)}</td>
                          <td>
                            <StatusBadge value={row.tipo} />
                          </td>
                          <td className="wrap">{display(row.mensagem)}</td>
                          <td>{formatDate(row.prazo)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <div className="metrics dashboard-metrics">
              {Object.entries(metrics).map(([key, title]) => {
                const warning =
                  Number(data[key]) > 0 &&
                  /Pendentes|Alertas|vencidas/i.test(title);
                return (
                  <MetricCard
                    key={key}
                    label={title}
                    value={display(data[key])}
                    {...(warning ? { tone: "warning" } : {})}
                  />
                );
              })}
            </div>
            <section className="panel">
              <h2>Atividades recentes</h2>
              {(data.atividades as Row[]).map((row) => (
                <div className="activity" key={String(row.id)}>
                  <strong>
                    {display(row.acao)} · {display(row.entidade)}
                  </strong>
                  <span>
                    {display(row.usuario)} · {display(row.criadoEm)}
                  </span>
                </div>
              ))}
            </section>
          </>
        )
      )}
    </>
  );
}
export function Reporting() {
  const [kind, setKind] = useState("pessoas"),
    [unit, setUnit] = useState(""),
    [team, setTeam] = useState(""),
    [type, setType] = useState(""),
    [status, setStatus] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [rows, setRows] = useState<Row[]>([]),
    [total, setTotal] = useState(0),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [hasLoaded, setHasLoaded] = useState(false);
  const query = new URLSearchParams({
    page: String(page),
    ...(unit ? { unidadeId: unit } : {}),
    ...(team ? { equipeId: team } : {}),
    ...(type ? { tipo: type } : {}),
    ...(status ? { status } : {}),
    ...(start ? { inicio: start } : {}),
    ...(end ? { fim: end } : {}),
    ...(q ? { q } : {}),
  }).toString();
  useEffect(() => {
    let active = true;
    setLoading(true);
    void api<{ items: Row[]; total: number }>(
      "relatorios/" + kind + "?" + query,
    )
      .then((result) => {
        if (active) {
          setRows(result.items);
          setTotal(result.total);
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
    return () => {
      active = false;
    };
  }, [kind, query]);
  async function download(format: string) {
    try {
      const blob = await apiBlob(
        "exportacoes/" + kind + "/" + format + "?" + query,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "duali-" + kind + "." + format;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <PageHeader
        title="Relatórios"
        description="Filtre a operação e exporte os resultados em Excel ou CSV."
      />
      <section className="panel">
        <p>
          O período filtra admissão em pessoas/estágios, aquisição em descanso,
          competência em benefícios e prazo nas inconsistências.
        </p>
        <div className="form-grid">
          <label>
            Relatório
            <select
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                setPage(1);
              }}
            >
              <option value="pessoas">Pessoas e vínculos</option>
              <option value="estagios">Estagiários</option>
              <option value="descansos">Férias</option>
              <option value="beneficios">Benefícios</option>
              <option value="aquisicoes-beneficios">
                Aquisições de benefícios
              </option>
              <option value="inconsistencias">Inconsistências</option>
            </select>
          </label>
          <label>
            Buscar pessoa
            <input
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            Unidade
            <Lookup
              field={{
                key: "unidadeId",
                label: "Unidade",
                resource: "unidades",
              }}
              value={unit}
              onChange={(v) => {
                setUnit(String(v));
                setPage(1);
              }}
            />
          </label>
          <label>
            Equipe
            <Lookup
              field={{ key: "equipeId", label: "Equipe", resource: "equipes" }}
              value={team}
              onChange={(v) => {
                setTeam(String(v));
                setPage(1);
              }}
            />
          </label>
          <label>
            Tipo de vínculo
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              <option>CLT</option>
              <option>ESTAGIO</option>
              <option>APRENDIZ</option>
            </select>
          </label>
          <label>
            Status do vínculo
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              <option>ATIVO</option>
              <option>AFASTADO</option>
              <option>DESLIGADO</option>
            </select>
          </label>
          <label>
            Início
            <input
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            Fim
            <input
              type="date"
              value={end}
              onChange={(e) => {
                setEnd(e.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
        <div className="form-actions">
          <button onClick={() => void download("xlsx")}>Exportar Excel</button>
          <button className="secondary" onClick={() => void download("csv")}>
            Exportar CSV
          </button>
        </div>
      </section>
      <Notice text={error} error />
      <section className="panel">
        <h2>{total} registros</h2>
        {loading && !hasLoaded ? (
          <LoadingSkeleton label="Consultando relatório…" />
        ) : (
          <RefreshingContent refreshing={loading}>
            <DataTable
              rows={rows.map((row, index) => ({ ...row, id: row.id ?? index }))}
              primaryKey="Pessoa"
              columns={reportColumns[kind]!.map((column) => ({
                key: column.key,
                label: column.label,
                mobile: column.mobile,
                ...(column.format === "money"
                  ? {
                      align: "end" as const,
                      render: (row: Row) => money(row[column.key]),
                    }
                  : {}),
                ...(column.format === "date"
                  ? { render: (row: Row) => formatDate(row[column.key]) }
                  : {}),
              }))}
              empty={
                <EmptyState
                  title="Nenhum resultado"
                  description="Não há registros para os filtros selecionados."
                />
              }
            />
          </RefreshingContent>
        )}
        <div className="pagination">
          <button
            className="secondary"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </button>
          <span>Página {page}</span>
          <button
            className="secondary"
            disabled={page * 25 >= total}
            onClick={() => setPage(page + 1)}
          >
            Próxima
          </button>
        </div>
      </section>
    </>
  );
}
export function Audit() {
  const [rows, setRows] = useState<Row[]>([]),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<Row | null>(null),
    [q, setQ] = useState(""),
    [entity, setEntity] = useState(""),
    [action, setAction] = useState(""),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [loading, setLoading] = useState(true),
    [hasLoaded, setHasLoaded] = useState(false);
  const query = new URLSearchParams({
    page: String(page),
    ...(q ? { q } : {}),
    ...(entity ? { entidade: entity } : {}),
    ...(action ? { acao: action } : {}),
    ...(start ? { inicio: start } : {}),
    ...(end ? { fim: end } : {}),
  }).toString();
  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(
      () =>
        void api<{ items: Row[]; total: number }>("auditoria?" + query)
          .then((r) => {
            setRows(r.items);
            setTotal(r.total);
            setError("");
          })
          .catch((e) => setError((e as Error).message))
          .finally(() => {
            setLoading(false);
            setHasLoaded(true);
          }),
      180,
    );
    return () => clearTimeout(timer);
  }, [query]);
  const resetPage = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };
  return (
    <>
      <PageHeader
        title="Auditoria"
        description="Consulte alterações e compare os valores preservados antes e depois."
      />
      <Notice text={error} error />
      <section className="panel filter-panel">
        <div className="filter-grid">
          <label>
            <span>Buscar</span>
            <input
              value={q}
              onChange={(e) => resetPage(setQ, e.target.value)}
              placeholder="Usuário, entidade ou ação"
            />
          </label>
          <label>
            <span>Entidade</span>
            <input
              value={entity}
              onChange={(e) => resetPage(setEntity, e.target.value)}
            />
          </label>
          <label>
            <span>Ação</span>
            <input
              value={action}
              onChange={(e) => resetPage(setAction, e.target.value)}
            />
          </label>
          <label>
            <span>De</span>
            <input
              type="date"
              value={start}
              onChange={(e) => resetPage(setStart, e.target.value)}
            />
          </label>
          <label>
            <span>Até</span>
            <input
              type="date"
              value={end}
              onChange={(e) => resetPage(setEnd, e.target.value)}
            />
          </label>
        </div>
      </section>
      <section className="panel">
        {loading && !hasLoaded ? (
          <LoadingSkeleton label="Carregando eventos de auditoria…" />
        ) : (
          <RefreshingContent refreshing={loading}>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Usuário</th>
                    <th>Ação</th>
                    <th>Entidade</th>
                    <th>Detalhes</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={String(row.id)}>
                      <td>{formatDate(row.criadoEm)}</td>
                      <td>{display(row.usuario)}</td>
                      <td>{display(row.acao)}</td>
                      <td>{display(row.entidade)}</td>
                      <td>
                        <button
                          className="secondary compact"
                          onClick={() => setSelected(row)}
                        >
                          Ver alteração
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!rows.length && (
              <EmptyState
                title="Nenhum evento"
                description="Não há eventos para os filtros selecionados."
              />
            )}
          </RefreshingContent>
        )}
        <Pagination page={page} total={total} onChange={setPage} />
      </section>
      {selected && (
        <section className="panel">
          <h2>
            {display(selected.acao)} · {display(selected.entidade)}
          </h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Campo</th>
                  <th>Antes</th>
                  <th>Depois</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ...new Set([
                    ...Object.keys((selected.dadosAnteriores ?? {}) as Row),
                    ...Object.keys((selected.dadosNovos ?? {}) as Row),
                  ]),
                ].map((key) => (
                  <tr key={key}>
                    <td>{key}</td>
                    <td>
                      {display((selected.dadosAnteriores as Row | null)?.[key])}
                    </td>
                    <td>
                      {display((selected.dadosNovos as Row | null)?.[key])}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
