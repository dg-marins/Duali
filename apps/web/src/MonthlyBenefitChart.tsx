import { useEffect, useMemo, useState } from "react";
import { type Row } from "./api";
import { EmptyState, StatusBadge, money } from "./ui";

const preparationChartColors = [
  "#0f766e",
  "#2563eb",
  "#d97706",
  "#9333ea",
  "#dc2626",
  "#65a30d",
  "#db2777",
  "#374151",
];

const benefitCategoryLabels: Record<string, string> = {
  ALIMENTACAO: "Alimentação",
  TRANSPORTE: "Transporte",
  CESTA_BASICA: "Cesta básica",
  PREMIACAO: "Premiação",
  OUTRO: "Outro",
};

type PreparationChartItem = {
  id: string;
  label: string;
  detail?: string;
  value: number;
  values: Record<ChartMetric, number>;
  status?: string;
  occurrences: string[];
  impediments: string[];
};

type ChartMetric = "valorPrevisto" | "valorSolicitado" | "valorConcluido";

const metricLabels: Record<ChartMetric, string> = {
  valorPrevisto: "Previsto",
  valorSolicitado: "Solicitado",
  valorConcluido: "Concluído",
};

const occurrenceLabels: Record<string, string> = {
  PEDIDO_CANCELADO: "Pedido cancelado",
  CONFIRMACAO_PARCIAL: "Parcialmente confirmado",
  REJEICAO: "Com rejeição",
  REVERSAO: "Com reversão",
  FORNECEDOR_INATIVO: "Fornecedor inativo",
  COMPOSICAO_INCOMPLETA: "Composição incompleta",
  BASE_REABERTA: "Base reaberta",
  VINCULO_AFASTADO: "Vínculo afastado",
  VINCULO_DESLIGADO: "Vínculo desligado",
  VINCULO_NAO_ENCONTRADO: "Vínculo não encontrado",
  PESSOA_INATIVA: "Pessoa inativa",
  ADMISSAO_POSTERIOR: "Admissão posterior",
  DESLIGAMENTO_ANTERIOR: "Desligamento anterior",
};
const stateLabels: Record<string, string> = {
  PREVISTO: "Previsto",
  SOLICITADO: "Solicitado",
  CONCLUIDO: "Concluído",
  CANCELADO: "Cancelado",
};

const metricValue = (row: Row, metric: ChartMetric) => Number(row[metric] ?? 0);

const rowValues = (row: Row): Record<ChartMetric, number> => ({
  valorPrevisto: metricValue(row, "valorPrevisto"),
  valorSolicitado: metricValue(row, "valorSolicitado"),
  valorConcluido: metricValue(row, "valorConcluido"),
});

function mergeText(current: string[], value: unknown) {
  for (const item of Array.isArray(value) ? value : [])
    if (typeof item === "string" && !current.includes(item)) current.push(item);
}

function piePoint(angle: number) {
  const radians = ((angle - 90) * Math.PI) / 180;
  return {
    x: 50 + 48 * Math.cos(radians),
    y: 50 + 48 * Math.sin(radians),
  };
}

function pieSlicePath(startAngle: number, endAngle: number) {
  if (endAngle - startAngle >= 359.999) {
    return "M 50 2 A 48 48 0 1 1 50 98 A 48 48 0 1 1 50 2 Z";
  }
  const start = piePoint(startAngle),
    end = piePoint(endAngle),
    largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M 50 50 L ${start.x} ${start.y} A 48 48 0 ${largeArc} 1 ${end.x} ${end.y} Z`;
}

function pieLabelPoint(startAngle: number, endAngle: number) {
  const midpoint = (startAngle + endAngle) / 2,
    radians = ((midpoint - 90) * Math.PI) / 180;
  return {
    x: 50 + 28 * Math.cos(radians),
    y: 50 + 28 * Math.sin(radians),
  };
}

function preparationSlices(items: PreparationChartItem[]) {
  const total = items.reduce((sum, item) => sum + Math.abs(item.value), 0);
  let lastNonZeroIndex = -1;
  items.forEach((item, index) => {
    if (Math.abs(item.value) > 0) lastNonZeroIndex = index;
  });
  return items.reduce<
    Array<PreparationChartItem & { start: number; end: number; color: string }>
  >((result, item, index) => {
    const start = result.at(-1)?.end ?? 0;
    result.push({
      ...item,
      start,
      end:
        index === lastNonZeroIndex
          ? 360
          : start + (Math.abs(item.value) / total) * 360,
      color: preparationChartColors[index % preparationChartColors.length]!,
    });
    return result;
  }, []);
}

function formatCompetenceMonth(competence: string) {
  const formatted = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${competence}-01T00:00:00.000Z`));
  return `${formatted.charAt(0).toUpperCase()}${formatted.slice(1)}`;
}

