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
  EmptyState,
  LoadingSkeleton,
  MetricCard,
  money,
  PageHeader,
  Pagination,
  RefreshingContent,
  StatusBadge,
  formatDate,
  FormSheet,
  useFormDirty,
} from "./ui";
import { Notice, RecordForm } from "./components";
import { screens } from "./resources";

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
