import { useCallback, useEffect, useMemo, useState } from "react";
import { api, apiBlob, type Row } from "../../api";
import { Lookup } from "../../components";
import {
  Button,
  DataTable,
  DateInput,
  EmptyState,
  FilterBar,
  FormField,
  LoadingSkeleton,
  Notice,
  PageHeader,
  Pagination,
  RefreshingContent,
  Select,
  money,
  type DataTableColumn,
  type ResponsiveTableStrategy,
} from "../../components/ui";
import { formatDate } from "../../ui";

type ReportKind =
  | "pessoas"
  | "estagios"
  | "descansos"
  | "beneficios"
  | "aquisicoes-beneficios"
  | "inconsistencias";

type ReportColumn = {
  key: string;
  label: string;
  format?: "date" | "money";
  priority: "primary" | "secondary" | "desktop" | "always";
};

type ReportDefinition = {
  label: string;
  strategy: ResponsiveTableStrategy;
  columns: ReportColumn[];
};

function columns(
  keys: string[],
  formats: Partial<Record<string, "date" | "money">>,
  priorities: Partial<Record<string, ReportColumn["priority"]>>,
): ReportColumn[] {
  return keys.map((key, index) => ({
    key,
    label: key,
    ...(formats[key] ? { format: formats[key] } : {}),
    priority: priorities[key] ?? (index === 0 ? "primary" : "secondary"),
  }));
}

export const REPORT_DEFINITIONS: Record<ReportKind, ReportDefinition> = {
  pessoas: {
    label: "Pessoas e vínculos",
    strategy: "expandable",
    columns: columns(
      [
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
      ],
      { Admissão: "date", Desligamento: "date" },
      {
        Pessoa: "primary",
        Status: "always",
        Vínculo: "always",
        Unidade: "secondary",
        Equipe: "secondary",
        Admissão: "secondary",
        CPF: "desktop",
        "E-mail": "desktop",
        Telefone: "desktop",
        Cargo: "desktop",
        Desligamento: "desktop",
      },
    ),
  },
  estagios: {
    label: "Estagiários",
    strategy: "expandable",
    columns: columns(
      [
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
      ],
      { Admissão: "date", Bolsa: "money" },
      {
        Pessoa: "primary",
        Status: "always",
        Vínculo: "always",
        Unidade: "secondary",
        Equipe: "secondary",
        Admissão: "secondary",
        Instituição: "secondary",
        Curso: "desktop",
        Matrícula: "desktop",
        Bolsa: "desktop",
      },
    ),
  },
  descansos: {
    label: "Férias e descansos",
    strategy: "scroll",
    columns: columns(
      [
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
      ],
      { Admissão: "date" },
      { Pessoa: "primary", Status: "always" },
    ),
  },
  beneficios: {
    label: "Benefícios",
    strategy: "scroll",
    columns: columns(
      [
        "Pessoa",
        "Unidade",
        "Equipe",
        "Vínculo",
        "Benefício",
        "Fornecedor",
        "Condução",
        "Componente",
        "Competência",
        "Dias",
        "Valor diário",
        "Total mensal do item",
        "Quantidade",
        "Valor unitário",
        "Valor calculado",
        "Valor informado",
        "Ajustes",
        "Divergência",
        "Status",
        "Observações",
      ],
      {
        Competência: "date",
        "Valor diário": "money",
        "Total mensal do item": "money",
        "Valor unitário": "money",
        "Valor calculado": "money",
        "Valor informado": "money",
        Ajustes: "money",
        Divergência: "money",
      },
      { Pessoa: "primary", Status: "always" },
    ),
  },
  "aquisicoes-beneficios": {
    label: "Aquisições de benefícios",
    strategy: "scroll",
    columns: columns(
      [
        "Pessoa",
        "Unidade",
        "Equipe",
        "Competência",
        "Benefício",
        "Fornecedor",
        "Destino",
        "Previsto",
        "Reservado",
        "Comprado bruto",
        "Revertido",
        "Comprado líquido",
        "Situação",
        "Referência externa",
        "Data da compra",
      ],
      {
        Competência: "date",
        Previsto: "money",
        Reservado: "money",
        "Comprado bruto": "money",
        Revertido: "money",
        "Comprado líquido": "money",
        "Data da compra": "date",
      },
      { Pessoa: "primary", Situação: "always" },
    ),
  },
  inconsistencias: {
    label: "Inconsistências",
    strategy: "expandable",
    columns: columns(
      ["Pessoa", "Tipo", "Mensagem", "Prazo"],
      { Prazo: "date" },
      {
        Pessoa: "primary",
        Tipo: "always",
        Prazo: "always",
        Mensagem: "secondary",
      },
    ),
  },
};

