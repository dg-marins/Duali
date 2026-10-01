import { useCallback, useEffect, useMemo, useState } from "react";
import { api, display, type Row } from "../../api";
import { MonthlyBenefitChart } from "../../MonthlyBenefitChart";
import {
  Badge,
  Button,
  DataTable,
  EmptyState,
  FormField,
  Input,
  LoadingSkeleton,
  MetricCard,
  Notice,
  PageHeader,
  RefreshingContent,
  Select,
  type DataTableColumn,
  money,
} from "../../components/ui";
import { formatDate } from "../../ui";

type Navigate = (path: string) => void;
type MetricKey =
  | "custoBeneficios"
  | "pendenciasCriticas"
  | "contratosVencendo"
  | "tcesAguardandoAssinatura"
  | "feriasAtencao"
  | "divergenciasBeneficios";
type MetricDefinition = {
  key: MetricKey;
  label: string;
  financial: boolean;
};

const metrics: MetricDefinition[] = [
  {
    key: "custoBeneficios",
    label: "Custo de benefícios no mês",
    financial: true,
  },
  {
    key: "pendenciasCriticas",
    label: "Pendências críticas",
    financial: false,
  },
  {
    key: "contratosVencendo",
    label: "Contratos vencendo em 30 dias",
    financial: false,
  },
  {
    key: "tcesAguardandoAssinatura",
    label: "TCEs aguardando assinatura",
    financial: false,
  },
  {
    key: "feriasAtencao",
    label: "Férias exigindo atenção",
    financial: false,
  },
  {
    key: "divergenciasBeneficios",
    label: "Divergências de benefícios",
    financial: false,
  },
];

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

function urlState() {
  const params = new URLSearchParams(location.search);
  const now = new Date();
  return {
    unit: params.get("unidadeId") ?? "",
    competence:
      params.get("competencia")?.slice(0, 7) ??
      `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`,
    category: params.get("categoria") ?? "",
  };
}

