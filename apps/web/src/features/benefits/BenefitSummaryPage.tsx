import { useEffect, useState } from "react";
import { api, display, type Row } from "../../api";
import {
  Button,
  DataTable,
  EmptyState,
  LoadingSkeleton,
  MetricCard,
  Notice,
  PageHeader,
  RefreshingContent,
  StatusBadge,
  money,
  type DataTableColumn,
} from "../../components/ui";
import { MonthlyBenefitChart } from "../../MonthlyBenefitChart";
import {
  type BenefitCycleSummary,
  type CycleUnitSummary,
  occurrenceLabels,
} from "./benefitCycleModel";

function moveMonth(month: string, offset: number) {
  const value = new Date(`${month}-01T00:00:00.000Z`);
  value.setUTCMonth(value.getUTCMonth() + offset);
  return value.toISOString().slice(0, 7);
}

export function BenefitSummaryPage({
  navigate,
}: {
  navigate: (path: string) => void;
}) {
  const initial = new URLSearchParams(location.search);
  const now = new Date();
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const [unit, setUnit] = useState(initial.get("unidadeId") ?? "");
  const [month, setMonth] = useState(
    initial.get("competencia")?.slice(0, 7) ?? currentMonth,
  );
  const [category, setCategory] = useState(initial.get("categoria") ?? "");
  const [units, setUnits] = useState<Row[]>([]);
  const [summary, setSummary] = useState<BenefitCycleSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    let active = true;
    void api<{ items: Row[]; total: number }>("unidades?pageSize=100")
      .then(async (first) => {
        const rest = await Promise.all(
          Array.from(
            { length: Math.max(0, Math.ceil(first.total / 100) - 1) },
            (_, index) =>
              api<{ items: Row[] }>(`unidades?pageSize=100&page=${index + 2}`),
          ),
        );
        if (active)
          setUnits([...first.items, ...rest.flatMap((page) => page.items)]);
      })
      .catch((cause) => active && setError((cause as Error).message));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams({ competencia: `${month}-01` });
    if (unit) params.set("unidadeId", unit);
    if (category) params.set("categoria", category);
    history.replaceState(null, "", `${location.pathname}?${params}`);
  }, [unit, month, category]);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ competencia: `${month}-01` });
    if (unit) params.set("unidadeId", unit);
    setLoading(true);
    void api<BenefitCycleSummary>(`beneficios/resumo?${params}`)
      .then((result) => {
        if (!active) return;
        setSummary({
          ...result,
          unidades: (result.unidades ?? []).map((row) => ({
            ...row,
            id: row.unidadeId,
          })),
        });
        setError("");
      })
      .catch((cause) => active && setError((cause as Error).message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [unit, month, reloadVersion]);

  const context = () => {
    const params = new URLSearchParams({ competencia: `${month}-01` });
    if (unit) params.set("unidadeId", unit);
    if (category) params.set("categoria", category);
    return params;
  };
  const go = (path: string) => navigate(`${path}?${context()}`);
  const columns: DataTableColumn<CycleUnitSummary>[] = [
    { key: "unidade", label: "Unidade", priority: "always" },
    {
      key: "pessoasPrevistas",
      label: "Pessoas previstas",
      align: "end",
      priority: "secondary",
      render: (row) => (row.possuiPrevisao ? row.pessoasPrevistas : "—"),
    },
    {
      key: "valorPrevisto",
      label: "Previsto",
      align: "end",
      priority: "always",
      render: (row) => (row.possuiPrevisao ? money(row.valorPrevisto) : "—"),
    },
    {
      key: "valorSolicitado",
      label: "Solicitado",
      align: "end",
      priority: "secondary",
      render: (row) => money(row.valorSolicitado),
    },
    {
      key: "valorConcluido",
      label: "Concluído",
      align: "end",
      priority: "secondary",
      render: (row) => money(row.valorConcluido),
    },
    {
      key: "saldoPendente",
      label: "Pendente",
      align: "end",
      priority: "secondary",
      render: (row) => money(row.saldoPendente),
    },
    {
      key: "estado",
      label: "Situação",
      priority: "always",
      render: (row) => <StatusBadge value={row.estado} />,
    },
  ];
  const notices = [
    ...new Set([
      ...(summary?.ocorrencias ?? []),
      ...(summary?.impedimentos ?? []),
    ]),
  ];

  return (
    <div className="page-stack benefits-page benefit-summary-page">
      <PageHeader
        title="Benefícios"
        description="Compare a previsão, os pedidos e a conclusão financeira de cada competência."
        action={
          <div className="benefits-header-actions">
            <Button onClick={() => go("/app/beneficios/aquisicao")}>
              Fazer pedido
            </Button>
            <Button
              variant="secondary"
              onClick={() => go("/app/beneficios/competencias")}
            >
              Competências
            </Button>
          </div>
        }
      />
      <section
        className="panel benefits-context"
        aria-label="Contexto do ciclo mensal"
      >
        <div className="benefits-month-navigation">
          <Button
            variant="ghost"
            aria-label="Competência anterior"
            onClick={() => setMonth(moveMonth(month, -1))}
          >
            ‹
          </Button>
          <label>
            <span>Competência</span>
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
          <Button
            variant="ghost"
            aria-label="Próxima competência"
            onClick={() => setMonth(moveMonth(month, 1))}
          >
            ›
          </Button>
        </div>
        <label>
          <span>Unidade</span>
          <select
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
          </select>
        </label>
      </section>
      {error && (
        <div className="benefits-error">
          <Notice text={error} error />
          <Button
            variant="secondary"
            onClick={() => setReloadVersion((value) => value + 1)}
          >
            Tentar novamente
          </Button>
        </div>
      )}
      {!summary && loading ? (
        <LoadingSkeleton variant="metrics" label="Carregando benefícios…" />
      ) : !summary ? (
        <EmptyState
          title="Não foi possível carregar o ciclo"
          description="Altere a competência ou recarregue a página para tentar novamente."
        />
      ) : (
        <RefreshingContent refreshing={loading}>
          <div className="benefit-summary-metrics">
            <MetricCard
              label="Valor previsto"
              value={summary.previsaoPersistida ? money(summary.previsto) : "—"}
              supportingText={
                summary.previsaoPersistida
                  ? "Previsão persistida"
                  : "Sem previsão"
              }
            />
            <MetricCard
              label="Valor solicitado"
              value={money(summary.solicitado)}
              supportingText="Pedidos operacionais vigentes"
            />
            <MetricCard
              label="Valor concluído"
              value={money(summary.concluido)}
              supportingText="Confirmações menos reversões"
            />
            <MetricCard
              label="Pessoas previstas"
              value={
                summary.previsaoPersistida ? summary.pessoasPrevistas : "—"
              }
              supportingText={
                summary.previsaoPersistida
                  ? "Vínculos únicos incluídos"
                  : "Sem previsão"
              }
            />
          </div>
          {!summary.previsaoPersistida && summary.cicloMensal.length > 0 && (
            <Notice
              tone="info"
              text="Sem previsão persistida. Os pedidos permanecem visíveis sem reconstrução retroativa do previsto."
            />
          )}
          {notices.length > 0 && (
            <div className="benefits-notices" aria-label="Ocorrências do ciclo">
              {notices.map((item) => (
                <Notice
                  key={item}
                  tone="warning"
                  text={occurrenceLabels[item] ?? item.replaceAll("_", " ")}
                />
              ))}
            </div>
          )}
          <section className="panel benefit-summary-chart">
            <h2>Ciclo mensal</h2>
            <MonthlyBenefitChart
              rows={summary.cicloMensal}
              unit={unit}
              category={category}
              competence={month}
              setUnit={setUnit}
              setCategory={setCategory}
            />
          </section>
          <section className="panel benefits-unit-section">
            <header>
              <h2>Resumo por unidade</h2>
              <p>Valores financeiros do ciclo e situação operacional.</p>
            </header>
            <DataTable
              columns={columns}
              rows={summary.unidades}
              responsiveStrategy="scroll"
              empty={
                <EmptyState
                  title={
                    unit
                      ? "Nenhum resultado para a unidade"
                      : "Competência sem movimentação"
                  }
                  description={
                    unit
                      ? "Altere a unidade ou a competência."
                      : "Não há previsão ou pedidos registrados nesta competência."
                  }
                />
              }
            />
          </section>
        </RefreshingContent>
      )}
    </div>
  );
}
