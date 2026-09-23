import {
  forwardRef,
  cloneElement,
  isValidElement,
  useEffect,
  useId,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type ReactElement,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { Search } from "lucide-react";
import { joinClasses } from "./utils";

export type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
export type LegacyButtonVariant = "default" | "outline" | "destructive";
export type ButtonSize = "sm" | "md" | "lg";

const legacyVariants: Record<LegacyButtonVariant, ButtonVariant> = {
  default: "primary",
  outline: "secondary",
  destructive: "danger",
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant | LegacyButtonVariant;
  size?: ButtonSize | "default";
  loading?: boolean | undefined;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      loading = false,
      disabled,
      children,
      ...props
    },
    ref,
  ) => {
    const resolvedVariant =
      variant in legacyVariants
        ? legacyVariants[variant as LegacyButtonVariant]
        : variant;
    const resolvedSize = size === "default" ? "md" : size;
    return (
      <button
        ref={ref}
        className={joinClasses(
          "ds-button",
          `ds-button--${resolvedVariant}`,
          `ds-button--${resolvedSize}`,
          className,
        )}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading && <span className="ds-button__spinner" aria-hidden="true" />}
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label"> {
  "aria-label": string;
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    { className, variant = "ghost", size = "md", type = "button", ...props },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      className={joinClasses(
        "ds-icon-button",
        `ds-button--${variant}`,
        `ds-button--${size}`,
        className,
      )}
      {...props}
    />
  ),
);
IconButton.displayName = "IconButton";

type FormFieldProps = {
  label: ReactNode;
  children?: ReactNode;
  id?: string;
  description?: ReactNode;
  error?: ReactNode;
  required?: boolean;
  className?: string;
};

export function FormField({
  label,
  children,
  id,
  description,
  error,
  required,
  className,
}: FormFieldProps) {
  const generatedId = useId();
  const fieldId = id ?? generatedId;
  const descriptionId = description ? `${fieldId}-description` : undefined;
  const errorId = error ? `${fieldId}-error` : undefined;
  const describedBy =
    [descriptionId, errorId].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(
        children as ReactElement<{
          id?: string;
          "aria-describedby"?: string;
          "aria-invalid"?: boolean;
          required?: boolean;
        }>,
        {
          id: fieldId,
          ...(describedBy ? { "aria-describedby": describedBy } : {}),
          ...(error ? { "aria-invalid": true } : {}),
          ...(required == null ? {} : { required }),
        },
      )
    : children;
  return (
    <div className={joinClasses("ds-form-field", className)}>
      <label htmlFor={fieldId}>
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      <div
        className="ds-form-field__control"
        data-field-id={fieldId}
        data-describedby={[descriptionId, errorId].filter(Boolean).join(" ")}
        data-invalid={Boolean(error) || undefined}
      >
        {control}
      </div>
      {description && (
        <div id={descriptionId} className="ds-form-field__description">
          {description}
        </div>
      )}
      {error && (
        <div id={errorId} className="ds-form-field__error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

export const Input = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input ref={ref} className={joinClasses("ds-input", className)} {...props} />
));
Input.displayName = "Input";

export const SearchInput = forwardRef<
  HTMLInputElement,
  InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <span className={joinClasses("ds-search-input", className)}>
    <Search size={16} aria-hidden="true" />
    <input ref={ref} type="search" {...props} />
  </span>
));
SearchInput.displayName = "SearchInput";

export const Select = forwardRef<
  HTMLSelectElement,
  SelectHTMLAttributes<HTMLSelectElement>
>(({ className, ...props }, ref) => (
  <select
    ref={ref}
    className={joinClasses("ds-select", className)}
    {...props}
  />
));
Select.displayName = "Select";

export const DateInput = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type">
>((props, ref) => <Input ref={ref} type="date" {...props} />);
DateInput.displayName = "DateInput";

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={joinClasses("ds-textarea", className)}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Checkbox = forwardRef<
  HTMLInputElement,
  Omit<InputHTMLAttributes<HTMLInputElement>, "type">
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="checkbox"
    className={joinClasses("ds-checkbox", className)}
    {...props}
  />
));
Checkbox.displayName = "Checkbox";

export function normalizeCurrencyInput(value: string) {
  const cleaned = value.replace(/[^\d,.-]/g, "").trim();
  if (!cleaned) return "";
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? number.toFixed(2) : null;
}

export function sanitizeCurrencyText(value: string) {
  return value.replace(/[^\d,.-]/g, "");
}

export function formatCurrencyInput(value: string) {
  if (!value) return "";
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(number);
}

export interface CurrencyInputProps
  extends Omit<
    InputHTMLAttributes<HTMLInputElement>,
    "value" | "onChange" | "onBlur"
  > {
  value: string;
  onValueChange: (value: string) => void;
  ariaLabel?: string;
}

export function CurrencyInput({
  value,
  onValueChange,
  ariaLabel,
  className,
  onFocus,
  ...props
}: CurrencyInputProps) {
  const [text, setText] = useState(() => formatCurrencyInput(value));
  useEffect(() => setText(formatCurrencyInput(value)), [value]);
  return (
    <input
      {...props}
      className={joinClasses("ds-input", "ds-currency-input", className)}
      aria-label={ariaLabel ?? props["aria-label"]}
      inputMode="decimal"
      value={text}
      onFocus={(event) => {
        setText(value ? value.replace(".", ",") : "");
        onFocus?.(event);
      }}
      onChange={(event) => setText(sanitizeCurrencyText(event.target.value))}
      onBlur={() => {
        const normalized = normalizeCurrencyInput(text);
        if (normalized !== null) onValueChange(normalized);
        setText(normalized === null ? text : formatCurrencyInput(normalized));
      }}
    />
  );
}
