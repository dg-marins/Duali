import { useEffect, useState } from "react";
import { api, display, type Row } from "../../api";
import { Notice } from "../../components";
import { MonthlyBenefitChart } from "../../MonthlyBenefitChart";
import { LoadingSkeleton, money, RefreshingContent } from "../../ui";

type Summary = {
  previsto: string;
  solicitado: string;
  concluido: string;
  compradoLiquido: string;
  emPedido: string;
  cicloMensal: Row[];
  previsaoPersistida: boolean;
  lancamentosPendentes: number;
};

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
  const [summary, setSummary] = useState<Summary | null>(null);
  const [chartRows, setChartRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void api<{ items: Row[]; total: number }>("unidades?pageSize=100")
      .then(async (first) => {
        const pages = Math.ceil(first.total / 100);
        const rest = await Promise.all(
          Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
            api<{ items: Row[] }>(`unidades?pageSize=100&page=${index + 2}`),
          ),
        );
        if (active)
          setUnits([...first.items, ...rest.flatMap((page) => page.items)]);
      })
      .catch((cause) => {
        if (active) setError((cause as Error).message);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const params = new URLSearchParams();
    if (unit) params.set("unidadeId", unit);
    params.set("competencia", `${month}-01`);
    if (category) params.set("categoria", category);
    history.replaceState(null, "", `${location.pathname}?${params}`);
  }, [unit, month, category]);

  useEffect(() => {
    let active = true;
    const params = new URLSearchParams({ competencia: `${month}-01` });
    if (unit) params.set("unidadeId", unit);
    setLoading(true);
    void api<Summary>(`beneficios/resumo?${params}`)
      .then((totals) => {
        if (!active) return;
        setSummary(totals);
        setChartRows(
          Array.isArray(totals.cicloMensal) ? totals.cicloMensal : [],
        );
        setError("");
      })
      .catch((cause) => {
        if (active) setError((cause as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [unit, month]);

  const context = () => {
    const params = new URLSearchParams({ competencia: `${month}-01` });
    if (unit) params.set("unidadeId", unit);
    if (category) params.set("categoria", category);
    return params;
  };
  const go = (path: string) => {
    const params = context();
    if (path.endsWith("/aquisicao") && category) params.set("tipo", category);
    navigate(`${path}?${params}`);
  };
  const showLaunches = (view: string) => {
    const params = context();
    params.set("visao", view);
    navigate(`/app/beneficios/lancamentos?${params}`);
  };
  const chartTotal = chartRows.reduce(
    (sum, row) => sum + Number(row.valorPrevisto ?? 0),
    0,
  );
  const planned = Number(summary?.previsto ?? 0);

  return (
    <div className="page-stack benefit-summary-page">
      <header className="page-heading">
        <div>
          <h1>Benefícios</h1>
          <p>Acompanhe valores previstos, compras e lançamentos do mês.</p>
        </div>
      </header>
      <div
        className="benefit-summary-actions"
        role="navigation"
        aria-label="Ações de benefícios"
      >
        <button onClick={() => go("/app/beneficios/aquisicao")}>
          Fazer pedido
        </button>
        <button onClick={() => go("/app/beneficios/competencias")}>
          Competências
        </button>
      </div>
      <section
        className="panel benefit-summary-filters"
        aria-label="Filtros do resumo de benefícios"
      >
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
        <label>
          <span>Competência</span>
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </label>
      </section>
      <Notice text={error} error />
      {!summary && loading ? (
        <LoadingSkeleton variant="metrics" label="Carregando benefícios…" />
      ) : (
        <RefreshingContent refreshing={loading}>
          <div className="benefit-summary-metrics">
            {[
              {
                key: "previsto",
                label: "Valor previsto",
                value: money(summary?.previsto),
                hint: "Calculado para a competência",
              },
              {
                key: "solicitado",
                label: "Valor solicitado",
                value: money(summary?.solicitado),
                hint: "Pedidos vigentes da competência",
              },
              {
                key: "concluido",
                label: "Valor concluído",
                value: money(summary?.concluido),
                hint: "Confirmado menos reversões",
              },
              {
                key: "pedido",
                label: "Saldo pendente",
                value: money(summary?.emPedido),
                hint: "Ainda aguardando conclusão",
              },
            ].map((metric) => (
              <button
                key={metric.key}
                className="metric-card benefit-summary-metric"
                onClick={() => showLaunches(metric.key)}
              >
                <span>{metric.label}</span>
                <strong>{metric.value}</strong>
                <small>{metric.hint}</small>
              </button>
            ))}
          </div>
          <section className="panel benefit-summary-chart">
            <h2>Benefício Mensal</h2>
            <MonthlyBenefitChart
              rows={chartRows}
              unit={unit}
              category={category}
              competence={month}
              setUnit={setUnit}
              setCategory={setCategory}
            />
            {!summary?.previsaoPersistida &&
              Number(summary?.solicitado ?? 0) > 0 && (
                <p className="muted">
                  Estes pedidos foram emitidos sem uma previsão futura
                  persistida. O valor calculado do lançamento é mantido apenas
                  para compatibilidade histórica.
                </p>
              )}
            {Math.abs(chartTotal - planned) > 0.005 && (
              <p className="muted">
                O gráfico mostra somente valores atribuídos a fornecedores.
                Lançamentos sem fornecedor identificado não entram nas fatias.
              </p>
            )}
          </section>
        </RefreshingContent>
      )}
    </div>
  );
}
