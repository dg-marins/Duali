import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { ApiError, api, display, type Row } from "../../../api";
import {
  ActionMenu,
  Button,
  ConfirmDialog,
  CurrencyInput,
  DataTable,
  DateInput,
  Dialog,
  EmptyState,
  FormField,
  Input,
  LoadingSkeleton,
  MetricCard,
  PageHeader,
  RefreshingContent,
  Sheet,
  StatusBadge,
  Textarea,
  Timeline,
  money,
  useFormDirty,
} from "../../../components/ui";
import { Notice, RecordForm } from "../../../components";
import { formatDate, maskCpf, maskPhone } from "../../../ui";
import { registerNavigationGuard } from "../../../navigationGuard";
import { screens } from "../../../resources";
import { usePeopleOptions } from "../usePeopleOptions";

type Navigate = (path: string) => void;
type ListResult = { items: Row[]; total: number; pageSize: number };
const weekdayLabels: Record<string, string> = {
  SEG: "Segunda",
  TER: "Terça",
  QUA: "Quarta",
  QUI: "Quinta",
  SEX: "Sexta",
  SAB: "Sábado",
  DOM: "Domingo",
};
const benefitLabels: Record<string, string> = {
  ALIMENTACAO: "Alimentação",
  TRANSPORTE: "Transporte",
  CESTA_BASICA: "Cesta básica",
  PREMIACAO: "Premiação",
  OUTRO: "Outro",
};
const documentLabels: Record<string, string> = {
  TCE: "TCE",
  ADITIVO: "Aditivo ao TCE",
  RENOVACAO: "Renovação histórica",
  DISTRATO: "Distrato",
  OUTRO: "Outro documento",
};
const conductionLabels: Record<string, string> = {
  ONIBUS: "Ônibus",
  ONIBUS_INTER: "Ônibus Intermunicipal",
  BARCA: "Barca",
  METRO: "Metrô",
  TREM: "Trem",
  OUTROS: "Outros",
};
const decimalInputValue = (value: string) => {
  const cleaned = value.replace(/[^\d,.-]/g, "").trim();
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : 0;
};
function StructuredScaleFields({
  value,
  onChange,
}: {
  value: Row | null | undefined;
  onChange: (value: Row | null) => void;
}) {
  const type = String(value?.tipo ?? "");
  const selected = (value?.diasSemana as string[] | undefined) ?? [];
  return (
    <fieldset className="wide">
      <legend>Escala de dias trabalhados</legend>
      <div className="form-grid">
        <label>
          <span>Modalidade</span>
          <select
            value={type}
            onChange={(event) => {
              const next = event.target.value;
              onChange(
                next === "DIAS_SEMANA"
                  ? { tipo: next, diasSemana: [] }
                  : next === "QUANTIDADE_SEMANAL"
                    ? { tipo: next, quantidadeDiasSemana: 1 }
                    : null,
              );
            }}
          >
            <option value="">Não informar agora</option>
            <option value="DIAS_SEMANA">Dias específicos da semana</option>
            <option value="QUANTIDADE_SEMANAL">
              Quantidade de dias por semana
            </option>
          </select>
        </label>
        {type === "QUANTIDADE_SEMANAL" && (
          <label>
            <span>Dias por semana</span>
            <input
              type="number"
              min="1"
              max="7"
              value={String(value?.quantidadeDiasSemana ?? 1)}
              onChange={(event) =>
                onChange({
                  tipo: "QUANTIDADE_SEMANAL",
                  quantidadeDiasSemana: Number(event.target.value),
                })
              }
            />
          </label>
        )}
      </div>
      {type === "DIAS_SEMANA" && (
        <div
          className="scale-weekdays"
          role="group"
          aria-label="Dias da semana"
        >
          {Object.entries(weekdayLabels).map(([day, label]) => (
            <label
              className={`scale-weekday${selected.includes(day) ? " is-selected" : ""}`}
              key={day}
            >
              <input
                type="checkbox"
                checked={selected.includes(day)}
                onChange={(event) =>
                  onChange({
                    tipo: "DIAS_SEMANA",
                    diasSemana: event.target.checked
                      ? [...selected, day]
                      : selected.filter((item) => item !== day),
                  })
                }
              />
              <span>{label}</span>
            </label>
          ))}
        </div>
      )}
    </fieldset>
  );
}
const editablePersonFields = [
  "nomeCompleto",
  "cpf",
  "rg",
  "dataNascimento",
  "email",
  "telefone",
  "observacoes",
] as const;

