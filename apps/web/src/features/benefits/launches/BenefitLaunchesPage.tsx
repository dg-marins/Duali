import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ApiError, api, display, type Row } from "../../../api";
import {
  ActionMenu,
  Button,
  ConfirmDialog,
  DataTable,
  EmptyState,
  FilterBar,
  FilterChip,
  FormField,
  Input,
  LoadingSkeleton,
  Notice,
  Pagination,
  RefreshingContent,
  Select,
  Sheet,
  StatusBadge,
  Textarea,
  useFormDirty,
} from "../../../components/ui";
import { money, PageHeader } from "../../../ui";

type Navigate = (path: string) => void;
type ListResult = {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
};
type Filters = {
  q: string;
  visao: string;
  status: string;
  unidadeId: string;
  categoria: string;
  competencia: string;
  fornecedorId: string;
};

const benefitLabels: Record<string, string> = {
  ALIMENTACAO: "Alimentação",
  TRANSPORTE: "Transporte",
  CESTA_BASICA: "Cesta básica",
  PREMIACAO: "Premiação",
  OUTRO: "Outro",
};

function readLocation() {
  const query = new URLSearchParams(location.search);
  return {
    filters: {
      q: query.get("q") ?? "",
      visao: query.get("visao") ?? "",
      status: query.get("status") ?? "",
      unidadeId: query.get("unidadeId") ?? "",
      categoria: query.get("categoria") ?? "",
      competencia:
        query.get("competencia")?.slice(0, 7) ??
        new Date().toISOString().slice(0, 7),
      fornecedorId: query.get("fornecedorId") ?? "",
    } satisfies Filters,
    page: Math.max(1, Number(query.get("page") ?? 1) || 1),
  };
}

