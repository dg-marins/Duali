import { Fragment, useEffect, useState, type ReactNode } from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ChevronDown,
  MoreHorizontal,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { display, type Row } from "../../api";
import { Button, SearchInput } from "./controls";
import { EmptyState, LoadingSkeleton, RefreshingContent } from "./feedback";
import { joinClasses } from "./utils";

export type ColumnPriority = "primary" | "secondary" | "desktop" | "always";
export type LegacyMobilePriority = "primary" | "secondary" | "hidden";
export type ResponsiveTableStrategy = "priority" | "expandable" | "scroll";
export type SortDirection = "asc" | "desc";

export type DataTableColumn<T extends Row = Row> = {
  key: string;
  label: string;
  render?: (row: T) => ReactNode;
  align?: "start" | "center" | "end";
  priority?: ColumnPriority;
  sortable?: boolean;
  headerLabel?: string;
  /** @deprecated Use priority. */
  mobile?: LegacyMobilePriority;
};

export function resolveColumnPriority(
  column: Pick<DataTableColumn, "priority" | "mobile">,
): ColumnPriority {
  if (column.priority) return column.priority;
  if (column.mobile === "primary") return "primary";
  if (column.mobile === "hidden") return "desktop";
  return "secondary";
}

type DataTableProps<T extends Row = Row> = {
  columns: DataTableColumn<T>[];
  rows: T[];
  onRow?: (row: T) => void;
  empty: ReactNode;
  primaryKey?: string;
  loading?: boolean;
  refreshing?: boolean;
  responsiveStrategy?: ResponsiveTableStrategy;
  sort?: { key: string; direction: SortDirection };
  onSort?: (key: string, direction: SortDirection) => void;
  rowActions?: (row: T) => ReactNode;
  getRowLabel?: (row: T) => string;
};

