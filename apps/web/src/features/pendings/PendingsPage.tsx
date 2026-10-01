import { useCallback, useEffect, useMemo, useState } from "react";
import { api, display, type Row } from "../../api";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  FilterChip,
  FormField,
  LoadingSkeleton,
  MetricCard,
  Notice,
  PageHeader,
  RefreshingContent,
  Select,
  type DataTableColumn,
} from "../../components/ui";

type Navigate = (path: string) => void;
type ListResponse = {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
};

const modules = ["IMPORTACAO", "VINCULO", "ESTAGIO", "DESCANSO", "BENEFICIO"];
const severities = ["CRITICA", "ATENCAO", "REVISAO"];
const severityPresentation: Record<
  string,
  { label: string; tone: "danger" | "warning" | "review" | "info" }
> = {
  CRITICA: { label: "Crítica", tone: "danger" },
  ATENCAO: { label: "Atenção", tone: "warning" },
  REVISAO: { label: "Revisão", tone: "review" },
  INFORMATIVA: { label: "Informativa", tone: "info" },
};

function SeverityBadge({ value }: { value: unknown }) {
  const presentation = severityPresentation[String(value)] ?? {
    label: display(value),
    tone: "info" as const,
  };
  return <Badge tone={presentation.tone}>{presentation.label}</Badge>;
}

export function PendingsPage({ navigate }: { navigate: Navigate }) {
  const [items, setItems] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [summary, setSummary] = useState<Row>({});
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [module, setModule] = useState("");
  const [severity, setSeverity] = useState("");

  const load = useCallback(() => {
    let active = true;
    setLoading(true);
    const query = new URLSearchParams({
      ...(module ? { modulo: module } : {}),
      ...(severity ? { severidade: severity } : {}),
      pageSize: "100",
    });
    void Promise.all([
      api<ListResponse>(`pendencias?${query}`),
      api<Row>("pendencias/resumo"),
    ])
      .then(([list, totals]) => {
        if (!active) return;
        setItems(list.items);
        setTotal(list.total);
        setSummary(totals);
        setError("");
      })
      .catch((reason) => {
        if (active) setError((reason as Error).message);
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
  }, [module, severity, reloadKey]);
  useEffect(() => load(), [load]);

  const columns = useMemo<DataTableColumn<Row>[]>(
    () => [
      {
        key: "pessoa",
        label: "Pessoa",
        priority: "primary",
        render: (item) => display(item.pessoa),
      },
      {
        key: "severidade",
        label: "Severidade",
        priority: "always",
        render: (item) => <SeverityBadge value={item.severidade} />,
      },
      {
        key: "codigo",
        label: "Tipo",
        priority: "secondary",
        render: (item) => <Badge>{display(item.codigo)}</Badge>,
      },
      {
        key: "modulo",
        label: "Módulo",
        priority: "secondary",
        render: (item) => display(item.modulo),
      },
      {
        key: "origem",
        label: "Origem",
        priority: "desktop",
        render: (item) => display(item.origem),
      },
      {
        key: "descricao",
        label: "Descrição",
        priority: "secondary",
        render: (item) => display(item.descricao),
      },
      {
        key: "acao",
        label: "Ação",
        priority: "always",
        render: (item) => (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => navigate(String(item.href))}
          >
            Revisar
          </Button>
        ),
      },
    ],
    [navigate],
  );
  const filtered = Boolean(module || severity);
  const globalTotal = Number(summary.total ?? 0);

  return (
    <div className="pendings-page page-stack">
      <PageHeader
        title="Pendências"
        description="Dados que precisam de correção, conferência ou uma decisão humana."
      />

      {error && hasLoaded && items.length > 0 && <Notice text={error} error />}
      {loading && !hasLoaded ? (
        <LoadingSkeleton variant="metrics" label="Carregando pendências…" />
      ) : !hasLoaded ||
        (error && items.length === 0 && Object.keys(summary).length === 0) ? (
        <EmptyState
          title="Não foi possível carregar as pendências"
          description={error || "Tente novamente."}
          action={
            <Button onClick={() => setReloadKey((value) => value + 1)}>
              Tentar novamente
            </Button>
          }
        />
      ) : (
        <RefreshingContent refreshing={loading} preserveContentAccess>
          <section
            className="pendings-page__metrics"
            aria-label="Resumo global de pendências"
          >
            {(
              [
                ["Críticas", "criticas", "danger"],
                ["Atenção", "atencao", "warning"],
                ["Dados para revisão", "revisao", "review"],
                ["Dependências", "dependencias", "neutral"],
              ] as const
            ).map(([label, key, tone]) => (
              <MetricCard
                key={key}
                label={label}
                value={String(summary[key] ?? 0)}
                tone={tone}
                supportingText="Total global"
              />
            ))}
          </section>
        </RefreshingContent>
      )}

      <section
        className="panel pendings-page__filters"
        aria-label="Filtros de pendências"
      >
        <div className="pendings-page__filter-fields">
          <FormField label="Módulo" id="pendings-module">
            <Select
              value={module}
              onChange={(event) => setModule(event.target.value)}
            >
              <option value="">Todos</option>
              {modules.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label="Severidade" id="pendings-severity">
            <Select
              value={severity}
              onChange={(event) => setSeverity(event.target.value)}
            >
              <option value="">Todas</option>
              {severities.map((value) => (
                <option key={value} value={value}>
                  {severityPresentation[value]?.label}
                </option>
              ))}
            </Select>
          </FormField>
        </div>
        {filtered && (
          <div className="pendings-page__chips" aria-label="Filtros aplicados">
            {module && (
              <FilterChip
                label={`Módulo: ${module}`}
                onRemove={() => setModule("")}
              />
            )}
            {severity && (
              <FilterChip
                label={`Severidade: ${severityPresentation[severity]?.label ?? severity}`}
                onRemove={() => setSeverity("")}
              />
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setModule("");
                setSeverity("");
              }}
            >
              Limpar filtros
            </Button>
          </div>
        )}
      </section>

      <section
        className="panel pendings-page__list"
        aria-labelledby="pendings-list-title"
      >
        <div className="pendings-page__list-heading">
          <div>
            <h2 id="pendings-list-title">Itens para revisão</h2>
            <p>{total} pendência(s) nos filtros atuais</p>
          </div>
          {total > items.length && (
            <span>
              {items.length} de {total} itens exibidos
            </span>
          )}
        </div>
        {loading && !hasLoaded ? (
          <LoadingSkeleton label="Carregando pendências…" />
        ) : (
          <RefreshingContent refreshing={loading} preserveContentAccess>
            <DataTable
              columns={columns}
              rows={items}
              responsiveStrategy="expandable"
              expandButtonText="Mais"
              getRowLabel={(item) => display(item.pessoa ?? item.codigo)}
              empty={
                globalTotal === 0 ? (
                  <EmptyState
                    title="Nenhuma pendência existente"
                    description="Não há dados aguardando correção, conferência ou decisão."
                  />
                ) : (
                  <EmptyState
                    title="Nenhuma pendência para estes filtros"
                    description="Existem pendências, mas nenhuma corresponde à combinação selecionada."
                    action={
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setModule("");
                          setSeverity("");
                        }}
                      >
                        Limpar filtros
                      </Button>
                    }
                  />
                )
              }
            />
          </RefreshingContent>
        )}
      </section>
    </div>
  );
}
