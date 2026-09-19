import { useEffect, useState } from "react";
import { api, display, type Row } from "../../api";
import { Notice, RecordForm } from "../../components";
import { screens } from "../../resources";
import {
  DataTable,
  EmptyState,
  FormDialog,
  LoadingSkeleton,
  PageHeader,
  RefreshingContent,
  ConfirmDialog,
  Pagination,
  useFormDirty,
} from "../../ui";

const categories = [
  ["ALIMENTACAO", "Alimentação"],
  ["TRANSPORTE", "Transporte"],
  ["CESTA_BASICA", "Cesta básica"],
  ["PREMIACAO", "Premiação"],
  ["OUTRO", "Outro"],
];
async function all(path: string) {
  const first = await api<{ items: Row[]; total: number }>(
    path + "?pageSize=100",
  );
  const rest = await Promise.all(
    Array.from(
      { length: Math.max(0, Math.ceil(first.total / 100) - 1) },
      (_, i) => api<{ items: Row[] }>(path + "?pageSize=100&page=" + (i + 2)),
    ),
  );
  return [...first.items, ...rest.flatMap((page) => page.items)];
}
export function BenefitRegistryPage() {
  const [rows, setRows] = useState<Row[]>([]),
    [units, setUnits] = useState<Row[]>([]),
    [suppliers, setSuppliers] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [open, setOpen] = useState(false),
    [editing, setEditing] = useState<Row | null>(null),
    [version, setVersion] = useState(0);
  const [tipo, setTipo] = useState(""),
    [supplier, setSupplier] = useState(""),
    [selected, setSelected] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [discard, setDiscard] = useState(false),
    [filterType, setFilterType] = useState(""),
    [filterSupplier, setFilterSupplier] = useState(""),
    [filterUnit, setFilterUnit] = useState(""),
    [page, setPage] = useState(1);
  const dirty =
    open && !editing && Boolean(tipo || supplier || selected.length);
  useFormDirty(dirty);
  useEffect(() => {
    let active = true;
    setLoading(true);
    void Promise.all([
      all("configuracoes-beneficios"),
      all("unidades"),
      all("fornecedores"),
    ])
      .then(([records, units, suppliers]) => {
        if (active) {
          setRows(records);
          setUnits(units);
          setSuppliers(suppliers);
          setError("");
        }
      })
      .catch((e) => {
        if (active) setError((e as Error).message);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [version]);
  const close = () => {
    setOpen(false);
    setEditing(null);
    setTipo("");
    setSupplier("");
    setSelected([]);
  };
  const filtered = rows.filter(
    (row) =>
      (!filterType || row.tipo === filterType) &&
      (!filterSupplier || row.fornecedorId === filterSupplier) &&
      (!filterUnit || row.unidadeId === filterUnit),
  );
  return (
    <div className="golden-registry">
      <PageHeader
        title="Benefícios"
        description="Defina o benefício, o fornecedor e as unidades atendidas."
        action={
          <button
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
          >
            + Associar benefício
          </button>
        }
      />
      <Notice text={error} error />
      <section className="panel">
        <div className="registry-filters">
          <label>
            <span>Benefício</span>
            <select
              value={filterType}
              onChange={(e) => {
                setFilterType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {categories.map(([type, label]) => (
                <option key={type} value={type}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Fornecedor</span>
            <select
              value={filterSupplier}
              onChange={(e) => {
                setFilterSupplier(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              {suppliers.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {display(row)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Unidade</span>
            <select
              value={filterUnit}
              onChange={(e) => {
                setFilterUnit(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas</option>
              {units.map((row) => (
                <option key={String(row.id)} value={String(row.id)}>
                  {display(row)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {!loaded && loading ? (
          <LoadingSkeleton />
        ) : (
          <RefreshingContent refreshing={loading}>
            <DataTable
              rows={filtered.slice((page - 1) * 15, page * 15)}
              primaryKey="tipo"
              empty={
                <EmptyState
                  title="Nenhuma associação cadastrada"
                  description="Associe um benefício e fornecedor às unidades atendidas."
                />
              }
              columns={[
                {
                  key: "tipo",
                  label: "Benefício",
                  render: (row) =>
                    categories.find(([type]) => type === row.tipo)?.[1] ??
                    display(row.tipo),
                },
                {
                  key: "fornecedor",
                  label: "Fornecedor",
                  render: (row) => display(row.fornecedor),
                },
                {
                  key: "unidade",
                  label: "Unidade",
                  render: (row) => display(row.unidade),
                },
                {
                  key: "ativa",
                  label: "Situação",
                  render: (row) => (row.ativa ? "Ativa" : "Inativa"),
                },
                {
                  key: "actions",
                  label: "Ações",
                  render: (row) => (
                    <button
                      className="secondary compact"
                      onClick={() => {
                        setEditing(row);
                        setOpen(true);
                      }}
                    >
                      Editar associação
                    </button>
                  ),
                },
              ]}
            />
          </RefreshingContent>
        )}
        <Pagination
          page={page}
          total={filtered.length}
          pageSize={15}
          onChange={setPage}
        />
      </section>
      <FormDialog
        open={open}
        onOpenChange={(value) => {
          if (!value) {
            if (dirty) setDiscard(true);
            else close();
          }
        }}
        title={editing ? "Editar associação" : "Associar benefício"}
      >
        {editing ? (
          <RecordForm
            embedded
            screen={
              screens.find(
                (screen) => screen.path === "configuracoes-beneficios",
              )!
            }
            record={editing}
            onClose={close}
            onSaved={() => {
              close();
              setVersion((v) => v + 1);
            }}
          />
        ) : (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              setBusy(true);
              void api("configuracoes-beneficios/multiunidade", "POST", {
                tipo,
                fornecedorId: supplier,
                unidadeIds: selected,
                ativa: true,
              })
                .then(() => {
                  close();
                  setVersion((v) => v + 1);
                })
                .catch((e) => setError((e as Error).message))
                .finally(() => setBusy(false));
            }}
          >
            <Notice text={error} error />
            <label>
              <span>Benefício</span>
              <select
                required
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
              >
                <option value="">Selecione</option>
                {categories.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Fornecedor</span>
              <select
                required
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
              >
                <option value="">Selecione</option>
                {suppliers.map((row) => (
                  <option key={String(row.id)} value={String(row.id)}>
                    {display(row)}
                  </option>
                ))}
              </select>
            </label>
            <fieldset>
              <legend>Unidades</legend>
              <div className="registry-units">
                {units.map((row) => (
                  <label key={String(row.id)}>
                    <input
                      type="checkbox"
                      checked={selected.includes(String(row.id))}
                      onChange={(e) =>
                        setSelected(
                          e.target.checked
                            ? [...selected, String(row.id)]
                            : selected.filter((id) => id !== row.id),
                        )
                      }
                    />
                    <span>{display(row)}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <p>
              Associações existentes serão preservadas. A operação não altera
              competências ou compras.
            </p>
            <div className="form-actions">
              <button disabled={busy || !selected.length}>
                {busy ? "Salvando…" : "Salvar associações"}
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => (dirty ? setDiscard(true) : close())}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
      </FormDialog>
      <ConfirmDialog
        open={discard}
        onOpenChange={setDiscard}
        title="Descartar alterações?"
        description="Os dados preenchidos não serão salvos."
        onConfirm={() => {
          setDiscard(false);
          close();
        }}
      />
    </div>
  );
}