const PAGE_SIZE = 25;

export function ReportsPage() {
  const [kind, setKind] = useState<ReportKind>("pessoas");
  const [unit, setUnit] = useState("");
  const [team, setTeam] = useState("");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [version, setVersion] = useState(0);
  const [exporting, setExporting] = useState<"xlsx" | "csv" | null>(null);

  const query = useMemo(
    () =>
      new URLSearchParams({
        page: String(page),
        ...(unit ? { unidadeId: unit } : {}),
        ...(team ? { equipeId: team } : {}),
        ...(type ? { tipo: type } : {}),
        ...(status ? { status } : {}),
        ...(start ? { inicio: start } : {}),
        ...(end ? { fim: end } : {}),
        ...(q ? { q } : {}),
      }).toString(),
    [end, page, q, start, status, team, type, unit],
  );

  useEffect(() => {
    let active = true;
    setLoading(true);
    void api<{ items: Row[]; total: number }>(`relatorios/${kind}?${query}`)
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
    return () => {
      active = false;
    };
  }, [kind, query, version]);

  const changeFilter = useCallback(
    (setter: (value: string) => void, value: string) => {
      setter(value);
      setPage(1);
    },
    [],
  );

  const hasFilters = Boolean(
    q || unit || team || type || status || start || end,
  );
  const clearFilters = () => {
    setQ("");
    setUnit("");
    setTeam("");
    setType("");
    setStatus("");
    setStart("");
    setEnd("");
    setPage(1);
  };

  async function download(format: "xlsx" | "csv") {
    if (exporting) return;
    setExporting(format);
    setExportError("");
    try {
      const blob = await apiBlob(`exportacoes/${kind}/${format}?${query}`);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `duali-${kind}.${format}`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (cause) {
      setExportError((cause as Error).message);
    } finally {
      setExporting(null);
    }
  }

  const definition = REPORT_DEFINITIONS[kind];
  const tableColumns: DataTableColumn[] = definition.columns.map((column) => ({
    key: column.key,
    label: column.label,
    priority: column.priority,
    ...(column.format === "money"
      ? { align: "end" as const, render: (row: Row) => money(row[column.key]) }
      : {}),
    ...(column.format === "date"
      ? { render: (row: Row) => formatDate(row[column.key]) }
      : {}),
  }));

  const activeFilters = [
    q && {
      key: "q",
      label: `Busca: ${q}`,
      onRemove: () => changeFilter(setQ, ""),
    },
    unit && {
      key: "unidade",
      label: "Unidade selecionada",
      onRemove: () => changeFilter(setUnit, ""),
    },
    team && {
      key: "equipe",
      label: "Equipe selecionada",
      onRemove: () => changeFilter(setTeam, ""),
    },
    type && {
      key: "tipo",
      label: `Tipo: ${type}`,
      onRemove: () => changeFilter(setType, ""),
    },
    status && {
      key: "status",
      label: `Status: ${status}`,
      onRemove: () => changeFilter(setStatus, ""),
    },
    start && {
      key: "inicio",
      label: `Início: ${formatDate(start)}`,
      onRemove: () => changeFilter(setStart, ""),
    },
    end && {
      key: "fim",
      label: `Fim: ${formatDate(end)}`,
      onRemove: () => changeFilter(setEnd, ""),
    },
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    onRemove: () => void;
  }>;

  return (
    <div className="reports-page">
      <PageHeader
        title="Relatórios"
        description="Filtre a operação e exporte os resultados em Excel ou CSV."
        action={
          <div className="reports-actions">
            <Button
              variant="secondary"
              loading={exporting === "csv"}
              disabled={Boolean(exporting)}
              onClick={() => void download("csv")}
            >
              Exportar CSV
            </Button>
            <Button
              loading={exporting === "xlsx"}
              disabled={Boolean(exporting)}
              onClick={() => void download("xlsx")}
            >
              Exportar Excel
            </Button>
          </div>
        }
      />
      <Notice
        tone="info"
        text="O período filtra admissão em pessoas e estágios, aquisição em descansos, competência em benefícios e prazo nas inconsistências."
      />
      <Notice text={exportError} error />
      {error && rows.length > 0 && <Notice text={error} error />}
      <FilterBar
        search={q}
        searchLabel="Buscar pessoa"
        searchPlaceholder="Nome da pessoa"
        onSearchChange={(value) => changeFilter(setQ, value)}
        activeFilters={activeFilters}
        onClear={clearFilters}
        primaryFilters={
          <>
            <FormField label="Relatório">
              <Select
                value={kind}
                onChange={(event) => {
                  setKind(event.target.value as ReportKind);
                  setPage(1);
                }}
              >
                {Object.entries(REPORT_DEFINITIONS).map(([value, item]) => (
                  <option key={value} value={value}>
                    {item.label}
                  </option>
                ))}
              </Select>
            </FormField>
            <FormField label="Unidade">
              <Lookup
                field={{
                  key: "unidadeId",
                  label: "Unidade",
                  resource: "unidades",
                }}
                value={unit}
                onChange={(value) => changeFilter(setUnit, String(value))}
              />
            </FormField>
          </>
        }
      >
        <FormField label="Equipe">
          <Lookup
            field={{ key: "equipeId", label: "Equipe", resource: "equipes" }}
            value={team}
            onChange={(value) => changeFilter(setTeam, String(value))}
          />
        </FormField>
        <FormField label="Tipo de vínculo">
          <Select
            value={type}
            onChange={(event) => changeFilter(setType, event.target.value)}
          >
            <option value="">Todos</option>
            <option>CLT</option>
            <option>ESTAGIO</option>
            <option>APRENDIZ</option>
            <option>TRAINEE</option>
          </Select>
        </FormField>
        <FormField label="Status do vínculo">
          <Select
            value={status}
            onChange={(event) => changeFilter(setStatus, event.target.value)}
          >
            <option value="">Todos</option>
            <option>ATIVO</option>
            <option>AFASTADO</option>
            <option>DESLIGADO</option>
          </Select>
        </FormField>
        <FormField label="Início">
          <DateInput
            value={start}
            onChange={(event) => changeFilter(setStart, event.target.value)}
          />
        </FormField>
        <FormField label="Fim">
          <DateInput
            value={end}
            onChange={(event) => changeFilter(setEnd, event.target.value)}
          />
        </FormField>
      </FilterBar>
      <section className="panel reports-results">
        <div className="result-count" aria-live="polite">
          {total} {total === 1 ? "registro" : "registros"}
        </div>
        {loading && !hasLoaded ? (
          <LoadingSkeleton label="Consultando relatório…" />
        ) : error && rows.length === 0 ? (
          <div className="reports-error">
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
            <DataTable<Row>
              rows={rows.map((row, index) => ({
                ...row,
                id: row.id ?? `${page}-${index}`,
              }))}
              primaryKey="Pessoa"
              columns={tableColumns}
              responsiveStrategy={definition.strategy}
              getRowLabel={(row) => String(row.Pessoa ?? "registro")}
              empty={
                <EmptyState
                  title={hasFilters ? "Nenhum resultado" : "Nenhum registro"}
                  description={
                    hasFilters
                      ? "Não há registros para os filtros selecionados."
                      : "Este relatório ainda não possui registros."
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
    </div>
  );
}

export const Reporting = ReportsPage;
