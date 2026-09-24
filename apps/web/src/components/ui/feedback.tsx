import type { HTMLAttributes, ReactNode } from "react";
import { joinClasses } from "./utils";

export type SemanticTone =
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "review"
  | "neutral";

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

export function money(value: unknown) {
  return value == null || value === ""
    ? "—"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(Number(value));
}

export const STATUS_DEFINITIONS = {
  ATIVO: { label: "Ativo", tone: "success" },
  VIGENTE: { label: "Vigente", tone: "success" },
  PROGRAMADO: { label: "Programado", tone: "success" },
  A_PROGRAMAR: { label: "A programar", tone: "warning" },
  CONCLUIDO: { label: "Concluído", tone: "success" },
  PAGO: { label: "Pago", tone: "success" },
  CONFIRMADA: { label: "Confirmada", tone: "success" },
  CONFIRMADO: { label: "Confirmado", tone: "success" },
  IMPORTADO: { label: "Importado", tone: "success" },
  VALIDO: { label: "Válido", tone: "success" },
  REGULAR: { label: "Regular", tone: "success" },
  PENDENTE: { label: "Pendente", tone: "warning" },
  SOLICITADO: { label: "Solicitado", tone: "warning" },
  AFASTADO: { label: "Afastado", tone: "warning" },
  PARCIAL: { label: "Parcial", tone: "warning" },
  AGUARDANDO_DEPENDENCIA: {
    label: "Aguardando dependência",
    tone: "warning",
  },
  SEM_VINCULO: { label: "Sem vinculo", tone: "warning" },
  DESLIGADO: { label: "Desligado", tone: "danger" },
  VENCIDO: { label: "Vencido", tone: "danger" },
  CANCELADO: { label: "Cancelado", tone: "danger" },
  CANCELADA: { label: "Cancelada", tone: "danger" },
  REJEITADO: { label: "Rejeitado", tone: "danger" },
  INCONSISTENCIA: { label: "Inconsistência", tone: "danger" },
  INATIVO: { label: "Inativo", tone: "danger" },
  CONFERIDO: { label: "Conferido", tone: "info" },
  PREVISTO: { label: "Previsto", tone: "info" },
  EM_GOZO: { label: "Em gozo", tone: "info" },
  ABERTA: { label: "Aberta", tone: "info" },
  UPLOAD: { label: "Upload", tone: "info" },
  ATUALIZADO: { label: "Atualizado", tone: "info" },
  REVISAO: { label: "Revisão", tone: "review" },
  EM_REVISAO: { label: "Em revisão", tone: "review" },
  NORMALIZAVEL: { label: "Normalizável", tone: "review" },
  ENCERRADO: { label: "Encerrado", tone: "neutral" },
  FECHADA: { label: "Fechada", tone: "neutral" },
  DUPLICIDADE: { label: "Duplicidade", tone: "neutral" },
} as const satisfies Record<string, { label: string; tone: SemanticTone }>;

export function normalizeStatusCode(value: unknown) {
  return String(value ?? "NAO_INFORMADO")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .toUpperCase();
}

export function statusDefinition(value: unknown): {
  code: string;
  label: string;
  tone: SemanticTone;
} {
  const code = normalizeStatusCode(value);
  const known = STATUS_DEFINITIONS[code as keyof typeof STATUS_DEFINITIONS];
  if (known) return { code, ...known };
  const label = code
    .toLocaleLowerCase("pt-BR")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toLocaleUpperCase("pt-BR"));
  return { code, label: label || "Não informado", tone: "neutral" };
}

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: SemanticTone }) {
  return (
    <span
      className={joinClasses("ds-badge", `ds-badge--${tone}`, className)}
      {...props}
    />
  );
}

export function StatusBadge({ value }: { value: unknown }) {
  const status = statusDefinition(value);
  const legacyTone = status.tone === "danger" ? "critical" : status.tone;
  return (
    <span
      className={`badge ${legacyTone} ds-status-badge`}
      data-status={status.code}
    >
      {status.label.toLocaleUpperCase("pt-BR")}
    </span>
  );
}

export function Notice({
  text,
  error = false,
  tone,
}: {
  text: string;
  error?: boolean;
  tone?: SemanticTone;
}) {
  if (!text) return null;
  const resolvedTone = tone ?? (error ? "danger" : "info");
  return (
    <div
      className={joinClasses(
        "notice",
        error && "error",
        "ds-notice",
        `ds-notice--${resolvedTone}`,
      )}
      role={resolvedTone === "danger" ? "alert" : "status"}
    >
      {text}
    </div>
  );
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
    <div className="empty-state ds-empty-state">
      <strong>{title}</strong>
      <p>{description}</p>
      {action}
    </div>
  );
}

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
      className={`loading-skeleton loading-skeleton-${variant} ds-loading-skeleton`}
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
      className={joinClasses(
        "refreshing-content",
        "ds-refreshing-content",
        refreshing && "is-refreshing",
        className,
      )}
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

export function MetricCard({
  label,
  value,
  tone,
  supportingText,
  icon,
  onClick,
}: {
  label: string;
  value: ReactNode;
  tone?: SemanticTone | string;
  supportingText?: ReactNode;
  icon?: ReactNode;
  onClick?: () => void;
}) {
  const content = (
    <>
      <span className="ds-metric-card__label">{label}</span>
      {icon && <span className="ds-metric-card__icon">{icon}</span>}
      <strong>{value}</strong>
      {supportingText && (
        <small className="ds-metric-card__support">{supportingText}</small>
      )}
    </>
  );
  return onClick ? (
    <button
      type="button"
      className={joinClasses("metric-card", "ds-metric-card", tone)}
      onClick={onClick}
    >
      {content}
    </button>
  ) : (
    <article className={joinClasses("metric-card", "ds-metric-card", tone)}>
      {content}
    </article>
  );
}
