import { inclusiveDays } from "@duali/shared";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { api, ApiError, display, type Row } from "./api";
import { label, type Screen, type Field } from "./resources";
import {
  ActionMenu,
  Button,
  Checkbox,
  ConfirmDialog,
  DataTable,
  DateInput,
  Dialog,
  EmptyState,
  FilterBar,
  FormField,
  Input,
  LoadingSkeleton,
  PageHeader,
  Pagination,
  RefreshingContent,
  Select,
  StatusBadge,
  Textarea,
  useFormDirty,
} from "./ui";
import { Notice } from "./components/ui";
/** @deprecated Import Notice from ./components/ui. */
export { Notice };

export function buildRecordPayload(screen: Screen, data: Row) {
  const payload: Row = {};
  for (const field of screen.fields) {
    const value = data[field.key];
    if (field.type === "password" && !value) continue;
    payload[field.key] =
      field.type === "checkbox"
        ? Boolean(value)
        : value === ""
          ? null
          : field.type === "number"
            ? Number(value)
            : value;
  }
  return payload;
}

export function Lookup({
  field,
  value,
  onChange,
  id,
  required,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
}: {
  field: Field;
  value: unknown;
  onChange: (value: unknown) => void;
  id?: string;
  required?: boolean;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}) {
  const [q, setQ] = useState(""),
    [items, setItems] = useState<Row[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [open, setOpen] = useState(false),
    [activeIndex, setActiveIndex] = useState(0);
  const listId = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const closeOptions = () => {
    setOpen(false);
    requestAnimationFrame(() => trigger.current?.focus());
  };
  const selected = items.find((row) => String(row.id) === String(value ?? ""));
  const optionLabel = (row: Row) =>
    field.resource === "instituicoes" && row.nome
      ? `${String(row.sigla ?? "").trim() ? `${String(row.sigla).trim()} - ` : ""}${String(row.nome)}`
      : field.resource === "configuracoes-beneficios"
        ? [
            display(row.unidade),
            String(row.tipo ?? "").replaceAll("_", " "),
            display(row.fornecedor),
          ]
            .filter((part) => part && part !== "—")
            .join(" · ")
        : row.pessoa
          ? display(row.pessoa) + " · " + display(row.tipo)
          : display(row);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      void api<{ items: Row[]; total?: number; pageSize?: number }>(
        field.resource + "?page=1&pageSize=100&q=" + encodeURIComponent(q),
      )
        .then(async (result) => {
          const pages = Math.ceil(
            (result.total ?? result.items.length) / (result.pageSize ?? 100),
          );
          const remaining = await Promise.all(
            Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
              api<{ items: Row[] }>(
                field.resource +
                  `?page=${index + 2}&pageSize=100&q=${encodeURIComponent(q)}`,
              ),
            ),
          );
          result.items = [
            ...result.items,
            ...remaining.flatMap((page) => page.items),
          ];
          if (q && !/^[0-9a-f-]{36}$/i.test(q)) {
            const normalized = q.toLocaleLowerCase("pt-BR");
            result.items = result.items.filter((row) =>
              `${optionLabel(row)} ${String(row.id)}`
                .toLocaleLowerCase("pt-BR")
                .includes(normalized),
            );
          }
          if (
            /^[0-9a-f-]{36}$/i.test(q) &&
            !result.items.some((r) => String(r.id) === q)
          ) {
            try {
              result.items.unshift(await api(field.resource + "/" + q));
            } catch {
              // O estado vazio torna explícito que o identificador não foi encontrado.
            }
          }
          if (value && !result.items.some((r) => r.id === value)) {
            const selected = await api(field.resource + "/" + String(value));
            result.items.unshift(selected);
          }
          if (active) {
            setItems(result.items);
            const exactIndex = result.items.findIndex(
              (row) => String(row.id) === q,
            );
            if (exactIndex >= 0) setActiveIndex(exactIndex);
            setError("");
          }
        })
        .catch(() => {
          if (active) setError("Falha ao carregar opções.");
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 150);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [field.resource, q, value]);
  useEffect(() => {
    if (!open) return;
    const closeOutside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, [open]);
  return (
    <div ref={root} className="lookup searchable-select" aria-busy={loading}>
      <button
        ref={trigger}
        id={id}
        type="button"
        className="searchable-trigger secondary"
        aria-label={field.label}
        aria-describedby={ariaDescribedBy}
        aria-invalid={ariaInvalid}
        aria-required={required || undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        onClick={() => setOpen(!open)}
      >
        <span>{selected ? optionLabel(selected) : "Selecione…"}</span>
        <ChevronsUpDown size={16} aria-hidden="true" />
      </button>
      {open && (
        <div className="searchable-popover">
          <div className="searchable-input">
            <Search size={16} aria-hidden="true" />
            <input
              autoFocus
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={open}
              aria-controls={listId}
              aria-activedescendant={
                items[activeIndex]
                  ? `${listId}-${String(items[activeIndex]!.id)}`
                  : undefined
              }
              aria-label={"Buscar " + field.label}
              placeholder="Buscar opções…"
              value={q}
              onChange={(event) => {
                setLoading(true);
                setQ(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveIndex((index) =>
                    Math.min(index + 1, items.length - 1),
                  );
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex((index) => Math.max(index - 1, 0));
                }
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.stopPropagation();
                  const activeItem = items[activeIndex];
                  if (activeItem) {
                    onChange(String(activeItem.id));
                    closeOptions();
                  }
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  closeOptions();
                }
              }}
            />
          </div>
          <div
            id={listId}
            role="listbox"
            aria-label={field.label}
            className="searchable-options"
          >
            {!loading && !error && items.length === 0 && (
              <div className="searchable-state">Nenhuma opção encontrada.</div>
            )}
            {loading && (
              <div className="searchable-state" role="status">
                Carregando opções…
              </div>
            )}
            {!loading &&
              items.map((row, index) => (
                <button
                  type="button"
                  role="option"
                  id={`${listId}-${String(row.id)}`}
                  tabIndex={-1}
                  aria-selected={String(row.id) === String(value ?? "")}
                  className={
                    index === activeIndex
                      ? "searchable-option active"
                      : "searchable-option"
                  }
                  key={String(row.id)}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => {
                    onChange(String(row.id));
                    closeOptions();
                  }}
                >
                  <span>{optionLabel(row)}</span>
                  {String(row.id) === String(value ?? "") && (
                    <Check size={16} aria-hidden="true" />
                  )}
                </button>
              ))}
          </div>
        </div>
      )}
      {(required ?? field.required) && (
        <input
          className="sr-only"
          tabIndex={-1}
          required
          value={String(value ?? "")}
          onChange={() => undefined}
          aria-hidden="true"
        />
      )}
      {error && <small className="field-error">{error}</small>}
      {loading && (
        <span className="sr-only" role="status">
          Carregando opções…
        </span>
      )}
    </div>
  );
}
export function RecordForm({
  screen,
  record,
  defaults,
  onClose,
  onSaved,
  embedded = false,
}: {
  screen: Screen;
  record: Row | null;
  defaults?: Row;
  onClose: () => void;
  onSaved: () => void;
  embedded?: boolean;
}) {
  const initial: Row = {};
  for (const f of screen.fields) {
    const value = record?.[f.key] ?? defaults?.[f.key] ?? f.default ?? "";
    initial[f.key] =
      f.type === "date" && typeof value === "string"
        ? value.slice(0, 10)
        : value;
  }
  const [data, setData] = useState(initial),
    [error, setError] = useState(""),
    [fields, setFields] = useState<Record<string, string[]>>({}),
    [saving, setSaving] = useState(false),
    [confirmClose, setConfirmClose] = useState(false);
  const dirty = useMemo(
    () => JSON.stringify(data) !== JSON.stringify(initial),
    [data, initial],
  );
  useFormDirty(dirty);
  const close = () => (dirty ? setConfirmClose(true) : onClose());
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setFields({});
    const payload = buildRecordPayload(screen, data);
    try {
      await api(
        screen.path + (record ? "/" + String(record.id) : ""),
        record ? "PUT" : "POST",
        payload,
      );
      onSaved();
    } catch (e) {
      setError((e as Error).message);
      if (e instanceof ApiError) setFields(e.fields);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className={embedded ? "form-panel embedded-form" : "panel form-panel"}>
      <div className="section-heading">
        <h2>
          {record ? "Editar" : "Novo registro"} · {screen.title}
        </h2>
        <Button type="button" variant="secondary" onClick={close}>
          Fechar
        </Button>
      </div>
      <form onSubmit={(e) => void submit(e)}>
        <Notice text={error} error />
        <div className="form-grid">
          {screen.fields.map((f) => {
            const update = (value: unknown) =>
              setData((current) => ({ ...current, [f.key]: value }));
            const fieldError = fields[f.key]?.join(" ");
            const value = data[f.key];
            const required = Boolean(
              f.required ||
                (screen.path === "usuarios" &&
                  !record &&
                  f.type === "password"),
            );
            return (
              <FormField
                key={f.key}
                label={f.label}
                required={required}
                {...(fieldError ? { error: fieldError } : {})}
                {...(f.type === "textarea" ? { className: "wide" } : {})}
                {...(screen.path === "usuarios" &&
                record &&
                f.type === "password"
                  ? { description: "Deixe vazio para manter a senha atual." }
                  : {})}
              >
                {f.resource ? (
                  <Lookup field={f} value={value} onChange={update} />
                ) : f.options ? (
                  <Select
                    value={String(value ?? "")}
                    onChange={(event) => update(event.target.value)}
                  >
                    <option value="">Selecione…</option>
                    {f.options.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </Select>
                ) : f.type === "textarea" ? (
                  <Textarea
                    value={String(value ?? "")}
                    onChange={(event) => update(event.target.value)}
                  />
                ) : f.type === "checkbox" ? (
                  <Checkbox
                    checked={Boolean(value)}
                    onChange={(event) => update(event.target.checked)}
                  />
                ) : f.type === "date" ? (
                  <DateInput
                    value={String(value ?? "")}
                    onChange={(event) => update(event.target.value)}
                  />
                ) : (
                  <Input
                    type={f.type ?? "text"}
                    step={f.type === "number" ? "0.01" : undefined}
                    autoComplete={
                      f.type === "password" ? "new-password" : undefined
                    }
                    value={String(value ?? "")}
                    onChange={(event) => update(event.target.value)}
                  />
                )}
              </FormField>
            );
          })}
        </div>
        {screen.path === "periodos" && data.dataInicio && data.dataFim ? (
          <p>
            Dias corridos inclusivos:{" "}
            {inclusiveDays(String(data.dataInicio), String(data.dataFim))}{" "}
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() =>
                setData({
                  ...data,
                  quantidadeDias: inclusiveDays(
                    String(data.dataInicio),
                    String(data.dataFim),
                  ),
                })
              }
            >
              Usar sugestão
            </Button>
          </p>
        ) : null}
        <div className="form-actions">
          <Button type="submit" loading={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
          <Button type="button" variant="secondary" onClick={close}>
            Cancelar
          </Button>
        </div>
      </form>
      <ConfirmDialog
        open={confirmClose}
        onOpenChange={setConfirmClose}
        title="Descartar alterações?"
        description="As informações preenchidas serão perdidas."
        confirmLabel="Descartar"
        onConfirm={onClose}
      />
    </div>
  );
}
export function Records({
  screen,
  onOpen,
}: {
  screen: Screen;
  onOpen?: (row: Row) => void;
}) {
  const [rows, setRows] = useState<Row[]>([]),
    [q, setQ] = useState(""),
    [page, setPage] = useState(1),
    [total, setTotal] = useState(0),
    [editing, setEditing] = useState<Row | null | undefined>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [loading, setLoading] = useState(true),
    [hasLoaded, setHasLoaded] = useState(false),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void api<{ items: Row[]; total: number }>(
      screen.path + "?page=" + page + "&q=" + encodeURIComponent(q),
    )
      .then((data) => {
        if (active) {
          setRows(data.items);
          setTotal(data.total);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setHasLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [screen.path, page, q, version]);
  const columns = screen.columns.map((key, index) => {
    const isStatus = ["ativo", "ativa", "status"].includes(key);
    return {
      key,
      label: label(key, screen),
      priority: isStatus
        ? ("always" as const)
        : index === 0
          ? ("primary" as const)
          : index === 1
            ? ("secondary" as const)
            : ("desktop" as const),
      render: (row: Row) =>
        isStatus ? (
          <StatusBadge
            value={
              typeof row[key] === "boolean"
                ? row[key]
                  ? "ATIVO"
                  : "INATIVO"
                : row[key]
            }
          />
        ) : (
          display(row[key])
        ),
    };
  });
  const openCreate = () => {
    setEditing(null);
    setNotice("");
  };
  return (
    <div className="registry-page">
      <PageHeader
        title={screen.title}
        description={screen.description}
        action={<Button onClick={openCreate}>Novo registro</Button>}
      />
      <Notice text={notice} />
      {error && rows.length > 0 && <Notice text={error} error />}
      <Dialog
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
        title={`${editing ? "Editar" : "Novo registro"} · ${screen.title}`}
        description={screen.description}
        className="registry-dialog"
        size="lg"
      >
        {editing !== undefined && (
          <RecordForm
            key={String(editing?.id ?? "new")}
            embedded
            screen={screen}
            record={editing}
            onClose={() => setEditing(undefined)}
            onSaved={() => {
              setEditing(undefined);
              setVersion((current) => current + 1);
              setNotice("Registro salvo com sucesso.");
            }}
          />
        )}
      </Dialog>
      <section className="panel registry-results">
        <FilterBar
          search={q}
          searchLabel="Buscar registros"
          onSearchChange={(value) => {
            setQ(value);
            setPage(1);
          }}
          activeFilters={
            q
              ? [
                  {
                    key: "q",
                    label: `Busca: ${q}`,
                    onRemove: () => {
                      setQ("");
                      setPage(1);
                    },
                  },
                ]
              : []
          }
        />
        <div className="result-count" aria-live="polite">
          {total} {total === 1 ? "registro" : "registros"}
        </div>
        {loading && !hasLoaded ? (
          <LoadingSkeleton
            label={`Carregando ${screen.title.toLowerCase()}…`}
          />
        ) : error && rows.length === 0 ? (
          <div className="registry-error">
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
            <DataTable
              rows={rows}
              columns={columns}
              primaryKey={screen.columns[0]!}
              responsiveStrategy="priority"
              empty={
                <EmptyState
                  title={q ? "Nenhum resultado" : "Nenhum cadastro"}
                  description={
                    q
                      ? "Não há registros para a busca informada."
                      : "Cadastre o primeiro registro para começar."
                  }
                  action={
                    q ? (
                      <Button
                        variant="secondary"
                        onClick={() => {
                          setQ("");
                          setPage(1);
                        }}
                      >
                        Limpar busca
                      </Button>
                    ) : (
                      <Button onClick={openCreate}>Novo registro</Button>
                    )
                  }
                />
              }
              rowActions={(row) => (
                <ActionMenu
                  label={`Ações de ${display(row)}`}
                  items={[
                    ...(onOpen
                      ? [
                          {
                            label: "Ver detalhes",
                            onSelect: () => onOpen(row),
                          },
                        ]
                      : []),
                    { label: "Editar", onSelect: () => setEditing(row) },
                  ]}
                />
              )}
            />
          </RefreshingContent>
        )}
        <Pagination page={page} total={total} onChange={setPage} />
      </section>
    </div>
  );
}
