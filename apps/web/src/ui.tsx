import type { ReactNode } from "react";
import { display, type Row } from "./api";

export function LoadingSkeleton({
  variant = "table",
  rows = 5,
  label = "Carregando conteúdo…",
}: {
  variant?: "table" | "metrics" | "detail";
  rows?: number;
  label?: string;
}) {
  const count = variant === "metrics" ? 4 : rows;
  return (
    <div
      className={`loading-skeleton loading-skeleton-${variant}`}
      role="status"
      aria-label={label}
      data-testid={`loading-skeleton-${variant}`}
    >
      <span className="sr-only">{label}</span>
      {Array.from({ length: count }, (_, index) => (
        <div className="skeleton-item" aria-hidden="true" key={index}>
          <span />
          <span />
          {variant === "table" && <span />}
        </div>
      ))}
    </div>
  );
}

export function RefreshingContent({
  refreshing,
  children,
  label = "Atualizando conteúdo…",
  className = "",
}: {
  refreshing: boolean;
  children: ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`refreshing-content ${refreshing ? "is-refreshing" : ""} ${className}`.trim()}
      aria-busy={refreshing}
    >
      {refreshing && (
        <>
          <div className="refresh-progress" aria-hidden="true" />
          <span className="sr-only" role="status">
            {label}
          </span>
        </>
      )}
      <div className="refreshing-body" inert={refreshing}>
        {children}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  action,
  breadcrumb,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  breadcrumb?: ReactNode;
}) {
  return (
    <header className="page-header">
      <div>
        {breadcrumb && <div className="breadcrumb">{breadcrumb}</div>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {action}
    </header>
  );
}
export function StatusBadge({ value }: { value: unknown }) {
  const label = String(value ?? "Não informado").replaceAll("_", " ");
  const tone = /vencid|exced|inconsist|deslig|erro/i.test(label)
    ? "critical"
    : /pendente|próxim|revis|aguard/i.test(label)
      ? "warning"
      : /ativo|regular|vigente|conclu|importado/i.test(label)
        ? "success"
        : "neutral";
  return <span className={`badge ${tone}`}>{label}</span>;
}
export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}
export function DataTable({
  columns,
  rows,
  onRow,
  empty,
}: {
  columns: { key: string; label: string; render?: (row: Row) => ReactNode }[];
  rows: Row[];
  onRow?: (row: Row) => void;
  empty: ReactNode;
}) {
  if (!rows.length) return <>{empty}</>;
  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={String(row.id)}
              className={onRow ? "clickable-row" : ""}
              tabIndex={onRow ? 0 : undefined}
              onClick={() => onRow?.(row)}
              onKeyDown={(event) => {
                if (onRow && (event.key === "Enter" || event.key === " "))
                  onRow(row);
              }}
            >
              {columns.map((column) => (
                <td key={column.key}>
                  {column.render
                    ? column.render(row)
                    : display(row[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
export function Pagination({
  page,
  pageSize = 25,
  total,
  onChange,
}: {
  page: number;
  pageSize?: number;
  total: number;
  onChange: (page: number) => void;
}) {
  return (
    <div className="pagination">
      <button
        className="secondary"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        Anterior
      </button>
      <span>
        Página {page} de {Math.max(1, Math.ceil(total / pageSize))}
      </span>
      <button
        className="secondary"
        disabled={page * pageSize >= total}
        onClick={() => onChange(page + 1)}
      >
        Próxima
      </button>
    </div>
  );
}
export function MetricCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
}) {
  return (
    <article className={`metric-card ${tone ?? ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}
export function formatDate(value: unknown) {
  if (!value) return "—";
  const text = String(value).slice(0, 10),
    [year, month, day] = text.split("-");
  return day && month && year ? `${day}/${month}/${year}` : text;
}
export function money(value: unknown) {
  return value == null || value === ""
    ? "—"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(Number(value));
}
export function maskCpf(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits.length === 11
    ? `***.${digits.slice(3, 6)}.${digits.slice(6, 9)}-**`
    : "—";
}
