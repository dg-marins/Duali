import {
  createContext,
  Fragment,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ChevronDown,
  MoreHorizontal,
  SlidersHorizontal,
  X,
} from "lucide-react";
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
  description?: string | undefined;
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

type OverlayProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string | undefined;
  children: ReactNode;
};

const FormDirtyContext = createContext<(dirty: boolean) => void>(
  () => undefined,
);
export function useFormDirty(dirty: boolean) {
  const report = useContext(FormDirtyContext);
  useEffect(() => {
    report(dirty);
    return () => report(false);
  }, [dirty, report]);
}

function Overlay({
  open,
  onOpenChange,
  title,
  description,
  children,
  sheet = false,
}: OverlayProps & { sheet?: boolean }) {
  const [dirty, setDirty] = useState(false),
    [confirming, setConfirming] = useState(false);
  const opener = useRef<HTMLElement | null>(null),
    previousOpen = useRef(open);
  if (open && !previousOpen.current)
    opener.current = document.activeElement as HTMLElement | null;
  previousOpen.current = open;
  const changeOpen = (next: boolean) => {
    if (!next && dirty) setConfirming(true);
    else onOpenChange(next);
  };
  return (
    <FormDirtyContext.Provider value={setDirty}>
      <Dialog.Root open={open} onOpenChange={changeOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay" />
          <Dialog.Content
            className={
              sheet ? "dialog-content sheet-content" : "dialog-content"
            }
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              opener.current?.focus();
            }}
            onEscapeKeyDown={(event) => {
              if (
                (event.target as Element | null)?.getAttribute("role") ===
                "combobox"
              )
                event.preventDefault();
            }}
          >
            <header className="dialog-header">
              <div>
                <Dialog.Title>{title}</Dialog.Title>
                {description && (
                  <Dialog.Description>{description}</Dialog.Description>
                )}
              </div>
              <Dialog.Close className="icon-control" aria-label="Fechar">
                <X size={18} />
              </Dialog.Close>
            </header>
            <div className="dialog-body">{children}</div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root open={confirming} onOpenChange={setConfirming}>
        <Dialog.Portal>
          <Dialog.Overlay className="dialog-overlay dialog-overlay-confirm" />
          <Dialog.Content className="dialog-content confirm-content">
            <Dialog.Title>Descartar alterações?</Dialog.Title>
            <Dialog.Description>
              As informações preenchidas serão perdidas.
            </Dialog.Description>
            <div className="form-actions dialog-actions">
              <button
                type="button"
                className="secondary"
                onClick={() => setConfirming(false)}
              >
                Continuar editando
              </button>
              <button
                type="button"
                className="danger"
                onClick={() => {
                  setConfirming(false);
                  setDirty(false);
                  onOpenChange(false);
                }}
              >
                Descartar
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </FormDirtyContext.Provider>
  );
}

export function FormDialog(props: OverlayProps) {
  return <Overlay {...props} />;
}

export function FormSheet(props: OverlayProps) {
  return <Overlay {...props} sheet />;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = "Confirmar",
  onConfirm,
}: Omit<OverlayProps, "children"> & {
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
    >
      <div className="form-actions dialog-actions">
        <button
          type="button"
          className="secondary"
          onClick={() => onOpenChange(false)}
        >
          Continuar editando
        </button>
        <button type="button" className="danger" onClick={onConfirm}>
          {confirmLabel}
        </button>
      </div>
    </FormDialog>
  );
}

export function FormActions({
  pending,
  onCancel,
  submitLabel = "Salvar",
}: {
  pending?: boolean;
  onCancel: () => void;
  submitLabel?: string;
}) {
  return (
    <div className="form-actions form-actions-sticky">
      <button disabled={pending}>{pending ? "Salvando…" : submitLabel}</button>
      <button type="button" className="secondary" onClick={onCancel}>
        Cancelar
      </button>
    </div>
  );
}