export function MonthlyBenefitChart({
  rows: monthlyPreparation,
  unit,
  category,
  competence,
  setUnit,
  setCategory,
}: {
  rows: Row[];
  unit: string;
  category: string;
  competence: string;
  setUnit: (value: string) => void;
  setCategory: (value: string) => void;
}) {
  const defaultMetric = useMemo<ChartMetric>(
    () =>
      monthlyPreparation.some((row) => metricValue(row, "valorPrevisto") !== 0)
        ? "valorPrevisto"
        : monthlyPreparation.some(
              (row) => metricValue(row, "valorSolicitado") !== 0,
            )
          ? "valorSolicitado"
          : "valorConcluido",
    [monthlyPreparation],
  );
  const [metric, setMetric] = useState<ChartMetric>(defaultMetric);
  useEffect(() => setMetric(defaultMetric), [competence, defaultMetric]);
  const selectedUnitName = unit
      ? String(
          monthlyPreparation.find((item) => String(item.unidadeId) === unit)
            ?.unidade ?? "Unidade selecionada",
        )
      : "",
    rowsForUnit = unit
      ? monthlyPreparation.filter((item) => String(item.unidadeId) === unit)
      : monthlyPreparation,
    chartItems = (() => {
      if (!unit) {
        const totals = new Map<string, PreparationChartItem>();
        for (const row of monthlyPreparation) {
          const id = String(row.unidadeId),
            current = totals.get(id),
            values = rowValues(row);
          if (current) {
            for (const key of Object.keys(values) as ChartMetric[])
              current.values[key] += values[key];
            current.value = current.values[metric];
            mergeText(current.occurrences, row.ocorrencias);
            mergeText(current.impediments, row.impedimentos);
          } else
            totals.set(id, {
              id,
              label: String(row.unidade),
              value: values[metric],
              values,
              occurrences: Array.isArray(row.ocorrencias)
                ? (row.ocorrencias as string[])
                : [],
              impediments: Array.isArray(row.impedimentos)
                ? (row.impedimentos as string[])
                : [],
            });
        }
        return [...totals.values()].sort(
          (left, right) => right.value - left.value,
        );
      }
      if (!category) {
        const totals = new Map<string, PreparationChartItem>();
        for (const row of rowsForUnit) {
          const id = String(row.tipo),
            current = totals.get(id),
            values = rowValues(row);
          if (current) {
            for (const key of Object.keys(values) as ChartMetric[])
              current.values[key] += values[key];
            current.value = current.values[metric];
            mergeText(current.occurrences, row.ocorrencias);
            mergeText(current.impediments, row.impedimentos);
          } else
            totals.set(id, {
              id,
              label: benefitCategoryLabels[id] ?? id.replaceAll("_", " "),
              value: values[metric],
              values,
              occurrences: Array.isArray(row.ocorrencias)
                ? (row.ocorrencias as string[])
                : [],
              impediments: Array.isArray(row.impedimentos)
                ? (row.impedimentos as string[])
                : [],
            });
        }
        return [...totals.values()].sort(
          (left, right) => right.value - left.value,
        );
      }
      return rowsForUnit
        .filter((row) => String(row.tipo) === category)
        .map((row) => {
          const values = rowValues(row);
          return {
            id: String(row.fornecedorId),
            label: String(row.fornecedor),
            detail:
              benefitCategoryLabels[category] ?? category.replaceAll("_", " "),
            value: values[metric],
            values,
            ...(row.estado ? { status: String(row.estado) } : {}),
            occurrences: Array.isArray(row.ocorrencias)
              ? (row.ocorrencias as string[])
              : [],
            impediments: Array.isArray(row.impedimentos)
              ? (row.impedimentos as string[])
              : [],
          };
        })
        .sort((left, right) => right.value - left.value);
    })(),
    chartTotal = chartItems.reduce(
      (sum, item) => sum + Math.abs(item.value),
      0,
    ),
    chartSlices = chartTotal
      ? preparationSlices(chartItems)
      : chartItems.map((item, index) => ({
          ...item,
          start: 0,
          end: 0,
          color: preparationChartColors[index % preparationChartColors.length]!,
        }));
  const levelTotals = chartItems.reduce(
    (totals, item) => {
      for (const key of Object.keys(totals) as ChartMetric[])
        totals[key] += item.values[key];
      return totals;
    },
    { valorPrevisto: 0, valorSolicitado: 0, valorConcluido: 0 },
  );
  return (
    <>
      {chartItems.length ? (
        <div
          className="monthly-preparation-chart"
          aria-label="Valores previstos por unidade, categoria e fornecedor"
        >
          <div
            className="monthly-preparation-breadcrumb"
            aria-label="Navegação do gráfico"
          >
            <button
              className="link-button"
              aria-current={!unit ? "page" : undefined}
              onClick={() => {
                setUnit("");
                setCategory("");
              }}
            >
              Todas as unidades
            </button>
            {unit && (
              <>
                <span aria-hidden="true">/</span>
                <button
                  className="link-button"
                  aria-current={!category ? "page" : undefined}
                  onClick={() => setCategory("")}
                >
                  {selectedUnitName}
                </button>
              </>
            )}
            {category && (
              <>
                <span aria-hidden="true">/</span>
                <span aria-current="page">
                  {benefitCategoryLabels[category] ??
                    category.replaceAll("_", " ")}
                </span>
              </>
            )}
          </div>
          <div className="monthly-preparation-unit-heading">
            <span>Competência: {formatCompetenceMonth(competence)}</span>
          </div>
          <div
            className="monthly-benefit-metric-selector"
            aria-label="Valor exibido no gráfico"
          >
            {(Object.keys(metricLabels) as ChartMetric[]).map((key) => (
              <button
                type="button"
                key={key}
                className={metric === key ? "active" : "secondary"}
                aria-pressed={metric === key}
                onClick={() => setMetric(key)}
              >
                <span>{metricLabels[key]}</span>
                <strong>{money(levelTotals[key])}</strong>
              </button>
            ))}
          </div>
          <div className="monthly-preparation-pie-layout">
            <div className="monthly-preparation-pie-summary">
              {chartTotal ? (
                <svg
                  className="monthly-preparation-pie"
                  viewBox="0 0 100 100"
                  role="img"
                  aria-label={`Distribuição do valor ${metricLabels[metric].toLowerCase()} de ${money(chartTotal)} na competência ${competence}.`}
                >
                  {chartSlices
                    .filter((slice) => Math.abs(slice.value) > 0)
                    .map((slice) => {
                      const percentage =
                          (Math.abs(slice.value) / chartTotal) * 100,
                        label = `${slice.label}${slice.detail ? `, ${slice.detail}` : ""}: ${money(slice.value)} (${percentage.toFixed(1)}%)`,
                        select = !unit
                          ? () => {
                              setUnit(slice.id);
                              setCategory("");
                            }
                          : !category
                            ? () => setCategory(slice.id)
                            : undefined;
                      const showPercentage = percentage >= 5,
                        labelPoint = pieLabelPoint(slice.start, slice.end);
                      return (
                        <g key={slice.id}>
                          <path
                            d={pieSlicePath(slice.start, slice.end)}
                            fill={slice.color}
                            className="monthly-preparation-slice"
                            role={select ? "button" : undefined}
                            tabIndex={select ? 0 : undefined}
                            aria-label={label}
                            onClick={select}
                            onKeyDown={(event) => {
                              if (
                                !select ||
                                !["Enter", " "].includes(event.key)
                              )
                                return;
                              event.preventDefault();
                              select();
                            }}
                          >
                            <title>{label}</title>
                          </path>
                          {showPercentage && (
                            <text
                              className="monthly-preparation-slice-percentage"
                              x={labelPoint.x}
                              y={labelPoint.y}
                              textAnchor="middle"
                              dominantBaseline="middle"
                              aria-hidden="true"
                            >
                              {percentage.toFixed(1)}%
                            </text>
                          )}
                        </g>
                      );
                    })}
                </svg>
              ) : (
                <div className="monthly-preparation-pie-empty">
                  Sem valor {metricLabels[metric].toLowerCase()}
                </div>
              )}
              <strong className="monthly-preparation-total">
                Total {metricLabels[metric].toLowerCase()}: {money(chartTotal)}
              </strong>
            </div>
            <div className="monthly-preparation-legend">
              {chartSlices.map((slice) => {
                const selectable = !unit || !category,
                  select = !unit
                    ? () => {
                        setUnit(slice.id);
                        setCategory("");
                      }
                    : !category
                      ? () => setCategory(slice.id)
                      : undefined;
                return (
                  <button
                    className="monthly-preparation-legend-row"
                    key={slice.id}
                    type="button"
                    disabled={!selectable}
                    onClick={select}
                  >
                    <span
                      className="monthly-preparation-swatch"
                      style={{ backgroundColor: slice.color }}
                      aria-hidden="true"
                    />
                    <span className="monthly-preparation-legend-label">
                      <strong>{slice.label}</strong>
                      {slice.detail && <span>{slice.detail}</span>}
                      <span>Previsto: {money(slice.values.valorPrevisto)}</span>
                      <span>
                        Solicitado: {money(slice.values.valorSolicitado)}
                      </span>
                      <span>
                        Concluído: {money(slice.values.valorConcluido)}
                      </span>
                      {[...slice.occurrences, ...slice.impediments].map(
                        (item) => (
                          <small key={item}>
                            {occurrenceLabels[item] ??
                              item.replaceAll("_", " ")}
                          </small>
                        ),
                      )}
                    </span>
                    {slice.status && (
                      <StatusBadge
                        value={
                          stateLabels[slice.status] ??
                          slice.status.replaceAll("_", " ")
                        }
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      ) : (
        <EmptyState
          title="Sem valores no ciclo"
          description="Não há previsão, solicitação, conclusão ou histórico cancelado para a unidade e competência selecionadas."
        />
      )}
    </>
  );
}