export function DashboardPage({ navigate }: { navigate?: Navigate }) {
  const initial = urlState();
  const [unit, setUnit] = useState(initial.unit);
  const [competence, setCompetence] = useState(initial.competence);
  const [category, setCategory] = useState(initial.category);
  const [units, setUnits] = useState<Row[]>([]);
  const [data, setData] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedMetric, setSelectedMetric] = useState<MetricKey | null>(null);

  useEffect(() => {
    void api<{ items: Row[] }>("unidades?pageSize=100")
      .then((result) => setUnits(result.items))
      .catch(() => undefined);
  }, []);
  useEffect(() => {
    const sync = () => {
      const next = urlState();
      setUnit(next.unit);
      setCompetence(next.competence);
      setCategory(next.category);
    };
    addEventListener("popstate", sync);
    return () => removeEventListener("popstate", sync);
  }, []);
  useEffect(() => {
    const params = new URLSearchParams();
    if (unit) params.set("unidadeId", unit);
    params.set("competencia", `${competence}-01`);
    if (category) params.set("categoria", category);
    history.replaceState(null, "", `${location.pathname}?${params}`);
  }, [unit, competence, category]);

  const load = useCallback(() => {
    let active = true;
    const params = new URLSearchParams({ competencia: `${competence}-01` });
    if (unit) params.set("unidadeId", unit);
    setLoading(true);
    void api<Row>(`dashboard?${params}`)
      .then((result) => {
        if (!active) return;
        setData(result);
        setError("");
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
  }, [unit, competence, reloadKey]);
  useEffect(() => load(), [load]);

  const pendings = Array.isArray(data?.pendenciasPrioritarias)
    ? (data.pendenciasPrioritarias as Row[])
    : [];
  const monthlyPreparation = Array.isArray(data?.preparacaoMensalPorFornecedor)
    ? (data.preparacaoMensalPorFornecedor as Row[])
    : [];
  const metricDetails =
    selectedMetric &&
    Array.isArray((data?.kpiDetalhes as Row | undefined)?.[selectedMetric])
      ? ((data?.kpiDetalhes as Row)[selectedMetric] as Row[])
      : [];
  const selectedDefinition = metrics.find(
    (metric) => metric.key === selectedMetric,
  );
  const financialDetail =
    selectedMetric === "custoBeneficios" ||
    selectedMetric === "divergenciasBeneficios";

  const detailColumns = useMemo<DataTableColumn<Row>[]>(
    () => [
      {
        key: "registro",
        label: "Registro",
        priority: "primary",
        render: (row) => (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate?.(String(row.href))}
          >
            {display(row.pessoa ?? row.descricao)}
          </Button>
        ),
      },
      {
        key: "detalhe",
        label: "Detalhe",
        priority: financialDetail ? "always" : "secondary",
        render: (row) => display(row.unidade ?? row.descricao),
      },
      {
        key: "prazo",
        label: "Prazo",
        priority: "secondary",
        render: (row) => formatDate(row.prazo),
      },
      {
        key: "valor",
        label: "Valor",
        align: "end",
        priority: financialDetail ? "always" : "secondary",
        render: (row) => (row.valor == null ? "—" : money(row.valor)),
      },
    ],
    [financialDetail, navigate],
  );

  const attentionColumns = useMemo<DataTableColumn<Row>[]>(
    () => [
      {
        key: "pessoa",
        label: "Pessoa",
        priority: "primary",
        render: (row) => display(row.pessoa),
      },
      {
        key: "severidade",
        label: "Severidade",
        priority: "always",
        render: (row) => <SeverityBadge value={row.severidade} />,
      },
      {
        key: "descricao",
        label: "Pendência",
        priority: "secondary",
        render: (row) => display(row.descricao),
      },
      {
        key: "prazo",
        label: "Prazo",
        priority: "desktop",
        render: (row) => formatDate(row.prazo),
      },
    ],
    [],
  );

  return (
    <div className="dashboard-page page-stack">
      <PageHeader
        title="Visão geral"
        description="Acompanhe pessoas, prazos e pendências que precisam de atenção."
      />
      <section
        className="panel dashboard-page__filters"
        aria-label="Filtros do dashboard"
      >
        <FormField label="Unidade" id="dashboard-unit">
          <Select
            value={unit}
            onChange={(event) => {
              setUnit(event.target.value);
              setCategory("");
            }}
          >
            <option value="">Todas as unidades</option>
            {units.map((item) => (
              <option key={String(item.id)} value={String(item.id)}>
                {display(item)}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Competência" id="dashboard-competence">
          <Input
            type="month"
            value={competence}
            onChange={(event) => setCompetence(event.target.value)}
          />
        </FormField>
      </section>

      {error && data && <Notice text={error} error />}
      {!data && loading ? (
        <LoadingSkeleton variant="metrics" label="Carregando indicadores…" />
      ) : !data ? (
        <EmptyState
          title="Não foi possível carregar o Dashboard"
          description={error || "Tente carregar os indicadores novamente."}
          action={
            <Button onClick={() => setReloadKey((value) => value + 1)}>
              Tentar novamente
            </Button>
          }
        />
      ) : (
        <RefreshingContent refreshing={loading} preserveContentAccess>
          <>
            <section
              className="dashboard-page__metrics"
              aria-label="Indicadores do Dashboard"
            >
              {metrics.map((metric) => {
                const value = data[metric.key];
                const active = selectedMetric === metric.key;
                const hasAttention =
                  !metric.financial && String(value ?? "0") !== "0";
                return (
                  <div key={metric.key} className="dashboard-page__metric">
                    <MetricCard
                      label={metric.label}
                      value={metric.financial ? money(value) : display(value)}
                      {...(hasAttention ? { tone: "warning" } : {})}
                      supportingText={active ? "Detalhes abertos" : undefined}
                      onClick={() =>
                        setSelectedMetric(active ? null : metric.key)
                      }
                      pressed={active}
                    />
                  </div>
                );
              })}
            </section>
            {selectedMetric && (
              <section
                className="panel dashboard-page__detail"
                aria-live="polite"
              >
                <div className="dashboard-page__section-heading">
                  <h2>{selectedDefinition?.label}</h2>
                  <Button
                    variant="secondary"
                    onClick={() => setSelectedMetric(null)}
                  >
                    Fechar
                  </Button>
                </div>
                <DataTable
                  columns={detailColumns}
                  rows={metricDetails}
                  responsiveStrategy={financialDetail ? "scroll" : "expandable"}
                  getRowLabel={(row) => display(row.pessoa ?? row.descricao)}
                  empty={
                    <EmptyState
                      title="Nenhum registro"
                      description="Não há itens para este indicador nos filtros selecionados."
                    />
                  }
                />
              </section>
            )}
            <div className="dashboard-page__operational-grid">
              <section className="panel dashboard-page__chart">
                <h2>Benefício mensal</h2>
                <MonthlyBenefitChart
                  rows={monthlyPreparation}
                  unit={unit}
                  category={category}
                  competence={competence}
                  setUnit={setUnit}
                  setCategory={setCategory}
                />
              </section>
              <section className="panel dashboard-page__attention">
                <h2>Atenção necessária</h2>
                <DataTable
                  columns={attentionColumns}
                  rows={pendings.slice(0, 5)}
                  responsiveStrategy="expandable"
                  getRowLabel={(row) => display(row.pessoa)}
                  rowActions={(row) => (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => navigate?.(String(row.href))}
                    >
                      Revisar
                    </Button>
                  )}
                  empty={
                    <EmptyState
                      title="Nenhuma pendência encontrada"
                      description="Tudo certo por aqui."
                    />
                  }
                />
              </section>
            </div>
          </>
        </RefreshingContent>
      )}
    </div>
  );
}