export function DataTable<T extends Row = Row>({
  columns,
  rows,
  onRow,
  empty,
  primaryKey,
  loading = false,
  refreshing = false,
  responsiveStrategy,
  sort,
  onSort,
  rowActions,
  getRowLabel,
}: DataTableProps<T>) {
  const legacyContract = responsiveStrategy == null;
  const strategy = responsiveStrategy ?? "expandable";
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  if (loading && !rows.length) return <LoadingSkeleton />;
  if (!rows.length) return <>{empty}</>;

  const detailColumns = legacyContract
    ? columns.filter(
        (column, index) =>
          column.mobile === "hidden" || (!column.mobile && index > 2),
      )
    : columns.filter(
        (column) =>
          resolveColumnPriority(column) === "secondary" ||
          resolveColumnPriority(column) === "desktop",
      );
  const content = (
    <div
      className={joinClasses(
        "table-scroll",
        "ds-data-table",
        `ds-data-table--${strategy}`,
        legacyContract && "ds-data-table--legacy",
      )}
    >
      <table>
        <thead>
          <tr>
            {columns.map((column) => {
              const sortable = Boolean(column.sortable && onSort);
              const active = sort?.key === column.key;
              return (
                <th
                  key={column.key}
                  data-column={column.key}
                  className={joinClasses(
                    `align-${column.align ?? "start"}`,
                    `ds-column--${resolveColumnPriority(column)}`,
                    `mobile-${column.mobile ?? (column.key === primaryKey ? "primary" : "secondary")}`,
                  )}
                  aria-sort={
                    active
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : sortable
                        ? "none"
                        : undefined
                  }
                >
                  {sortable ? (
                    <button
                      type="button"
                      className="ds-data-table__sort"
                      aria-label={column.headerLabel ?? column.label}
                      onClick={() =>
                        onSort?.(
                          column.key,
                          active && sort.direction === "asc" ? "desc" : "asc",
                        )
                      }
                    >
                      {column.label}
                    </button>
                  ) : (
                    column.label
                  )}
                </th>
              );
            })}
            {rowActions && <th className="ds-data-table__actions">Ações</th>}
            {!legacyContract &&
              strategy === "expandable" &&
              detailColumns.length > 0 && (
                <th className="ds-data-table__expand-heading">
                  <span className="sr-only">Detalhes</span>
                </th>
              )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const rowId = String(row.id);
            return (
              <Fragment key={rowId}>
                <tr
                  className={onRow ? "clickable-row" : ""}
                  tabIndex={onRow ? 0 : undefined}
                  onClick={() => onRow?.(row)}
                  onKeyDown={(event) => {
                    if (event.target !== event.currentTarget) return;
                    if (onRow && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault();
                      onRow(row);
                    }
                  }}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      data-column={column.key}
                      className={joinClasses(
                        `align-${column.align ?? "start"}`,
                        `ds-column--${resolveColumnPriority(column)}`,
                        `mobile-${column.mobile ?? (column.key === primaryKey ? "primary" : "secondary")}`,
                      )}
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
                  {rowActions && (
                    <td className="ds-data-table__actions">
                      {rowActions(row)}
                    </td>
                  )}
                  {strategy === "expandable" && detailColumns.length > 0 && (
                    <td className="mobile-expand-cell ds-data-table__expand-cell">
                      <Button
                        variant="secondary"
                        size="sm"
                        aria-expanded={expanded.has(rowId)}
                        aria-controls={`row-details-${rowId}`}
                        aria-label={`Exibir detalhes de ${getRowLabel?.(row) ?? rowId}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setExpanded((current) => {
                            const next = new Set(current);
                            if (next.has(rowId)) next.delete(rowId);
                            else next.add(rowId);
                            return next;
                          });
                        }}
                        onKeyDown={(event) => event.stopPropagation()}
                      >
                        Detalhes
                      </Button>
                    </td>
                  )}
                </tr>
                {strategy === "expandable" &&
                  detailColumns.length > 0 &&
                  expanded.has(rowId) && (
                    <tr
                      className="mobile-details-row ds-data-table__details"
                      id={`row-details-${rowId}`}
                    >
                      <td colSpan={columns.length + (rowActions ? 2 : 1)}>
                        <dl>
                          {detailColumns.map((column) => (
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

export function TableToolbar({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={joinClasses("ds-table-toolbar", className)}>{children}</div>
  );
}

export type ActionMenuItem = {
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  tone?: "default" | "danger";
  separatorBefore?: boolean;
};

export function ActionMenu({
  label = "Mais ações",
  items,
}: {
  label?: string;
  items: ActionMenuItem[];
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        className="secondary icon-control action-menu-trigger ds-action-menu__trigger"
        aria-label={label}
      >
        <MoreHorizontal size={18} />
        <span>{label}</span>
        <ChevronDown size={14} />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          className="action-menu-content ds-action-menu"
          sideOffset={6}
          align="end"
        >
          {items.map((item) => (
            <Fragment key={item.label}>
              {item.separatorBefore && (
                <DropdownMenu.Separator className="ds-action-menu__separator" />
              )}
              <DropdownMenu.Item
                className={joinClasses(
                  "action-menu-item",
                  "ds-action-menu__item",
                  item.tone === "danger" && "is-danger",
                )}
                disabled={Boolean(item.disabled)}
                onSelect={item.onSelect}
              >
                {item.label}
              </DropdownMenu.Item>
            </Fragment>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function FilterChip({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      className="filter-chip ds-filter-chip"
      onClick={onRemove}
      aria-label={`Remover filtro ${label}`}
    >
      {label}
      <X size={14} aria-hidden="true" />
    </button>
  );
}

export function FilterBar({
  search,
  searchLabel = "Buscar",
  searchPlaceholder = "Digite para buscar…",
  onSearchChange,
  children,
  activeFilters = [],
  onClear,
  primaryFilters,
}: {
  search: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  onSearchChange: (value: string) => void;
  children?: ReactNode;
  activeFilters?: Array<{ key: string; label: string; onRemove: () => void }>;
  onClear?: () => void;
  primaryFilters?: ReactNode;
}) {
  const hasAdditionalActive = activeFilters.some((filter) =>
    ["status", "equipe", "instituicao"].includes(filter.key),
  );
  const [filtersOpen, setFiltersOpen] = useState(
    () =>
      hasAdditionalActive ||
      (typeof window !== "undefined" &&
        window.matchMedia("(min-width: 851px)").matches),
  );
  useEffect(() => {
    const media = window.matchMedia("(min-width: 851px)");
    const update = () => setFiltersOpen(media.matches || hasAdditionalActive);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, [hasAdditionalActive]);
  return (
    <section className="panel filter-bar ds-filter-bar">
      <div className="filter-bar-main">
        <label className="filter-search">
          <span>{searchLabel}</span>
          <SearchInput
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder={searchPlaceholder}
          />
        </label>
        {primaryFilters}
        {children && (
          <details
            className="filter-details"
            open={filtersOpen}
            onToggle={(event) => setFiltersOpen(event.currentTarget.open)}
          >
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
            <FilterChip
              key={filter.key}
              label={filter.label}
              onRemove={filter.onRemove}
            />
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

export function paginationTotalPages(total: number, pageSize: number) {
  return Math.max(1, Math.ceil(total / pageSize));
}

export function Pagination({
  page,
  pageSize = 25,
  total,
  onChange,
  pageSizeOptions,
  onPageSizeChange,
}: {
  page: number;
  pageSize?: number;
  total: number;
  onChange: (page: number) => void;
  pageSizeOptions?: number[];
  onPageSizeChange?: (size: number) => void;
}) {
  const pages = paginationTotalPages(total, pageSize);
  return (
    <div className="pagination ds-pagination" aria-label="Paginação">
      {pageSizeOptions && onPageSizeChange && (
        <label>
          Itens por página
          <select
            value={pageSize}
            onChange={(event) => onPageSizeChange(Number(event.target.value))}
          >
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </label>
      )}
      <button
        className="secondary"
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        Anterior
      </button>
      <span>
        Página {page} de {pages}
      </span>
      <button
        className="secondary"
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
      >
        Próxima
      </button>
    </div>
  );
}

export { EmptyState };
