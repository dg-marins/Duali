import { useEffect, useMemo, useState } from "react";
import { api, display, type Row } from "../../api";
import {
  Button,
  DataTable,
  DateInput,
  Dialog,
  EmptyState,
  FilterBar,
  FormField,
  Input,
  LoadingSkeleton,
  Notice,
  PageHeader,
  Pagination,
  RefreshingContent,
  type DataTableColumn,
} from "../../components/ui";
import { formatDate } from "../../ui";

const PAGE_SIZE = 25;

export function comparisonRows(selected: Row | null): Row[] {
  if (!selected) return [];
  const before = (selected.dadosAnteriores ?? {}) as Row;
  const after = (selected.dadosNovos ?? {}) as Row;
  return [...new Set([...Object.keys(before), ...Object.keys(after)])].map(
    (key) => ({
      id: key,
      Campo: key,
      Antes: display(before[key]),
      Depois: display(after[key]),
    }),
  );
}

export function AuditPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [q, setQ] = useState("");
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [version, setVersion] = useState(0);

  const query = useMemo(
    () =>
      new URLSearchParams({
        page: String(page),
        ...(q ? { q } : {}),
        ...(entity ? { entidade: entity } : {}),
        ...(action ? { acao: action } : {}),
        ...(start ? { inicio: start } : {}),
        ...(end ? { fim: end } : {}),
      }).toString(),
    [action, end, entity, page, q, start],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = setTimeout(() => {
      void api<{ items: Row[]; total: number }>(`auditoria?${query}`)
        .then((result) => {
          if (!active) return;
          setRows(result.items);
          setTotal(result.total);
          setError("");
        })
        .catch((cause) => {
          if (active) setError((cause as Error).message);
        })
        .finally(() => {
          if (!active) return;
          setLoading(false);
          setHasLoaded(true);
        });
    }, 180);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, version]);

  const changeFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };
  const hasFilters = Boolean(q || entity || action || start || end);
  const clearFilters = () => {
    setQ("");
    setEntity("");
    setAction("");
    setStart("");
    setEnd("");
    setPage(1);
  };
  const activeFilters = [
    q && {
      key: "q",
      label: `Busca: ${q}`,
      onRemove: () => changeFilter(setQ, ""),
    },
    entity && {
      key: "entidade",
      label: `Entidade: ${entity}`,
      onRemove: () => changeFilter(setEntity, ""),
    },
    action && {
      key: "acao",
      label: `Ação: ${action}`,
      onRemove: () => changeFilter(setAction, ""),
    },
    start && {
      key: "inicio",
      label: `De: ${formatDate(start)}`,
      onRemove: () => changeFilter(setStart, ""),
    },
    end && {
      key: "fim",
      label: `Até: ${formatDate(end)}`,
      onRemove: () => changeFilter(setEnd, ""),
    },
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    onRemove: () => void;
  }>;

  const columns: DataTableColumn[] = [
    {
      key: "criadoEm",
      label: "Data",
      priority: "primary",
      render: (row) => formatDate(row.criadoEm),
    },
    {
      key: "usuario",
      label: "Usuário",
      priority: "secondary",
      render: (row) => display(row.usuario),
    },
    {
      key: "acao",
      label: "Ação",
      priority: "always",
      render: (row) => (
        <div className="audit-action-cell">
          <span>{display(row.acao)}</span>
          <Button
            className="audit-mobile-detail-action"
            size="sm"
            variant="secondary"
            onClick={(event) => {
              event.stopPropagation();
              setSelected(row);
            }}
          >
            Ver alteração
          </Button>
        </div>
      ),
    },
    { key: "entidade", label: "Entidade", priority: "secondary" },
  ];
  const comparisons = comparisonRows(selected);

  return (
    <div className="audit-page">
      <PageHeader
        title="Auditoria"
        description="Consulte alterações e compare os valores preservados antes e depois."
      />
      {error && rows.length > 0 && <Notice text={error} error />}
      <FilterBar
        search={q}
        searchLabel="Buscar"
        searchPlaceholder="Usuário, entidade ou ação"
        onSearchChange={(value) => changeFilter(setQ, value)}
        activeFilters={activeFilters}
        onClear={clearFilters}
        primaryFilters={
          <>
            <FormField label="Entidade">
              <Input
                value={entity}
                onChange={(event) =>
                  changeFilter(setEntity, event.target.value)
                }
              />
            </FormField>
            <FormField label="Ação">
              <Input
                value={action}
                onChange={(event) =>
                  changeFilter(setAction, event.target.value)
                }
              />
            </FormField>
          </>
        }
      >
        <FormField label="De">
          <DateInput
            value={start}
            onChange={(event) => changeFilter(setStart, event.target.value)}
          />
        </FormField>
        <FormField label="Até">
          <DateInput
            value={end}
            onChange={(event) => changeFilter(setEnd, event.target.value)}
          />
        </FormField>
      </FilterBar>
      <section className="panel audit-results">
        <div className="result-count" aria-live="polite">
          {total} {total === 1 ? "evento" : "eventos"}
        </div>
        {loading && !hasLoaded ? (
          <LoadingSkeleton label="Carregando eventos de auditoria…" />
        ) : error && rows.length === 0 ? (
          <div className="audit-error">
            <Notice text={error} error />
            <Button
              variant="secondary"
              onClick={() => setVersion((current) => current + 1)}
            >
              Tentar novamente
            </Button>
          </div>
        ) : (
          <RefreshingContent refreshing={loading}>
            <DataTable
              rows={rows}
              columns={columns}
              primaryKey="criadoEm"
              responsiveStrategy="expandable"
              getRowLabel={(row) =>
                `${display(row.acao)} em ${display(row.entidade)}`
              }
              empty={
                <EmptyState
                  title={hasFilters ? "Nenhum resultado" : "Nenhum evento"}
                  description={
                    hasFilters
                      ? "Não há eventos para os filtros selecionados."
                      : "Ainda não há eventos de auditoria."
                  }
                  action={
                    hasFilters ? (
                      <Button variant="secondary" onClick={clearFilters}>
                        Limpar filtros
                      </Button>
                    ) : undefined
                  }
                />
              }
              rowActions={(row) => (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={(event) => {
                    event.stopPropagation();
                    setSelected(row);
                  }}
                >
                  Ver alteração
                </Button>
              )}
            />
          </RefreshingContent>
        )}
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onChange={setPage}
        />
      </section>
      <Dialog
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
        title={
          selected
            ? `${display(selected.acao)} · ${display(selected.entidade)}`
            : "Alteração"
        }
        description={
          selected
            ? `${formatDate(selected.criadoEm)} · ${display(selected.usuario)}`
            : undefined
        }
        size="lg"
        className="audit-detail-dialog"
      >
        <DataTable
          rows={comparisons}
          columns={[
            { key: "Campo", label: "Campo", priority: "primary" },
            { key: "Antes", label: "Antes", priority: "always" },
            { key: "Depois", label: "Depois", priority: "always" },
          ]}
          primaryKey="Campo"
          responsiveStrategy="scroll"
          empty={
            <EmptyState
              title="Sem valores comparáveis"
              description="Este evento não possui valores anteriores ou posteriores registrados."
            />
          }
        />
      </Dialog>
    </div>
  );
}

export const Audit = AuditPage;
