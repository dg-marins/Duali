/** Compatibility facade. New code should import from ./components/ui. */
import type { ReactNode } from "react";
import { Button } from "./components/ui";

export {
  ActionMenu,
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  CurrencyInput,
  DataTable,
  DateInput,
  Dialog,
  EmptyState,
  FilterBar,
  FilterChip,
  FormDialog,
  FormField,
  FormSheet,
  IconButton,
  Input,
  LoadingSkeleton,
  MetricCard,
  Pagination,
  RefreshingContent,
  SearchInput,
  Select,
  Sheet,
  StatusBadge,
  TableToolbar,
  Textarea,
  formatCurrencyInput,
  normalizeCurrencyInput,
  sanitizeCurrencyText,
  paginationTotalPages,
  resolveColumnPriority,
  statusDefinition,
  useFormDirty,
  type ActionMenuItem,
  type ButtonProps,
  type ButtonSize,
  type ButtonVariant,
  type ColumnPriority,
  type CurrencyInputProps,
  type DataTableColumn,
  type DialogProps,
  type LegacyButtonVariant,
  type LegacyMobilePriority,
  type ResponsiveTableStrategy,
  type SemanticTone,
  type SortDirection,
} from "./components/ui";

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
      <Button loading={pending}>{pending ? "Salvando…" : submitLabel}</Button>
      <Button type="button" variant="secondary" onClick={onCancel}>
        Cancelar
      </Button>
    </div>
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
export function maskPhone(value: unknown) {
  const digits = String(value ?? "").replace(/\D/g, "");
  if (digits.length === 11)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  if (digits.length === 10)
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  return digits || "—";
}