export function ActionMenu({
  label = "Mais ações",
  items,
}: {
  label?: string;
  items: Array<{ label: string; onSelect: () => void; disabled?: boolean }>;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="secondary icon-control action-menu-trigger"
        aria-label={label}
      >
        <MoreHorizontal size={18} />
        <span>{label}</span>
        <ChevronDown size={14} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="action-menu-content"
          sideOffset={6}
          align="end"
        >
          {items.map((item) => (
            <DropdownMenu.Item
              className="action-menu-item"
              key={item.label}
              disabled={Boolean(item.disabled)}
              onSelect={item.onSelect}
            >
              {item.label}
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function FilterBar({
  search,
  searchLabel = "Buscar",
  onSearchChange,
  children,
  activeFilters = [],
  onClear,
}: {
  search: string;
  searchLabel?: string;
  onSearchChange: (value: string) => void;
  children?: ReactNode;
  activeFilters?: Array<{ key: string; label: string; onRemove: () => void }>;
  onClear?: () => void;
}) {
  return (
    <section className="panel filter-bar">
      <div className="filter-bar-main">
        <label className="filter-search">
          <span>{searchLabel}</span>
          <input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Digite para buscar…"
          />
        </label>
        {children && (
          <details className="filter-details">
            <summary>
              <SlidersHorizontal size={17} /> Filtros
            </summary>
            <div className="filter-secondary">{children}</div>
          </details>
        )}
      </div>
      {activeFilters.length > 0 && (
        <div className="filter-chips" aria-label="Filtros aplicados">
          {activeFilters.map((filter) => (
            <button
              type="button"
              className="filter-chip"
              key={filter.key}
              onClick={filter.onRemove}
            >
              {filter.label}
              <X size={14} aria-hidden="true" />
            </button>
          ))}
          {onClear && (
            <button type="button" className="link-button" onClick={onClear}>
              Limpar todos
            </button>
          )}
        </div>
      )}
    </section>
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
  primaryKey,
  loading = false,
  refreshing = false,
}: {
  columns: {
    key: string;
    label: string;
    render?: (row: Row) => ReactNode;
    align?: "start" | "center" | "end";
    mobile?: "primary" | "secondary" | "hidden";
  }[];
  rows: Row[];
  onRow?: (row: Row) => void;
  empty: ReactNode;
  primaryKey?: string;
  loading?: boolean;
  refreshing?: boolean;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (loading && !rows.length) return <LoadingSkeleton />;
  if (!rows.length) return <>{empty}</>;
  const content = (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={`align-${column.align ?? "start"} mobile-${column.mobile ?? (column.key === primaryKey ? "primary" : "secondary")}`}
              >
                {column.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowId = String(row.id),
              details = columns.filter(
                (column, index) =>
                  column.mobile === "hidden" || (!column.mobile && index > 2),
              );
            return (
              <Fragment key={rowId}>
                <tr
                  className={onRow ? "clickable-row" : ""}
                  tabIndex={onRow ? 0 : undefined}
                  onClick={() => onRow?.(row)}
                  onKeyDown={(event) => {
                    if (onRow && (event.key === "Enter" || event.key === " "))
                      onRow(row);
                  }}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`align-${column.align ?? "start"} mobile-${column.mobile ?? (column.key === primaryKey ? "primary" : "secondary")}`}
                    >
                      {column.key === primaryKey && onRow ? (
                        <button
                          className="table-primary-link"
                          onClick={(event) => {
                            event.stopPropagation();
                            onRow(row);
                          }}
                        >
                          {column.render
                            ? column.render(row)
                            : display(row[column.key])}
                        </button>
                      ) : column.render ? (
                        column.render(row)
                      ) : (
                        display(row[column.key])
                      )}
                    </td>
                  ))}
                  {details.length > 0 && (
                    <td className="mobile-expand-cell">
                      <button
                        type="button"
                        className="secondary compact"
                        aria-expanded={expanded.has(rowId)}
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpanded((current) => {
                            const next = new Set(current);
                            if (next.has(rowId)) next.delete(rowId);
                            else next.add(rowId);
                            return next;
                          });
                        }}
                      >
                        Detalhes
                      </button>
                    </td>
                  )}
                </tr>
                {details.length > 0 && expanded.has(rowId) && (
                  <tr className="mobile-details-row">
                    <td colSpan={columns.length + 1}>
                      <dl>
                        {details.map((column) => (
                          <div key={column.key}>
                            <dt>{column.label}</dt>
                            <dd>
                              {column.render
                                ? column.render(row)
                                : display(row[column.key])}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
  return refreshing ? (
    <RefreshingContent refreshing>{content}</RefreshingContent>
  ) : (
    content
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
