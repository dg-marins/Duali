import { inclusiveDays } from "@duali/shared";
import { useEffect, useId, useMemo, useRef, useState, type FormEvent } from "react";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError, display, type Row } from "./api";
import { label, type Screen, type Field } from "./resources";
import {
  ConfirmDialog,
  FormActions,
  FormDialog,
  FilterBar,
  LoadingSkeleton,
  RefreshingContent,
  useFormDirty,
} from "./ui";
export function Notice({
  text,
  error = false,
}: {
  text: string;
  error?: boolean;
}) {
  return text ? (
    <div
      role={error ? "alert" : "status"}
      className={error ? "notice error" : "notice"}
    >
      {text}
    </div>
  ) : null;
}
export function Lookup({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: unknown;
  onChange: (value: unknown) => void;
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
    row.pessoa
      ? display(row.pessoa) + " · " + display(row.tipo)
      : display(row);
  useEffect(() => {
    let active = true;
    const timer = setTimeout(() => {
      setLoading(true);
      void api<{ items: Row[] }>(
        field.resource + "?pageSize=100&q=" + encodeURIComponent(q),
      )
        .then(async (result) => {
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
        type="button"
        className="searchable-trigger secondary"
        aria-label={field.label}
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
              aria-activedescendant={items[activeIndex] ? `${listId}-${String(items[activeIndex]!.id)}` : undefined}
              aria-label={"Buscar " + field.label}
              placeholder="Buscar opções…"
              value={q}
              onChange={(event) => {
                setQ(event.target.value);
                setActiveIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === "ArrowDown") {
                  event.preventDefault();
                  setActiveIndex((index) => Math.min(index + 1, items.length - 1));
                }
                if (event.key === "ArrowUp") {
                  event.preventDefault();
                  setActiveIndex((index) => Math.max(index - 1, 0));
                }
                if (event.key === "Enter" && items[activeIndex]) {
                  event.preventDefault();
                  onChange(String(items[activeIndex]!.id));
                  closeOptions();
                }
                if (event.key === "Escape") {
                  event.preventDefault();
                  event.stopPropagation();
                  closeOptions();
                }
              }}
            />
          </div>
          <div id={listId} role="listbox" aria-label={field.label} className="searchable-options">
            {!loading && !error && items.length === 0 && (
              <div className="searchable-state">Nenhuma opção encontrada.</div>
            )}
            {items.map((row, index) => (
              <button
                type="button"
                role="option"
                id={`${listId}-${String(row.id)}`}
                tabIndex={-1}
                aria-selected={String(row.id) === String(value ?? "")}
                className={index === activeIndex ? "searchable-option active" : "searchable-option"}
                key={String(row.id)}
                onMouseEnter={() => setActiveIndex(index)}
                onClick={() => {
                  onChange(String(row.id));
                  closeOptions();
                }}
              >
                <span>{optionLabel(row)}</span>
                {String(row.id) === String(value ?? "") && <Check size={16} aria-hidden="true" />}
              </button>
            ))}
          </div>
        </div>
      )}
      {field.required && (
        <input className="sr-only" tabIndex={-1} required value={String(value ?? "")} onChange={() => undefined} aria-hidden="true" />
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
    const payload: Row = {};
    for (const f of screen.fields) {
      const value = data[f.key];
      if (f.type === "password" && !value) continue;
      payload[f.key] =
        f.type === "checkbox"
          ? Boolean(value)
          : value === ""
            ? null
            : f.type === "number"
              ? Number(value)
              : value;
    }
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
        <button type="button" className="secondary" onClick={close}>
          Fechar
        </button>
      </div>
      <form onSubmit={(e) => void submit(e)}>
        <Notice text={error} error />
        <div className="form-grid">
          {screen.fields.map((f) => (
            <label key={f.key} className={f.type === "textarea" ? "wide" : ""}>
              <span>
                {f.label}
                {f.required ? " *" : ""}
              </span>
              {f.resource ? (
                <Lookup
                  field={f}
                  value={data[f.key]}
                  onChange={(v) => setData({ ...data, [f.key]: v })}
                />
              ) : f.options ? (
                <select
                  aria-label={f.label}
                  required={f.required ?? false}
                  value={String(data[f.key] ?? "")}
                  onChange={(e) =>
                    setData({ ...data, [f.key]: e.target.value })
                  }
                >
                  <option value="">Selecione…</option>
                  {f.options.map((v) => (
                    <option key={v}>{v}</option>
                  ))}
                </select>
              ) : f.type === "textarea" ? (
                <textarea
                  value={String(data[f.key] ?? "")}
                  onChange={(e) =>
                    setData({ ...data, [f.key]: e.target.value })
                  }
                />
              ) : (
                <input
                  type={f.type ?? "text"}
                  required={f.required ?? false}
                  step={f.type === "number" ? "0.01" : undefined}
                  autoComplete={
                    f.type === "password" ? "new-password" : undefined
                  }
                  {...(f.type === "checkbox"
                    ? { checked: Boolean(data[f.key]) }
                    : { value: String(data[f.key] ?? "") })}
                  onChange={(e) =>
                    setData({
                      ...data,
                      [f.key]:
                        f.type === "checkbox"
                          ? e.target.checked
                          : e.target.value,
                    })
                  }
                />
              )}{" "}
              {fields[f.key]?.map((message) => (
                <small className="field-error" key={message}>
                  {message}
                </small>
              ))}
            </label>
          ))}
        </div>
        {screen.path === "periodos" && data.dataInicio && data.dataFim ? (
          <p>
            Dias corridos inclusivos:{" "}
            {inclusiveDays(String(data.dataInicio), String(data.dataFim))}{" "}
            <button
              type="button"
              className="secondary compact"
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
            </button>
          </p>
        ) : null}
        <FormActions pending={saving} onCancel={close} />
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
  return (
    <>
      <div className="section-heading">
        <div>
          <h1>{screen.title}</h1>
          <p>{screen.description}</p>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setNotice("");
          }}
        >
          Novo registro
        </button>
      </div>
      <Notice text={notice} />
      <Notice text={error} error />
      <FormDialog
        open={editing !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditing(undefined);
        }}
        title={`${editing ? "Editar" : "Novo registro"} · ${screen.title}`}
        description={screen.description}
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
              setVersion(version + 1);
              setNotice("Registro salvo com sucesso.");
              toast.success("Registro salvo com sucesso.");
            }}
          />
        )}
      </FormDialog>
      <section className="panel">
        <FilterBar
          search={q}
          searchLabel="Buscar registros"
          onSearchChange={(value) => { setQ(value); setPage(1); }}
          activeFilters={q ? [{ key: "q", label: `Busca: ${q}`, onRemove: () => setQ("") }] : []}
        />
        <div className="result-count">{total} registros</div>
        {loading && !hasLoaded ? (
          <LoadingSkeleton
            label={`Carregando ${screen.title.toLowerCase()}…`}
          />
        ) : (
          <RefreshingContent refreshing={loading}>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    {screen.columns.map((k) => (
                      <th key={k}>{label(k, screen)}</th>
                    ))}
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={String(row.id)}>
                      {screen.columns.map((k) => (
                        <td key={k}>{display(row[k])}</td>
                      ))}
                      <td>
                        {onOpen && (
                          <button
                            className="secondary compact"
                            onClick={() => onOpen(row)}
                          >
                            Ver detalhes
                          </button>
                        )}{" "}
                        <button
                          className="secondary compact"
                          onClick={() => setEditing(row)}
                        >
                          Editar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!rows.length && (
                <p className="empty">
                  Nenhum registro encontrado. Cadastre o primeiro ou ajuste a
                  busca.
                </p>
              )}
            </div>
          </RefreshingContent>
        )}
        <div className="pagination">
          <button
            className="secondary"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Anterior
          </button>
          <span>Página {page}</span>
          <button
            className="secondary"
            disabled={page * 25 >= total}
            onClick={() => setPage(page + 1)}
          >
            Próxima
          </button>
        </div>
      </section>
    </>
  );
}