function queryString(filters: Filters, page: number) {
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
  const original = {
    days: String(competence.quantidadeDias ?? ""),
    quantity: String(competence.quantidade ?? ""),
    unitValue: String(competence.valorUnitario ?? ""),
    notes: String(competence.observacoes ?? ""),
  };
  const [days, setDays] = useState(original.days);
  const [quantity, setQuantity] = useState(original.quantity);
  const [unitValue, setUnitValue] = useState(original.unitValue);
  const [notes, setNotes] = useState(original.notes);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});
  const dirty =
    days !== original.days ||
    quantity !== original.quantity ||
    unitValue !== original.unitValue ||
    notes !== original.notes;
  useFormDirty(dirty);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
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
    } catch (cause) {
      setError((cause as Error).message);
      if (cause instanceof ApiError) setFieldErrors(cause.fields);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="benefit-launch-editor"
      onSubmit={(event) => void submit(event)}
    >
      <Notice tone="danger" text={error} />
      <div className="benefit-launch-context">
        <span>{benefitLabels[type] ?? type}</span>
        <strong>{display((benefit.vinculo as Row)?.pessoa)}</strong>
        <small>Ao salvar, o lançamento volta para Pendente.</small>
      </div>
      <div className="benefit-launch-form-grid">
        {["ALIMENTACAO", "TRANSPORTE"].includes(type) ? (
          <FormField
            label="Dias"
            required
            error={fieldErrors.quantidadeDias?.[0]}
          >
            <Input
              inputMode="decimal"
              value={days}
              onChange={(e) => setDays(e.target.value)}
            />
          </FormField>
        ) : (
          <FormField
            label="Quantidade"
            required
            error={fieldErrors.quantidade?.[0]}
          >
            <Input
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
            />
          </FormField>
        )}
        {type !== "TRANSPORTE" && (
          <FormField
            label={type === "ALIMENTACAO" ? "Valor diário" : "Valor unitário"}
            required
            error={fieldErrors.valorUnitario?.[0]}
          >
            <Input
              inputMode="decimal"
              value={unitValue}
              onChange={(e) => setUnitValue(e.target.value)}
            />
          </FormField>
        )}
        <FormField label="Observações" className="benefit-launch-wide">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormField>
      </div>
      <div className="form-actions ds-dialog__footer">
        <Button loading={saving}>Salvar alterações</Button>
        <Button type="button" variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

export function BenefitLaunchesPage({ navigate }: { navigate: Navigate }) {
  const initial = readLocation();
  const [filters, setFilters] = useState(initial.filters);
  const [page, setPage] = useState(initial.page);
  const [data, setData] = useState<ListResult>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 25,
  });
  const [units, setUnits] = useState<Row[]>([]);
  const [suppliers, setSuppliers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<Row | null>(null);
  const [canceling, setCanceling] = useState<Row | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const loadAll = async (resource: string) => {
      const first = await api<ListResult>(`${resource}?page=1&pageSize=100`);
      const rest = await Promise.all(
        Array.from(
          { length: Math.max(0, Math.ceil(first.total / 100) - 1) },
          (_, index) =>
            api<ListResult>(`${resource}?page=${index + 2}&pageSize=100`),
        ),
      );
      return [...first.items, ...rest.flatMap((item) => item.items)];
    };
    void Promise.all([loadAll("unidades"), loadAll("fornecedores")])
      .then(([nextUnits, nextSuppliers]) => {
        setUnits(nextUnits);
        setSuppliers(nextSuppliers);
      })
      .catch((cause) => setError((cause as Error).message));
  }, []);

  useEffect(() => {
    const pop = () => {
      const next = readLocation();
      setFilters(next.filters);
      setPage(next.page);
    };
    addEventListener("popstate", pop);
    return () => removeEventListener("popstate", pop);
  }, []);

  useEffect(() => {
    history.replaceState(
      {},
      "",
      `${location.pathname}?${queryString(filters, page)}`,
    );
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      void api<ListResult>(
        `beneficios-operacional?${queryString(filters, page)}`,
      )
        .then((result) => {
          if (!active) return;
          setData(result);
          setError("");
        })
        .catch((cause) => active && setError((cause as Error).message))
        .finally(() => {
          if (active) {
            setLoading(false);
            setLoaded(true);
          }
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [filters, page, version]);

  const update = (key: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };
  const activeFilters = useMemo(
    () =>
      [
        filters.unidadeId && {
          key: "unidadeId",
          label: `Unidade: ${display(units.find((row) => row.id === filters.unidadeId))}`,
        },
        filters.fornecedorId && {
          key: "fornecedorId",
          label: `Fornecedor: ${display(suppliers.find((row) => row.id === filters.fornecedorId))}`,
        },
        filters.categoria && {
          key: "categoria",
          label: benefitLabels[filters.categoria] ?? filters.categoria,
        },
        filters.status && {
          key: "status",
          label: `Situação: ${filters.status}`,
        },
        filters.visao && { key: "visao", label: `Visão: ${filters.visao}` },
      ].filter(Boolean) as Array<{ key: keyof Filters; label: string }>,
    [filters, suppliers, units],
  );

  async function act(row: Row, action: "conferir" | "cancelar") {
    if (pendingAction) return;
    setPendingAction(`${row.id}:${action}`);
    setError("");
    try {
      await api(`competencias/${row.id}/${action}`, "POST", {});
      setCanceling(null);
      setVersion((current) => current + 1);
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="benefit-launches-page page-stack">
      <PageHeader
        title="Lançamentos de benefícios"
        description="Consulte, confira e corrija lançamentos mensais já existentes."
        action={
          <Button
            variant="secondary"
            onClick={() =>
              navigate(
                `/app/beneficios?competencia=${filters.competencia}-01${filters.unidadeId ? `&unidadeId=${filters.unidadeId}` : ""}${filters.categoria ? `&categoria=${filters.categoria}` : ""}`,
              )
            }
          >
            Voltar ao resumo
          </Button>
        }
      />
      <Notice tone="danger" text={error} />
      <section className="panel benefit-launch-filters">
        <FilterBar
          search={filters.q}
          searchLabel="Buscar pessoa"
          onSearchChange={(value) => update("q", value)}
        >
          <FormField label="Visão">
            <Select
              value={filters.visao}
              onChange={(e) => update("visao", e.target.value)}
            >
              <option value="">Todas</option>
              <option value="previsto">Previsto</option>
              <option value="comprado">Com compra líquida</option>
              <option value="pedido">Em pedido</option>
              <option value="pendente">Aguardando conferência</option>
            </Select>
          </FormField>
          <FormField label="Situação">
            <Select
              value={filters.status}
              onChange={(e) => update("status", e.target.value)}
            >
              <option value="">Todas</option>
              <option>PENDENTE</option>
              <option>CONFERIDO</option>
              <option>PAGO</option>
              <option>CANCELADO</option>
            </Select>
          </FormField>
          <FormField label="Unidade">
            <Select
              value={filters.unidadeId}
              onChange={(e) => update("unidadeId", e.target.value)}
            >
              <option value="">Todas</option>
              {units.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {display(row)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Benefício">
            <Select
              value={filters.categoria}
              onChange={(e) => update("categoria", e.target.value)}
            >
              <option value="">Todos</option>
              {Object.entries(benefitLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Competência">
            <Input
              type="month"
              value={filters.competencia}
              onChange={(e) => update("competencia", e.target.value)}
            />
          </FormField>
          <FormField label="Fornecedor">
            <Select
              value={filters.fornecedorId}
              onChange={(e) => update("fornecedorId", e.target.value)}
            >
              <option value="">Todos</option>
              {suppliers.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {display(row)}
                </option>
              ))}
            </Select>
          </FormField>
        </FilterBar>
        {activeFilters.length > 0 && (
          <div className="filter-chips" aria-label="Filtros ativos">
            {activeFilters.map((item) => (
              <FilterChip
                key={item.key}
                label={item.label}
                onRemove={() => update(item.key, "")}
              />
            ))}
          </div>
        )}
      </section>
      <section className="panel">
        {!loaded && loading ? (
          <LoadingSkeleton label="Carregando lançamentos…" />
        ) : (
          <RefreshingContent refreshing={loading}>
            <p className="result-count">
              {data.total}{" "}
              {data.total === 1
                ? "lançamento encontrado"
                : "lançamentos encontrados"}
            </p>
            <DataTable
              rows={data.items}
              responsiveStrategy="expandable"
              primaryKey="pessoa"
              getRowLabel={(row) =>
                `Lançamento de ${display(((row.beneficioVinculo as Row).vinculo as Row).pessoa)}`
              }
              expandButtonText="Dados do lançamento"
              empty={
                <EmptyState
                  title={
                    activeFilters.length || filters.q
                      ? "Nenhum lançamento corresponde aos filtros"
                      : "Nenhum lançamento nesta competência"
                  }
                  description={
                    activeFilters.length || filters.q
                      ? "Revise ou remova os filtros aplicados."
                      : "Os lançamentos aparecerão após serem preparados pelo fluxo operacional."
                  }
                />
              }
              columns={[
                {
                  key: "pessoa",
                  label: "Pessoa",
                  priority: "primary",
                  render: (row) => {
                    const link = (row.beneficioVinculo as Row).vinculo as Row;
                    return (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(event) => {
                          event.stopPropagation();
                          navigate(
                            `/app/pessoas/${link.pessoaId}?tab=beneficios&competencia=${filters.competencia}-01`,
                          );
                        }}
                      >
                        {display(link.pessoa)}
                      </Button>
                    );
                  },
                },
                {
                  key: "unidade",
                  label: "Unidade",
                  priority: "secondary",
                  render: (row) =>
                    display(
                      ((row.beneficioVinculo as Row).vinculo as Row).unidade,
                    ),
                },
                {
                  key: "beneficio",
                  label: "Benefício",
                  priority: "always",
                  render: (row) =>
                    benefitLabels[String((row.beneficioVinculo as Row).tipo)] ??
                    display((row.beneficioVinculo as Row).tipo),
                },
                {
                  key: "fornecedor",
                  label: "Fornecedor",
                  priority: "secondary",
                  render: (row) =>
                    display((row.configuracao as Row).fornecedor),
                },
                {
                  key: "dias",
                  label: "Dias",
                  priority: "secondary",
                  render: (row) => display(row.quantidadeDias),
                },
                {
                  key: "valor",
                  label: "Valor",
                  priority: "always",
                  align: "end",
                  render: (row) => money(row.valorFinal),
                },
                {
                  key: "status",
                  label: "Situação",
                  priority: "always",
                  render: (row) => <StatusBadge value={row.status} />,
                },
                {
                  key: "acoes",
                  label: "Ações",
                  priority: "always",
                  render: (row) => {
                    const editable = ["PENDENTE", "CONFERIDO"].includes(
                      String(row.status),
                    );
                    const link = (row.beneficioVinculo as Row).vinculo as Row;
                    return (
                      <div onClick={(e) => e.stopPropagation()}>
                        <ActionMenu
                          label={`Ações do lançamento de ${display(link.pessoa)}`}
                          items={[
                            {
                              label: "Editar lançamento",
                              disabled: !editable,
                              onSelect: () => setEditing(row),
                            },
                            {
                              label:
                                pendingAction === `${row.id}:conferir`
                                  ? "Conferindo…"
                                  : "Marcar como conferido",
                              disabled:
                                row.status !== "PENDENTE" ||
                                Boolean(pendingAction),
                              onSelect: () => void act(row, "conferir"),
                            },
                            {
                              label: "Cancelar lançamento",
                              disabled: !editable || Boolean(pendingAction),
                              tone: "danger",
                              onSelect: () => setCanceling(row),
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
                      </div>
                    );
                  },
                },
              ]}
            />
          </RefreshingContent>
        )}
        <Pagination
          page={page}
          total={data.total}
          pageSize={data.pageSize || 25}
          onChange={setPage}
        />
      </section>
      <Sheet
        open={Boolean(editing)}
        onOpenChange={(open) => !open && setEditing(null)}
        title="Editar lançamento mensal"
        description="A alteração preserva o histórico e retorna o lançamento para Pendente."
        size="lg"
      >
        {editing && (
          <CompetenceEditor
            competence={editing}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              setVersion((current) => current + 1);
            }}
          />
        )}
      </Sheet>
      <ConfirmDialog
        open={Boolean(canceling)}
        onOpenChange={(open) => !open && setCanceling(null)}
        title="Cancelar lançamento?"
        description="O lançamento mensal será cancelado. A adesão recorrente e o histórico da pessoa serão preservados."
        confirmLabel={pendingAction ? "Cancelando…" : "Cancelar lançamento"}
        onConfirm={() => canceling && void act(canceling, "cancelar")}
      />
    </div>
  );
}