function PersonForm({
  person,
  onClose,
  onSaved,
  onDirtyChange,
}: {
  person: Row;
  onClose: () => void;
  onSaved: (id?: string) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const initial = useMemo<Row>(
    () =>
      Object.fromEntries(
        editablePersonFields.map((key) => [
          key,
          key === "dataNascimento"
            ? String(person[key] ?? "").slice(0, 10)
            : (person[key] ?? ""),
        ]),
      ),
    [person],
  );
  const [data, setData] = useState<Row>(initial);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const dirty = JSON.stringify(data) !== JSON.stringify(initial);
  useFormDirty(dirty);
  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  const update = (key: string, value: string) =>
    setData((current) => ({
      ...current,
      [key]: ["cpf", "rg", "telefone"].includes(key)
        ? value.replace(/\D/g, "")
        : value,
    }));
  const close = () => (dirty ? setConfirmClose(true) : onClose());

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setFields({});
    const payload = Object.fromEntries(
      editablePersonFields.map((key) => [
        key,
        data[key] === "" ? null : data[key],
      ]),
    );
    try {
      await api<Row>("pessoas/" + String(person.id), "PUT", payload);
      onDirtyChange?.(false);
      onSaved(String(person.id));
    } catch (reason) {
      setError((reason as Error).message);
      if (reason instanceof ApiError) setFields(reason.fields);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      className="panel person-editor-form"
      aria-labelledby="person-editor-title"
    >
      <h2 id="person-editor-title">Dados da pessoa</h2>
      <Notice text={error} error />
      <form onSubmit={(event) => void submit(event)}>
        <fieldset>
          <legend>Dados pessoais</legend>
          <div className="form-grid">
            <FormField
              label="Nome completo"
              required
              error={fields.nomeCompleto?.join(" ")}
            >
              <Input
                required
                value={String(data.nomeCompleto ?? "")}
                onChange={(event) => update("nomeCompleto", event.target.value)}
              />
            </FormField>
            <FormField label="CPF" error={fields.cpf?.join(" ")}>
              <Input
                inputMode="numeric"
                value={String(data.cpf ?? "")}
                onChange={(event) => update("cpf", event.target.value)}
              />
            </FormField>
            <FormField label="RG" error={fields.rg?.join(" ")}>
              <Input
                inputMode="numeric"
                value={String(data.rg ?? "")}
                onChange={(event) => update("rg", event.target.value)}
              />
            </FormField>
            <FormField
              label="Data de nascimento"
              error={fields.dataNascimento?.join(" ")}
            >
              <DateInput
                value={String(data.dataNascimento ?? "")}
                onChange={(event) =>
                  update("dataNascimento", event.target.value)
                }
              />
            </FormField>
          </div>
        </fieldset>
        <fieldset>
          <legend>Contato</legend>
          <div className="form-grid">
            <FormField label="E-mail" error={fields.email?.join(" ")}>
              <Input
                type="email"
                value={String(data.email ?? "")}
                onChange={(event) => update("email", event.target.value)}
              />
            </FormField>
            <FormField label="Telefone" error={fields.telefone?.join(" ")}>
              <Input
                inputMode="tel"
                value={String(data.telefone ?? "")}
                onChange={(event) => update("telefone", event.target.value)}
              />
            </FormField>
          </div>
        </fieldset>
        <fieldset>
          <legend>Observações</legend>
          <FormField label="Observações">
            <Textarea
              value={String(data.observacoes ?? "")}
              onChange={(event) => update("observacoes", event.target.value)}
            />
          </FormField>
        </fieldset>
        <div className="form-actions">
          <Button disabled={busy}>
            {busy ? "Salvando…" : "Salvar alterações"}
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
    </section>
  );
}

export function PersonEditor({
  id,
  navigate,
}: {
  id?: string;
  navigate: Navigate;
}) {
  const [person, setPerson] = useState<Row | undefined>();
  const [loading, setLoading] = useState(Boolean(id));
  const [error, setError] = useState("");
  const [dirty, setDirty] = useState(false);
  const [confirmBack, setConfirmBack] = useState(false);
  const pendingNavigation = useRef<(() => void) | null>(null);
  const destination = id ? "/app/pessoas/" + id : "/app/pessoas";

  useEffect(() => {
    if (!id) return;
    void api<Row>("pessoas/" + id)
      .then(setPerson)
      .catch((reason) => setError((reason as Error).message))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!dirty) return;
    const unregister = registerNavigationGuard((_target, proceed) => {
      pendingNavigation.current = proceed;
      setConfirmBack(true);
      return true;
    });
    const unload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", unload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", unload);
    };
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const marker = { ...(history.state ?? {}), dualiPersonEditorGuard: true };
    history.pushState(marker, "", location.href);
    let allowing = false;
    const back = () => {
      if (allowing) return;
      history.pushState(marker, "", location.href);
      pendingNavigation.current = () => {
        allowing = true;
        history.go(-2);
      };
      setConfirmBack(true);
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [dirty]);

  const leave = (proceed: () => void) => {
    if (!dirty) proceed();
    else {
      pendingNavigation.current = proceed;
      setConfirmBack(true);
    }
  };

  if (loading)
    return <LoadingSkeleton variant="detail" label="Carregando pessoa…" />;
  if (error || !person)
    return (
      <Notice text={error || "Não foi possível localizar a pessoa."} error />
    );

  return (
    <div className="person-editor-page">
      <PageHeader
        title="Editar pessoa"
        description="Atualize dados pessoais, contato e observações."
        breadcrumb={
          <Button
            variant="ghost"
            onClick={() => leave(() => navigate(destination))}
          >
            ← Voltar ao perfil
          </Button>
        }
      />
      <PersonForm
        person={person}
        onClose={() => leave(() => navigate(destination))}
        onSaved={(savedId) => {
          setDirty(false);
          navigate(id && savedId ? "/app/pessoas/" + savedId : "/app/pessoas");
        }}
        onDirtyChange={setDirty}
      />
      <ConfirmDialog
        open={confirmBack}
        onOpenChange={(open) => {
          setConfirmBack(open);
          if (!open) pendingNavigation.current = null;
        }}
        title="Descartar alterações?"
        description="As informações preenchidas serão perdidas."
        confirmLabel="Descartar"
        onConfirm={() => {
          const proceed = pendingNavigation.current;
          pendingNavigation.current = null;
          setDirty(false);
          requestAnimationFrame(() => proceed?.());
        }}
      />
    </div>
  );
}
function TransportSupplierSummary({ items }: { items: Row[] }) {
  if (!items.length)
    return <p className="muted">Transporte não configurado.</p>;
  const suppliers = new Map<string, { name: string; items: Row[] }>();
  for (const item of items) {
    const supplier = item.fornecedor as Row | undefined;
    const name = supplier?.nome
      ? String(supplier.nome)
      : "Fornecedor não informado";
    const key = String(item.fornecedorId ?? name);
    const group = suppliers.get(key) ?? { name, items: [] };
    group.items.push(item);
    suppliers.set(key, group);
  }
  return (
    <section
      className="transport-suppliers"
      aria-label="Fornecedores de transporte"
    >
      <h3>Fornecedores e conduções</h3>
      <div className="transport-supplier-grid">
        {[...suppliers].map(([key, supplier]) => (
          <section className="transport-supplier-card" key={key}>
            <h4>{supplier.name}</h4>
            <ul>
              {supplier.items.map((item) => (
                <li key={String(item.id)}>
                  <span>
                    {conductionLabels[String(item.tipoConducao)] ??
                      display(item.tipoConducao)}
                    {item.ativo === false && (
                      <small className="muted"> · Inativo</small>
                    )}
                  </span>
                  <strong>
                    {money(item.valorDiario)}
                    <small> / dia</small>
                  </strong>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </section>
  );
}

function ProfileDocumentsTable({
  documents,
  onEdit,
  onReverse,
}: {
  documents: Row[];
  onEdit: (document: Row) => void;
  onReverse: (document: Row) => void;
}) {
  return (
    <DataTable
      rows={documents}
      primaryKey="tipo"
      responsiveStrategy="expandable"
      getRowLabel={(row) =>
        documentLabels[String(row.tipo)] ?? String(row.tipo)
      }
      columns={[
        {
          key: "tipo",
          label: "Documento",
          priority: "primary",
          render: (row) => documentLabels[String(row.tipo)] ?? String(row.tipo),
        },
        {
          key: "estadoOperacional",
          label: "Situação",
          priority: "always",
          render: (row) => (
            <StatusBadge value={row.estadoOperacional ?? row.status} />
          ),
        },
        {
          key: "inicioVigencia",
          label: "Início",
          priority: "secondary",
          render: (row) => formatDate(row.inicioVigencia),
        },
        {
          key: "fimVigencia",
          label: "Fim",
          priority: "secondary",
          render: (row) => formatDate(row.fimVigencia),
        },
      ]}
      empty={
        <EmptyState
          title="Nenhum documento"
          description="Ainda não existem documentos neste vínculo."
        />
      }
      rowActions={(row) => (
        <ActionMenu
          label={`Ações de ${documentLabels[String(row.tipo)] ?? String(row.tipo)}`}
          items={[
            { label: "Editar documento", onSelect: () => onEdit(row) },
            ...(row.tipo === "DISTRATO" && row.status !== "CANCELADO"
              ? [
                  {
                    label: "Reverter distrato",
                    onSelect: () => onReverse(row),
                  },
                ]
              : []),
          ]}
        />
      )}
    />
  );
}

function ProfileBenefitForm({
  person,
  link,
  record,
  ambiguousLink,
  onClose,
  onSaved,
}: {
  person: Row;
  link: Row | null;
  record: Row | null;
  ambiguousLink: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const initialType = String(record?.tipo ?? "ALIMENTACAO");
  const [type, setType] = useState(initialType),
    [start, setStart] = useState(
      String(record?.inicioVigencia ?? new Date().toISOString()).slice(0, 10),
    ),
    [end, setEnd] = useState(String(record?.fimVigencia ?? "").slice(0, 10)),
    [status, setStatus] = useState(String(record?.status ?? "ATIVO")),
    [configId, setConfigId] = useState(
      String(record?.configuracaoRecorrenteId ?? ""),
    ),
    [dailyValue, setDailyValue] = useState(String(record?.valorDiario ?? "")),
    [quantity, setQuantity] = useState(
      String(record?.quantidadeRecorrente ?? ""),
    ),
    [unitValue, setUnitValue] = useState(
      String(record?.valorUnitarioRecorrente ?? ""),
    ),
    [notes, setNotes] = useState(String(record?.observacoes ?? "")),
    [configs, setConfigs] = useState<Row[]>([]),
    [transportItems, setTransportItems] = useState<
      Array<{
        id?: string;
        tipoConducao: string;
        fornecedorId: string;
        valorDiario: string;
      }>
    >(
      ((record?.transporteItens as Row[] | undefined) ?? [])
        .filter((item) => item.ativo !== false)
        .map((item) => ({
          ...(item.id ? { id: String(item.id) } : {}),
          tipoConducao: String(item.tipoConducao ?? "ONIBUS"),
          fornecedorId: String(item.fornecedorId ?? ""),
          valorDiario: String(item.valorDiario ?? ""),
        })),
    ),
    [loading, setLoading] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false),
    [confirmClose, setConfirmClose] = useState(false);
  const unit = link?.unidade as Row | undefined;
  useFormDirty(dirty);
  useEffect(() => {
    if (!link?.unidadeId) return;
    let active = true;
    setLoading(true);
    void api<ListResult>(
      `configuracoes-beneficios?page=1&pageSize=100&unidadeId=${link.unidadeId}&tipo=${type}`,
    )
      .then((result) => {
        if (!active) return;
        const valid = result.items.filter(
          (item) =>
            (item.ativa && (item.fornecedor as Row | undefined)?.ativo) ||
            String(item.id) === String(record?.configuracaoRecorrenteId ?? ""),
        );
        setConfigs(valid);
        setConfigId((current) =>
          valid.some((item) => String(item.id) === current)
            ? current
            : String(valid[0]?.id ?? ""),
        );
        setError("");
      })
      .catch((reason) => active && setError((reason as Error).message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [link?.unidadeId, type]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!link || ambiguousLink) return;
    setSaving(true);
    setError("");
    try {
      const benefit = {
        vinculoId: link.id,
        tipo: type,
        inicioVigencia: start,
        fimVigencia: end || null,
        status,
        configuracaoRecorrenteId:
          type === "TRANSPORTE" ? null : configId || null,
        valorDiario: type === "ALIMENTACAO" ? dailyValue || null : null,
        quantidadeRecorrente: ["ALIMENTACAO", "TRANSPORTE"].includes(type)
          ? null
          : quantity || null,
        valorUnitarioRecorrente: ["ALIMENTACAO", "TRANSPORTE"].includes(type)
          ? null
          : unitValue || null,
        observacoes: notes || null,
      };
      if (type === "TRANSPORTE")
        await api(
          `configuracoes-transporte${record ? `/${record.id}` : ""}`,
          record ? "PUT" : "POST",
          {
            beneficio: benefit,
            items: transportItems.map((item) => ({
              ...(record && item.id ? { id: item.id } : {}),
              tipoConducao: item.tipoConducao,
              fornecedorId: item.fornecedorId,
              valorDiario: item.valorDiario,
              inicioVigencia: start,
              fimVigencia: end || null,
              ativo: status === "ATIVO",
            })),
          },
        );
      else
        await api(
          `beneficios-vinculo${record ? `/${record.id}` : ""}`,
          record ? "PUT" : "POST",
          benefit,
        );
      onSaved();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }
  if (!link || ambiguousLink)
    return (
      <Notice
        error
        text="Não foi possível identificar um único vínculo ativo. Revise os vínculos da pessoa antes de adicionar o benefício."
      />
    );
  const typeOptions = [
    "TRANSPORTE",
    "ALIMENTACAO",
    "CESTA_BASICA",
    "PREMIACAO",
    "OUTRO",
  ];
  return (
    <>
      <form className="embedded-form" onSubmit={(event) => void submit(event)}>
        <Notice text={error} error />
        <div className="form-context-card">
          <span>Pessoa</span>
          <strong>{String(person.nomeCompleto)}</strong>
          <small>{display(unit)}</small>
        </div>
        <div className="form-grid">
          <label>
            <span>Tipo *</span>
            <select
              value={type}
              disabled={Boolean(record)}
              onChange={(event) => {
                setType(event.target.value);
                setDirty(true);
              }}
            >
              {typeOptions.map((value) => (
                <option key={value} value={value}>
                  {benefitLabels[value]}
                </option>
              ))}
            </select>
          </label>
          {type !== "TRANSPORTE" && (
            <label>
              <span>Fornecedor recorrente *</span>
              <select
                value={configId}
                required
                disabled={loading || !configs.length}
                onChange={(event) => {
                  setConfigId(event.target.value);
                  setDirty(true);
                }}
              >
                <option value="">Selecione…</option>
                {configs.map((config) => (
                  <option key={String(config.id)} value={String(config.id)}>
                    {display(config.fornecedor)}
                    {!config.ativa ||
                    !(config.fornecedor as Row | undefined)?.ativo
                      ? " (inativo)"
                      : ""}
                  </option>
                ))}
              </select>
              {!loading && !configs.length && (
                <small className="field-error">
                  Não há fornecedor ativo configurado para {display(unit)} e{" "}
                  {benefitLabels[type]?.toLowerCase()}.
                </small>
              )}
            </label>
          )}
          <label>
            <span>Início da vigência *</span>
            <input
              type="date"
              required
              value={start}
              onChange={(event) => {
                setStart(event.target.value);
                setDirty(true);
              }}
            />
          </label>
          <label>
            <span>Fim da vigência</span>
            <input
              type="date"
              value={end}
              onChange={(event) => {
                setEnd(event.target.value);
                setDirty(true);
              }}
            />
          </label>
          <label>
            <span>Status</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setDirty(true);
              }}
            >
              <option value="ATIVO">Ativo</option>
              <option value="ENCERRADO">Encerrado</option>
            </select>
          </label>
          {type === "ALIMENTACAO" && (
            <label>
              <span>Valor diário</span>
              <CurrencyInput
                value={dailyValue}
                onValueChange={(value) => {
                  setDailyValue(value);
                  setDirty(true);
                }}
              />
            </label>
          )}
          {!["ALIMENTACAO", "TRANSPORTE"].includes(type) && (
            <>
              <label>
                <span>Quantidade recorrente</span>
                <input
                  inputMode="decimal"
                  value={quantity}
                  onChange={(event) => {
                    setQuantity(event.target.value);
                    setDirty(true);
                  }}
                />
              </label>
              <label>
                <span>Valor unitário recorrente</span>
                <CurrencyInput
                  value={unitValue}
                  onValueChange={(value) => {
                    setUnitValue(value);
                    setDirty(true);
                  }}
                />
              </label>
            </>
          )}
          {type === "TRANSPORTE" && (
            <div className="wide transport-editor">
              <div>
                <strong>Transportes recorrentes</strong>
                <p className="muted">
                  O fornecedor realiza a compra e recebe a solicitação de
                  crédito.
                </p>
              </div>
              {transportItems.map((item, index) => (
                <div className="transport-editor-row" key={item.id ?? index}>
                  <label>
                    <span>Condução *</span>
                    <select
                      value={item.tipoConducao}
                      onChange={(event) => {
                        setTransportItems((all) =>
                          all.map((current, itemIndex) =>
                            itemIndex === index
                              ? { ...current, tipoConducao: event.target.value }
                              : current,
                          ),
                        );
                        setDirty(true);
                      }}
                    >
                      <option value="ONIBUS">Ônibus</option>
                      <option value="ONIBUS_INTER">
                        Ônibus Intermunicipal
                      </option>
                      <option value="BARCA">Barca</option>
                      <option value="METRO">Metrô</option>
                      <option value="TREM">Trem</option>
                      <option value="OUTROS">Outros</option>
                    </select>
                  </label>
                  <label>
                    <span>Fornecedor *</span>
                    <select
                      required
                      value={item.fornecedorId}
                      onChange={(event) => {
                        setTransportItems((all) =>
                          all.map((current, itemIndex) =>
                            itemIndex === index
                              ? { ...current, fornecedorId: event.target.value }
                              : current,
                          ),
                        );
                        setDirty(true);
                      }}
                    >
                      <option value="">Selecione…</option>
                      {configs.map((config) => (
                        <option
                          key={String(config.fornecedorId)}
                          value={String(config.fornecedorId)}
                        >
                          {display(config.fornecedor)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>Valor diário *</span>
                    <CurrencyInput
                      required
                      value={item.valorDiario}
                      onValueChange={(value) => {
                        setTransportItems((all) =>
                          all.map((current, itemIndex) =>
                            itemIndex === index
                              ? { ...current, valorDiario: value }
                              : current,
                          ),
                        );
                        setDirty(true);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      setTransportItems((all) =>
                        all.filter((_, itemIndex) => itemIndex !== index),
                      );
                      setDirty(true);
                    }}
                  >
                    Remover
                  </button>
                </div>
              ))}
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    setTransportItems((all) => [
                      ...all,
                      {
                        tipoConducao: "ONIBUS",
                        fornecedorId: "",
                        valorDiario: "",
                      },
                    ]);
                    setDirty(true);
                  }}
                >
                  + Adicionar transporte
                </button>
                <strong>
                  Total diário:{" "}
                  {money(
                    transportItems.reduce(
                      (sum, item) => sum + decimalInputValue(item.valorDiario),
                      0,
                    ),
                  )}
                </strong>
              </div>
            </div>
          )}
          <label className="wide">
            <span>Observações</span>
            <textarea
              value={notes}
              onChange={(event) => {
                setNotes(event.target.value);
                setDirty(true);
              }}
            />
          </label>
        </div>
        <div className="form-actions">
          <button
            disabled={
              saving ||
              loading ||
              !configs.length ||
              (type === "TRANSPORTE" && !transportItems.length)
            }
          >
            {saving ? "Salvando…" : "Salvar"}
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => (dirty ? setConfirmClose(true) : onClose())}
          >
            Cancelar
          </button>
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
    </>
  );
}

export function PersonProfile({
  id,
  navigate,
}: {
  id: string;
  navigate: Navigate;
}) {
  const validTabs = [
    "visao",
    "vinculo",
    "descanso",
    "beneficios",
    "documentos",
    "historico",
  ];
  const tabFromUrl = () => {
    const value = new URLSearchParams(location.search).get("tab") ?? "visao";
    return validTabs.includes(value) ? value : "visao";
  };
  const [profile, setProfile] = useState<Row | null>(null),
    [tab, setTab] = useState(tabFromUrl),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [formScreen, setFormScreen] = useState<string | null>(null),
    [editingLink, setEditingLink] = useState<Row | null>(null),
    [editingBenefit, setEditingBenefit] = useState<Row | null>(null),
    [endingBenefit, setEndingBenefit] = useState<Row | null>(null),
    [benefitEndDate, setBenefitEndDate] = useState(""),
    [benefitEndReason, setBenefitEndReason] = useState(""),
    [editingDocument, setEditingDocument] = useState<Row | null>(null),
    [reversingDistrato, setReversingDistrato] = useState<Row | null>(null),
    [reversalReason, setReversalReason] = useState(""),
    [benefitMonth, setBenefitMonth] = useState(
      () =>
        new URLSearchParams(location.search).get("competencia")?.slice(0, 7) ??
        new Date().toISOString().slice(0, 7),
    ),
    [version, setVersion] = useState(0);
  const options = usePeopleOptions();
  useEffect(() => {
    setLoading(true);
    void api<Row>(`pessoas/${id}/perfil`)
      .then((result) => {
        setProfile(result);
        setError("");
      })
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false));
  }, [id, version]);
  useEffect(() => {
    const syncFromHistory = () => {
      setTab(tabFromUrl());
      const competence = new URLSearchParams(location.search)
        .get("competencia")
        ?.slice(0, 7);
      if (competence) setBenefitMonth(competence);
    };
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  }, []);
  if (error && !profile) return <Notice text={error} error />;
  if (!profile)
    return <LoadingSkeleton variant="detail" label="Carregando perfil…" />;
  const person = profile.pessoa as Row,
    current = profile.vinculoAtual as Row | null,
    links = person.vinculos as Row[],
    balances = profile.saldos as Record<string, Row>,
    alerts = profile.alertas as Row[];
  const tabs: Array<[string, string]> = [
    ["visao", "Visão geral"],
    ["vinculo", "Vínculo"],
    ["descanso", current?.tipo === "ESTAGIO" ? "Descanso" : "Férias"],
    ["beneficios", "Benefícios"],
    ["documentos", "Documentos"],
    ["historico", "Histórico"],
  ];
  const selectTab = (next: string) => {
    setTab(next);
    const query = new URLSearchParams(location.search);
    query.set("tab", next);
    if (next === "beneficios") query.set("competencia", `${benefitMonth}-01`);
    else query.delete("competencia");
    history.pushState({}, "", `${location.pathname}?${query.toString()}`);
  };
  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.findIndex(([key]) => key === tab);
    let target = index;
    if (event.key === "ArrowRight") target = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft")
      target = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = tabs.length - 1;
    else return;
    event.preventDefault();
    selectTab(tabs[target]![0]);
    requestAnimationFrame(() =>
      document.getElementById(`profile-tab-${tabs[target]![0]}`)?.focus(),
    );
  };
  const ProfileOverlay = formScreen === "beneficios-vinculo" ? Dialog : Sheet;
  return (
    <RefreshingContent refreshing={loading}>
      <div className="golden-profile person-profile-page">
        <Notice text={error} error />
        <div className="profile-identity">
          <div className="person-avatar" aria-hidden="true">
            {String(person.nomeCompleto)
              .split(" ")
              .filter(Boolean)
              .slice(0, 2)
              .map((name) => name[0])
              .join("")}
          </div>
          <PageHeader
            title={String(person.nomeCompleto)}
            description={`${current?.tipo === "ESTAGIO" ? "Estagiário(a)" : current?.tipo === "APRENDIZ" ? "Aprendiz" : current?.tipo === "TRAINEE" ? "Trainee" : (current?.tipo ?? "Sem vínculo")} · ${display(current?.unidade)}`}
            breadcrumb={
              <Button
                variant="ghost"
                onClick={() => {
                  const stored = sessionStorage.getItem("duali.people.return");
                  if (stored)
                    navigate((JSON.parse(stored) as { url: string }).url);
                  else navigate("/app/pessoas");
                }}
              >
                ← Pessoas
              </Button>
            }
            action={
              <Button onClick={() => navigate(`/app/pessoas/${id}/editar`)}>
                Editar pessoa
              </Button>
            }
          />
        </div>
        {Boolean(profile.multiplosVinculosAtivos) && (
          <Notice
            text="Mais de um vínculo ativo encontrado. Revise esta situação."
            error
          />
        )}
        <ProfileOverlay
          className={
            formScreen === "beneficios-vinculo" ? "benefit-dialog" : undefined
          }
          open={Boolean(formScreen)}
          onOpenChange={(open) => {
            if (!open) setFormScreen(null);
          }}
          title={
            screens.find((screen) => screen.path === formScreen)?.title ??
            "Novo registro"
          }
          description="Preencha os dados desta operação."
        >
          {formScreen && editingDocument ? (
            <RecordForm
              embedded
              screen={screens.find((screen) => screen.path === "documentos")!}
              record={editingDocument}
              defaults={{ vinculoId: editingDocument.vinculoId }}
              onClose={() => {
                setFormScreen(null);
                setEditingDocument(null);
              }}
              onSaved={() => {
                setFormScreen(null);
                setEditingDocument(null);
                setVersion(version + 1);
              }}
            />
          ) : formScreen === "beneficios-vinculo" ? (
            <ProfileBenefitForm
              person={person}
              link={current}
              record={editingBenefit}
              ambiguousLink={Boolean(profile.multiplosVinculosAtivos)}
              onClose={() => {
                setFormScreen(null);
                setEditingBenefit(null);
              }}
              onSaved={() => {
                setFormScreen(null);
                setEditingBenefit(null);
                setVersion(version + 1);
              }}
            />
          ) : formScreen && editingLink ? (
            <LinkEditorForm
              link={editingLink}
              options={options}
              onClose={() => {
                setFormScreen(null);
                setEditingLink(null);
                setEditingBenefit(null);
              }}
              onSaved={() => {
                setFormScreen(null);
                setEditingLink(null);
                setEditingBenefit(null);
                setVersion(version + 1);
              }}
            />
          ) : formScreen ? (
            <RecordForm
              embedded
              screen={screens.find((screen) => screen.path === formScreen)!}
              record={editingLink ?? null}
              defaults={{ pessoaId: id, vinculoId: current?.id }}
              onClose={() => {
                setFormScreen(null);
                setEditingLink(null);
              }}
              onSaved={() => {
                setFormScreen(null);
                setEditingLink(null);
                setVersion(version + 1);
              }}
            />
          ) : null}
        </ProfileOverlay>
        <Dialog
          open={Boolean(endingBenefit)}
          onOpenChange={(open) => {
            if (!open) {
              setEndingBenefit(null);
              setBenefitEndDate("");
              setBenefitEndReason("");
            }
          }}
          title="Encerrar benefício"
          description="A adesão será encerrada, mas competências e histórico continuarão disponíveis."
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!endingBenefit || !benefitEndDate || !benefitEndReason.trim())
                return;
              void api(
                `beneficios-vinculo/${endingBenefit.id}/encerrar`,
                "POST",
                {
                  fimVigencia: benefitEndDate,
                  motivo: benefitEndReason.trim(),
                },
              )
                .then(() => {
                  setEndingBenefit(null);
                  setBenefitEndDate("");
                  setBenefitEndReason("");
                  setVersion((current) => current + 1);
                })
                .catch((cause) => setError((cause as Error).message));
            }}
          >
            <FormField label="Data de encerramento" required>
              <DateInput
                required
                value={benefitEndDate}
                onChange={(event) => setBenefitEndDate(event.target.value)}
              />
            </FormField>
            <FormField label="Motivo" required>
              <Textarea
                required
                minLength={3}
                value={benefitEndReason}
                onChange={(event) => setBenefitEndReason(event.target.value)}
              />
            </FormField>
            <div className="form-actions">
              <Button type="submit" variant="danger">
                Encerrar benefício
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEndingBenefit(null)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </Dialog>
        <Dialog
          open={Boolean(reversingDistrato)}
          onOpenChange={(open) => {
            if (!open) {
              setReversingDistrato(null);
              setReversalReason("");
            }
          }}
          title="Reverter distrato"
          description="O vínculo voltará para ativo e a data de desligamento será removida."
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!reversingDistrato || !reversalReason.trim()) return;
              void api(
                `documentos/${reversingDistrato.id}/reverter-distrato`,
                "POST",
                { motivo: reversalReason.trim() },
              )
                .then(() => {
                  setReversingDistrato(null);
                  setReversalReason("");
                  setVersion((current) => current + 1);
                })
                .catch((cause) => setError((cause as Error).message));
            }}
          >
            <FormField label="Motivo da reversão" required>
              <Textarea
                required
                minLength={3}
                value={reversalReason}
                onChange={(event) => setReversalReason(event.target.value)}
              />
            </FormField>
            <div className="form-actions">
              <Button type="submit">Confirmar reversão</Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setReversingDistrato(null)}
              >
                Cancelar
              </Button>
            </div>
          </form>
        </Dialog>
        <div
          className="tabs person-profile-tabs"
          role="tablist"
          aria-label="Seções do perfil"
        >
          {tabs.map(([key, label]) => (
            <Button
              id={`profile-tab-${key}`}
              role="tab"
              aria-selected={tab === key}
              aria-controls={`profile-panel-${key}`}
              tabIndex={tab === key ? 0 : -1}
              variant="ghost"
              className={tab === key ? "active" : undefined}
              key={key}
              onClick={() => selectTab(key)}
              onKeyDown={handleTabKey}
            >
              {label}
            </Button>
          ))}
        </div>
        {tab !== "visao" && tab !== "historico" && (
          <div className="context-actions">
            {tab === "vinculo" && (
              <Button onClick={() => setFormScreen("vinculos")}>
                Adicionar vínculo
              </Button>
            )}
            {tab === "descanso" && (
              <Button onClick={() => setFormScreen("periodos")}>
                Programar descanso
              </Button>
            )}
            {tab === "documentos" && (
              <>
                <Button onClick={() => setFormScreen("documentos")}>
                  Adicionar documento
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => setFormScreen("seguros")}
                >
                  Adicionar seguro
                </Button>
              </>
            )}
          </div>
        )}
        {tab === "visao" && (
          <div
            className="profile-grid"
            role="tabpanel"
            id="profile-panel-visao"
            aria-labelledby="profile-tab-visao"
          >
            <ProfileInfoSection
              title="Dados pessoais"
              rows={[
                ["CPF", person.cpf ? maskCpf(person.cpf) : "—"],
                ["Nascimento", formatDate(person.dataNascimento)],
                ["Telefone", maskPhone(person.telefone)],
                ["E-mail", display(person.email)],
              ]}
            />
            <ProfileInfoSection
              title="Vínculo atual"
              rows={[
                ["Tipo", display(current?.tipo)],
                ["Unidade", display(current?.unidade)],
                ["Equipe", display(current?.equipe)],
                ["Admissão", formatDate(current?.dataAdmissao)],
                ["Status", <StatusBadge value={current?.status} />],
              ]}
            />
            <ProfileInfoSection
              title="Situação"
              rows={[
                [
                  "Saldo disponível",
                  current
                    ? `${balances[String(current.id)]?.saldoDisponivelParaProgramar ?? balances[String(current.id)]?.saldo ?? 0} dias`
                    : "—",
                ],
                [
                  "Categorias solicitadas no mês",
                  String(
                    (current?.beneficios as Row[] | undefined)?.filter((b) =>
                      ((b.competencias as Row[] | undefined) ?? []).some(
                        (c) =>
                          String(c.competencia).slice(0, 7) === benefitMonth,
                      ),
                    ).length ?? 0,
                  ),
                ],
                [
                  "Término previsto",
                  formatDate(
                    (current?.estagio as Row | undefined)?.dataTerminoPrevista,
                  ),
                ],
              ]}
            />
            <ProfileInfoSection
              title="Documento atual"
              rows={(() => {
                const cycle = current?.cicloDocumental as Row | undefined;
                const document = cycle?.atual as Row | undefined;
                const next = cycle?.proximo as Row | undefined;
                return [
                  [
                    "Atual",
                    document
                      ? `${documentLabels[String(document.tipo)] ?? display(document.tipo)} · ${display(document.estadoOperacional)}`
                      : "Nenhum em vigência",
                  ],
                  [
                    "Vigência",
                    document
                      ? `${formatDate(document.inicioVigencia)} até ${formatDate(document.fimVigencia)}`
                      : next
                        ? `Próximo: ${formatDate(next.inicioVigencia)}`
                        : "—",
                  ],
                ] as [string, ReactNode][];
              })()}
            />
            <section className="panel">
              <h2>Alertas</h2>
              {alerts.length ? (
                alerts.map((alert, index) => (
                  <div className="alert-row" key={index}>
                    <StatusBadge value={alert.tipo} />
                    <span>{String(alert.mensagem)}</span>
                  </div>
                ))
              ) : (
                <EmptyState
                  title="Nenhuma pendência"
                  description="Tudo certo por aqui."
                />
              )}
            </section>
          </div>
        )}
        {tab === "vinculo" && (
          <div
            role="tabpanel"
            id="profile-panel-vinculo"
            aria-labelledby="profile-tab-vinculo"
          >
            <div className="stack">
              {links.map((link) => (
                <section className="panel" key={String(link.id)}>
                  <div className="section-heading">
                    <h2>
                      {String(link.tipo)} · {display(link.unidade)}
                    </h2>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        setEditingLink(link);
                        setFormScreen("vinculos");
                      }}
                    >
                      Editar vínculo
                    </Button>
                  </div>
                  <div className="person-profile-link-summary">
                    <StatusBadge value={link.status} />
                    <span>{display(link.equipe)}</span>
                    <span>Admissão: {formatDate(link.dataAdmissao)}</span>
                  </div>
                </section>
              ))}
            </div>
          </div>
        )}
        {tab === "descanso" && (
          <div
            className="stack"
            role="tabpanel"
            id="profile-panel-descanso"
            aria-labelledby="profile-tab-descanso"
          >
            {links.map((link) => (
              <section className="panel" key={String(link.id)}>
                <h2>
                  {String(link.tipo)} · {formatDate(link.dataAdmissao)}
                </h2>
                <div className="metrics">
                  <MetricCard
                    label="Saldo atual"
                    value={`${String(balances[String(link.id)]?.saldoContabil ?? balances[String(link.id)]?.saldo ?? 0)} dias`}
                  />
                  <MetricCard
                    label="Comprometido"
                    value={`${String(balances[String(link.id)]?.diasComprometidos ?? balances[String(link.id)]?.programados ?? 0)} dias`}
                  />
                  <MetricCard
                    label="Disponível para programar"
                    value={`${String(balances[String(link.id)]?.saldoDisponivelParaProgramar ?? balances[String(link.id)]?.saldo ?? 0)} dias`}
                  />
                </div>
                <ProfileTimeline
                  label={`Histórico de direitos e períodos de ${String(link.tipo)}`}
                  items={[
                    ...(link.direitos as Row[]),
                    ...(link.periodos as Row[]),
                    ...(link.ajustes as Row[]),
                    ...(link.direitos as Row[]).flatMap(
                      (right) => (right.consumos as Row[] | undefined) ?? [],
                    ),
                    ...(link.periodos as Row[]).flatMap(
                      (period) => (period.consumos as Row[] | undefined) ?? [],
                    ),
                  ].map((item) => ({
                    date:
                      item.dataAquisicao ?? item.dataInicio ?? item.criadoEm,
                    title: item.quantidadeDias
                      ? `${item.quantidadeDias} dias`
                      : String(item.tipo),
                    detail: String(
                      item.origem ?? item.status ?? item.motivo ?? "",
                    ),
                  }))}
                />
              </section>
            ))}
          </div>
        )}
        {tab === "beneficios" && (
          <div
            className="stack"
            role="tabpanel"
            id="profile-panel-beneficios"
            aria-labelledby="profile-tab-beneficios"
          >
            <section className="panel benefit-month-filter">
              <FormField label="Competência exibida">
                <Input
                  type="month"
                  value={benefitMonth}
                  onChange={(event) => {
                    const value = event.target.value;
                    setBenefitMonth(value);
                    const query = new URLSearchParams(location.search);
                    query.set("tab", "beneficios");
                    query.set("competencia", `${value}-01`);
                    history.replaceState(
                      {},
                      "",
                      `${location.pathname}?${query.toString()}`,
                    );
                  }}
                />
              </FormField>
            </section>
            {[...links]
              .sort(
                (a, b) =>
                  Number(b.id === current?.id) - Number(a.id === current?.id),
              )
              .flatMap((link) =>
                [...((link.beneficios as Row[] | undefined) ?? [])]
                  .filter((benefit) =>
                    ((benefit.competencias as Row[] | undefined) ?? []).some(
                      (item) =>
                        String(item.competencia).slice(0, 7) === benefitMonth,
                    ),
                  )
                  .sort(
                    (a, b) =>
                      Number(b.status === "ATIVO") -
                      Number(a.status === "ATIVO"),
                  )
                  .map((benefit) => {
                    const competencies =
                      (benefit.competencias as Row[] | undefined) ?? [];
                    const competence = competencies.find(
                      (item) =>
                        String(item.competencia).slice(0, 7) === benefitMonth,
                    );
                    const config = competence?.configuracao as Row | undefined;
                    return (
                      <details
                        className="panel benefit-profile-card"
                        key={String(benefit.id)}
                        open={
                          link.id === current?.id && benefit.status === "ATIVO"
                        }
                      >
                        <summary>
                          Competência mensal ·{" "}
                          {benefitLabels[String(benefit.tipo)] ??
                            String(benefit.tipo)}{" "}
                          · {display(link.unidade)}
                        </summary>
                        <section>
                          <div className="section-heading">
                            <div>
                              <h2>
                                {benefitLabels[String(benefit.tipo)] ??
                                  String(benefit.tipo)}
                              </h2>
                              <p>
                                {benefit.tipo !== "TRANSPORTE" && (
                                  <>{display(config?.fornecedor)} · </>
                                )}
                                {benefitMonth.split("-").reverse().join("/")}
                              </p>
                            </div>
                          </div>
                          <dl className="benefit-compact-grid">
                            {benefit.tipo !== "TRANSPORTE" && (
                              <div>
                                <dt>Fornecedor</dt>
                                <dd>{display(config?.fornecedor)}</dd>
                              </div>
                            )}
                            <div>
                              <dt>Competência</dt>
                              <dd>
                                {benefitMonth.split("-").reverse().join("/")}
                              </dd>
                            </div>
                            {benefit.tipo === "ALIMENTACAO" && (
                              <div>
                                <dt>Valor diário</dt>
                                <dd>{money(competence?.valorUnitario)}</dd>
                              </div>
                            )}
                            <div>
                              <dt>Dias</dt>
                              <dd>
                                {competence?.quantidadeDias == null
                                  ? "Não informado"
                                  : display(competence.quantidadeDias)}
                              </dd>
                            </div>
                            <div>
                              <dt>Valor total</dt>
                              <dd>
                                {competence
                                  ? money(competence.valorFinal)
                                  : "Não informado"}
                              </dd>
                            </div>
                            <div>
                              <dt>Situação</dt>
                              <dd>
                                {competence ? (
                                  <StatusBadge value={competence.status} />
                                ) : (
                                  "Mês não preparado"
                                )}
                              </dd>
                            </div>
                          </dl>
                          <div className="info-list">
                            {!["ALIMENTACAO", "TRANSPORTE"].includes(
                              String(benefit.tipo),
                            ) && (
                              <p>
                                Quantidade: {display(competence?.quantidade)} ·
                                Valor unitário:{" "}
                                {money(competence?.valorUnitario)}
                              </p>
                            )}
                            {benefit.tipo === "TRANSPORTE" && (
                              <TransportSupplierSummary
                                items={
                                  (competence?.transporteItens as
                                    | Row[]
                                    | undefined) ?? []
                                }
                              />
                            )}
                            {(
                              (competence?.aquisicaoItens as
                                | Row[]
                                | undefined) ?? []
                            ).map((item) => (
                              <p key={String(item.id)}>
                                Pedido:{" "}
                                {display(
                                  (
                                    (item.aquisicao as Row | undefined)
                                      ?.fornecedor as Row | undefined
                                  )?.nome,
                                )}{" "}
                                · Solicitado:{" "}
                                {money(
                                  item.valorSolicitado ?? item.valorReservado,
                                )}{" "}
                                ·
                                <StatusBadge value={item.status} />
                              </p>
                            ))}
                          </div>
                          <Button
                            variant="ghost"
                            className="benefit-history-link"
                            onClick={() =>
                              navigate(
                                `/app/beneficios/competencias?competencia=${benefitMonth}-01&unidadeId=${link.unidadeId}&tipo=${benefit.tipo}`,
                              )
                            }
                          >
                            Ver histórico
                          </Button>
                        </section>
                      </details>
                    );
                  }),
              )}
            {!links.some((link) =>
              ((link.beneficios as Row[] | undefined) ?? []).some((benefit) =>
                ((benefit.competencias as Row[] | undefined) ?? []).some(
                  (item) =>
                    String(item.competencia).slice(0, 7) === benefitMonth,
                ),
              ),
            ) && (
              <EmptyState
                title="Nenhuma competência de benefício"
                description="Os pedidos mensais desta pessoa aparecerão aqui após a emissão."
              />
            )}
          </div>
        )}
        {tab === "documentos" && (
          <div
            className="stack"
            role="tabpanel"
            id="profile-panel-documentos"
            aria-labelledby="profile-tab-documentos"
          >
            {links.map((link) => (
              <section className="panel" key={String(link.id)}>
                <h2>Documentos e seguro · {String(link.tipo)}</h2>
                <ProfileDocumentsTable
                  documents={link.documentos as Row[]}
                  onEdit={(document) => {
                    setEditingDocument(document);
                    setFormScreen("documentos");
                  }}
                  onReverse={setReversingDistrato}
                />
                <ProfileTimeline
                  label={`Seguros de ${String(link.tipo)}`}
                  items={(link.seguros as Row[]).map((insurance) => ({
                    date: insurance.inicioVigencia,
                    title: `Seguro · ${insurance.seguradora}`,
                    detail: String(insurance.status),
                  }))}
                />
              </section>
            ))}
          </div>
        )}
        {tab === "historico" && (
          <div
            role="tabpanel"
            id="profile-panel-historico"
            aria-labelledby="profile-tab-historico"
          >
            <ProfileTimeline
              label="Histórico do perfil"
              items={(profile.historico as Row[]).map((item) => ({
                date: item.criadoEm,
                title: `${({ CRIAR: "Cadastro criado", ALTERAR: "Dados atualizados", CANCELAR: "Registro cancelado", CANCELAR_DISTRATO: "Distrato revertido", REATIVAR_POR_REVERSAO_DISTRATO: "Vínculo reativado" } as Record<string, string>)[String(item.acao)] ?? String(item.acao).replaceAll("_", " ")} · ${({ pessoa: "Pessoa", vinculo: "Vínculo", estagio: "Estágio", documentoVinculo: "Documento", beneficioVinculo: "Benefício", beneficioCompetencia: "Competência" } as Record<string, string>)[String(item.entidade)] ?? String(item.entidade)}`,
                detail: `Por ${display(item.usuario)}`,
              }))}
            />
          </div>
        )}
      </div>
    </RefreshingContent>
  );
}
function LinkEditorForm({
  link,
  options,
  onClose,
  onSaved,
}: {
  link: Row;
  options: ReturnType<typeof usePeopleOptions>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const stage = (link.estagio as Row | undefined) ?? {};
  const [data, setData] = useState<Row>({
    ...link,
    dataAdmissao: String(link.dataAdmissao ?? "").slice(0, 10),
    dataDesligamento: String(link.dataDesligamento ?? "").slice(0, 10),
    instituicaoEnsinoId: stage.instituicaoEnsinoId ?? "",
    periodoAcademico: stage.periodoAcademico ?? "",
    valorBolsa: stage.valorBolsa ?? "",
    dataTerminoPrevista: String(stage.dataTerminoPrevista ?? "").slice(0, 10),
    escalaEstruturada: link.tipoEscala
      ? {
          tipo: link.tipoEscala,
          ...(link.tipoEscala === "DIAS_SEMANA"
            ? { diasSemana: link.diasSemana ?? [] }
            : { quantidadeDiasSemana: link.quantidadeDiasSemana ?? 1 }),
        }
      : null,
  });
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const initial = useMemo(() => JSON.stringify(data), []);
  const dirty = JSON.stringify(data) !== initial;
  useFormDirty(dirty);
  const set = (key: string, value: unknown) =>
    setData({ ...data, [key]: value });
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(`vinculos/${link.id}/detalhes`, "PUT", {
        vinculo: {
          pessoaId: link.pessoaId,
          unidadeId: data.unidadeId,
          equipeId: data.equipeId || null,
          tipo: link.tipo,
          status: data.status,
          matricula: data.matricula || null,
          dataAdmissao: data.dataAdmissao,
          dataDesligamento:
            data.status === "DESLIGADO" ? data.dataDesligamento || null : null,
          cargoFuncao: data.cargoFuncao || null,
          gestor: data.gestor || null,
          escala: data.escala || null,
          escalaEstruturada: data.escalaEstruturada ?? null,
          observacoes: data.observacoes || null,
        },
        ...(link.tipo === "ESTAGIO"
          ? {
              estagio: {
                instituicaoEnsinoId: data.instituicaoEnsinoId || null,
                periodoAcademico: data.periodoAcademico || null,
                valorBolsa: data.valorBolsa || null,
                dataTerminoPrevista: data.dataTerminoPrevista || null,
              },
            }
          : {}),
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="form-panel embedded-form">
      <Notice text={error} error />
      <form onSubmit={(e) => void submit(e)}>
        <fieldset>
          <legend>Dados do vínculo</legend>
          <div className="form-grid">
            <label>
              <span>Unidade</span>
              <select
                required
                value={String(data.unidadeId ?? "")}
                onChange={(e) => set("unidadeId", e.target.value)}
              >
                {options.units.map((row) => (
                  <option key={String(row.id)} value={String(row.id)}>
                    {`${String(row.sigla ?? "").trim() ? `${String(row.sigla).trim()} - ` : ""}${String(row.nome ?? "")}`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Equipe</span>
              <select
                value={String(data.equipeId ?? "")}
                onChange={(e) => set("equipeId", e.target.value || null)}
              >
                <option value="">Sem equipe</option>
                {options.teams.map((row) => (
                  <option key={String(row.id)} value={String(row.id)}>
                    {`${String(row.sigla ?? "").trim() ? `${String(row.sigla).trim()} - ` : ""}${String(row.nome ?? "")}`}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>Tipo</span>
              <input value={String(link.tipo)} readOnly />
            </label>
            <label>
              <span>Admissão</span>
              <input type="date" value={String(data.dataAdmissao)} readOnly />
            </label>
            <label>
              <span>Status</span>
              <select
                value={String(data.status)}
                onChange={(e) => set("status", e.target.value)}
                disabled={link.tipo === "ESTAGIO"}
              >
                <option>ATIVO</option>
                <option>AFASTADO</option>
                {link.tipo !== "ESTAGIO" && <option>DESLIGADO</option>}
              </select>
            </label>
            <label>
              <span>Data de desligamento</span>
              <input
                type="date"
                value={String(data.dataDesligamento ?? "")}
                onChange={(e) => set("dataDesligamento", e.target.value)}
                readOnly={link.tipo === "ESTAGIO"}
              />
              {link.tipo === "ESTAGIO" && (
                <small>
                  O desligamento do estágio é registrado pelo distrato.
                </small>
              )}
            </label>
            <label>
              <span>Matrícula</span>
              <input
                value={String(data.matricula ?? "")}
                onChange={(e) => set("matricula", e.target.value)}
              />
            </label>
            <label>
              <span>Cargo / função</span>
              <input
                value={String(data.cargoFuncao ?? "")}
                onChange={(e) => set("cargoFuncao", e.target.value)}
              />
            </label>
          </div>
          <StructuredScaleFields
            value={(data.escalaEstruturada as Row | null | undefined) ?? null}
            onChange={(escalaEstruturada) =>
              set("escalaEstruturada", escalaEstruturada)
            }
          />
        </fieldset>
        {link.tipo === "ESTAGIO" && (
          <fieldset>
            <legend>Dados do estágio</legend>
            <div className="form-grid">
              <label>
                <span>Instituição de ensino</span>
                <select
                  value={String(data.instituicaoEnsinoId ?? "")}
                  onChange={(e) =>
                    set("instituicaoEnsinoId", e.target.value || null)
                  }
                >
                  <option value="">Selecione</option>
                  {options.institutions.map((row) => (
                    <option key={String(row.id)} value={String(row.id)}>
                      {`${String(row.sigla ?? "").trim() ? `${String(row.sigla).trim()} - ` : ""}${String(row.nome ?? "")}`}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>Período acadêmico</span>
                <input
                  value={String(data.periodoAcademico ?? "")}
                  onChange={(e) => set("periodoAcademico", e.target.value)}
                />
              </label>
              <label>
                <span>Bolsa</span>
                <CurrencyInput
                  value={String(data.valorBolsa ?? "")}
                  onValueChange={(value) => set("valorBolsa", value)}
                />
              </label>
              <label>
                <span>Término do contrato/TCE</span>
                <input
                  type="date"
                  value={String(data.dataTerminoPrevista ?? "")}
                  onChange={(e) => set("dataTerminoPrevista", e.target.value)}
                />
              </label>
            </div>
          </fieldset>
        )}
        <div className="form-actions">
          <Button disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button>
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
        </div>
      </form>
    </div>
  );
}

function ProfileInfoSection({
  title,
  rows,
}: {
  title: string;
  rows: [string, ReactNode][];
}) {
  return (
    <section className="panel person-profile-summary">
      <h2>{title}</h2>
      <dl>
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
function ProfileTimeline({
  items,
  label = "Histórico",
}: {
  items: { date: unknown; title: string; detail?: string }[];
  label?: string;
}) {
  const normalized = [...items]
    .filter((item) => Boolean(item.date))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
    .map((item, index) => ({
      id: `${String(item.date)}-${index}`,
      date: formatDate(item.date),
      title: item.title,
      description: item.detail,
    }));
  return normalized.length ? (
    <Timeline items={normalized} label={label} />
  ) : (
    <EmptyState
      title="Nenhum histórico"
      description="Ainda não existem eventos neste contexto."
    />
  );
}
