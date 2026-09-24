import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarPlus, ChevronLeft } from "lucide-react";
import { api, display, type Row } from "../../api";
import {
  ActionMenu,
  Button,
  DataTable,
  DateInput,
  Dialog,
  EmptyState,
  FilterBar,
  FormField,
  Input,
  LoadingSkeleton,
  MetricCard,
  Notice,
  Pagination,
  RefreshingContent,
  Select,
  StatusBadge,
  Stepper,
  Textarea,
  Timeline,
  type DataTableColumn,
} from "../../components/ui";
import { PageHeader, formatDate } from "../../ui";
import { usePeopleOptions } from "../people/usePeopleOptions";

type Navigate = (path: string) => void;
type Situation = "" | "A_PROGRAMAR" | "PROGRAMADO" | "EM_GOZO" | "CONCLUIDO";
type Filters = {
  q: string;
  status: string;
  tipo: string;
  unidadeId: string;
  equipeId: string;
  ano: string;
  situacao: Situation;
};
type Summary = {
  aProgramar: number;
  programadas: number;
  emFerias: number;
  concluidas: number;
};
type LeaveList = {
  items: Row[];
  total: number;
  page: number;
  pageSize: number;
  resumo: Summary;
  ano: number;
};

const emptySummary: Summary = {
  aProgramar: 0,
  programadas: 0,
  emFerias: 0,
  concluidas: 0,
};
const typeLabels: Record<string, string> = {
  CLT: "CLT",
  ESTAGIO: "Estágio",
  APRENDIZ: "Aprendiz",
  TRAINEE: "Trainee",
};
const situationLabels: Record<string, string> = {
  A_PROGRAMAR: "A programar",
  PROGRAMADO: "Programadas",
  EM_GOZO: "Em férias",
  CONCLUIDO: "Concluídas",
};

function asRows(value: unknown) {
  return Array.isArray(value) ? (value as Row[]) : [];
}
function ledger(row: Row) {
  return row.saldo as Row;
}
function decimal(value: unknown) {
  return String(value ?? "0").replace(".", ",");
}
function isoDate(value: unknown) {
  return value ? String(value).slice(0, 10) : "";
}
function inclusiveDays(start: string, end: string) {
  if (!start || !end) return "";
  const first = Date.parse(`${start}T00:00:00Z`),
    last = Date.parse(`${end}T00:00:00Z`);
  return last < first ? "" : String(Math.round((last - first) / 86400000) + 1);
}
function queryFor(filters: Filters, page: number, includeSituation = true) {
  const query = new URLSearchParams({ page: String(page), ano: filters.ano });
  Object.entries(filters).forEach(([key, value]) => {
    if (value && key !== "ano" && (includeSituation || key !== "situacao"))
      query.set(key, value);
  });
  return query.toString();
}
function primarySituation(row: Row, year: string) {
  const periods = asRows(ledger(row).periodos).filter((period) =>
    isoDate(period.dataInicio).startsWith(year),
  );
  if (periods.some((period) => period.status === "EM_GOZO")) return "EM_GOZO";
  if (periods.some((period) => period.status === "PROGRAMADO"))
    return "PROGRAMADO";
  if (Number(ledger(row).saldoDisponivelParaProgramar) > 0)
    return "A_PROGRAMAR";
  if (periods.some((period) => period.status === "CONCLUIDO"))
    return "CONCLUIDO";
  return "REGULAR";
}

type ProgramDraft = {
  dataInicio: string;
  dataFim: string;
  quantidadeDias: string;
  motivo: string;
  observacoes: string;
  direitoId: string;
};
const blankDraft: ProgramDraft = {
  dataInicio: "",
  dataFim: "",
  quantidadeDias: "",
  motivo: "",
  observacoes: "",
  direitoId: "",
};

function ProgramFlow({
  open,
  onOpenChange,
  initial,
  candidates,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initial: Row | null;
  candidates: Row[];
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<Row | null>(initial);
  const [step, setStep] = useState(initial ? 1 : 0);
  const [draft, setDraft] = useState<ProgramDraft>(blankDraft);
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (open) {
      setSelected(initial);
      setStep(initial ? 1 : 0);
      setDraft(blankDraft);
      setError("");
    }
  }, [initial, open]);
  const steps = [
    ...(!initial ? [{ id: "pessoa", label: "Pessoa e vínculo" }] : []),
    { id: "direito", label: "Período disponível" },
    { id: "programacao", label: "Programação" },
    { id: "revisao", label: "Conferência" },
  ];
  const currentIndex = initial ? step - 1 : step;
  const currentLedger = selected ? ledger(selected) : null;
  const rights = asRows(currentLedger?.direitos).filter(
    (right) => Number(right.pendente) > 0,
  );
  const type =
    selected && ["CLT", "TRAINEE"].includes(String(selected.tipo))
      ? "FERIAS"
      : "DESCANSO_ESTAGIO";
  const update = (key: keyof ProgramDraft, value: string) =>
    setDraft((current) => ({ ...current, [key]: value }));
  const next = () => {
    setError("");
    if (!selected) return setError("Selecione uma pessoa e um vínculo.");
    if (
      (!initial && step === 0) ||
      (initial && step === 1) ||
      (!initial && step === 1)
    )
      return setStep(step + 1);
    if ((initial && step === 2) || (!initial && step === 2)) {
      if (!draft.dataInicio || !draft.dataFim || !draft.quantidadeDias) {
        setError("Informe início, fim e quantidade de dias.");
        requestAnimationFrame(() => firstField.current?.focus());
        return;
      }
    }
    setStep(step + 1);
  };
  const submit = async () => {
    if (!selected || pending) return;
    setPending(true);
    setError("");
    try {
      await api("periodos", "POST", {
        vinculoId: selected.id,
        tipo: type,
        dataInicio: draft.dataInicio,
        dataFim: draft.dataFim,
        quantidadeDias: draft.quantidadeDias,
        status: "PROGRAMADO",
        motivo: draft.motivo || null,
        observacoes: draft.observacoes || null,
      });
      onSaved();
      onOpenChange(false);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setPending(false);
    }
  };
  const estimated = currentLedger
    ? Number(currentLedger.saldoDisponivelParaProgramar ?? 0) -
      Number(draft.quantidadeDias || 0)
    : 0;
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Programar férias ou descanso"
      description="Revise o direito disponível antes de confirmar."
      size="lg"
    >
      <div className="vacation-program-flow">
        <Stepper
          steps={steps.map((item, index) => ({
            ...item,
            status:
              index < currentIndex
                ? "complete"
                : index === currentIndex
                  ? "current"
                  : "upcoming",
          }))}
        />
        {error && <Notice text={error} error />}
        {!initial && step === 0 && (
          <div
            className="vacation-person-options"
            aria-label="Pessoas e vínculos disponíveis"
          >
            {candidates.map((candidate) => (
              <button
                type="button"
                className={
                  selected?.id === candidate.id
                    ? "vacation-choice is-selected"
                    : "vacation-choice"
                }
                onClick={() => setSelected(candidate)}
                key={String(candidate.id)}
              >
                <strong>{display(candidate.pessoa)}</strong>
                <span>
                  {typeLabels[String(candidate.tipo)]} ·{" "}
                  {display(candidate.unidade)}
                </span>
                <small>
                  Saldo atual {decimal(ledger(candidate).saldoContabil)} ·
                  comprometido {decimal(ledger(candidate).diasComprometidos)} ·
                  disponível{" "}
                  {decimal(ledger(candidate).saldoDisponivelParaProgramar)} dias
                </small>
              </button>
            ))}
          </div>
        )}
        {((initial && step === 1) || (!initial && step === 1)) && selected && (
          <section className="vacation-step-section">
            <h3>Período disponível</h3>
            {rights.length ? (
              rights.map((right) => (
                <label
                  className={
                    draft.direitoId === right.id
                      ? "vacation-right is-selected"
                      : "vacation-right"
                  }
                  key={String(right.id)}
                >
                  <input
                    type="radio"
                    name="direito"
                    checked={draft.direitoId === right.id}
                    onChange={() => update("direitoId", String(right.id))}
                  />
                  <span>
                    <strong>
                      {formatDate(right.inicioAquisitivo)} até{" "}
                      {formatDate(right.fimAquisitivo)}
                    </strong>
                    <small>
                      Aquisição {formatDate(right.dataAquisicao)} ·{" "}
                      {decimal(right.pendente)} dias restantes · prazo{" "}
                      {formatDate(right.prazoConcessivo)}
                    </small>
                  </span>
                </label>
              ))
            ) : (
              <EmptyState
                title="Nenhum direito pendente"
                description="A programação ainda pode ser registrada, mas poderá exigir justificativa conforme as regras atuais."
              />
            )}
          </section>
        )}
        {((initial && step === 2) || (!initial && step === 2)) && selected && (
          <section className="vacation-step-section">
            <h3>Programação</h3>
            <div className="vacation-form-grid">
              <FormField label="Tipo">
                <Input
                  value={type === "FERIAS" ? "Férias" : "Descanso de estágio"}
                  readOnly
                />
              </FormField>
              <FormField label="Data inicial" required>
                <DateInput
                  ref={firstField}
                  value={draft.dataInicio}
                  onChange={(event) => update("dataInicio", event.target.value)}
                />
              </FormField>
              <FormField label="Data final" required>
                <DateInput
                  value={draft.dataFim}
                  onChange={(event) => {
                    update("dataFim", event.target.value);
                    const suggestion = inclusiveDays(
                      draft.dataInicio,
                      event.target.value,
                    );
                    if (suggestion) update("quantidadeDias", suggestion);
                  }}
                />
              </FormField>
              <FormField label="Quantidade de dias" required>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={draft.quantidadeDias}
                  onChange={(event) =>
                    update("quantidadeDias", event.target.value)
                  }
                />
              </FormField>
              <FormField
                label="Justificativa"
                description="Obrigatória para exceções de intervalo, sobreposição ou saldo."
              >
                <Textarea
                  value={draft.motivo}
                  onChange={(event) => update("motivo", event.target.value)}
                />
              </FormField>
              <FormField label="Observações">
                <Textarea
                  value={draft.observacoes}
                  onChange={(event) =>
                    update("observacoes", event.target.value)
                  }
                />
              </FormField>
            </div>
          </section>
        )}
        {((initial && step === 3) || (!initial && step === 3)) && selected && (
          <section className="vacation-review">
            <h3>Conferência</h3>
            <dl>
              <div>
                <dt>Pessoa</dt>
                <dd>{display(selected.pessoa)}</dd>
              </div>
              <div>
                <dt>Vínculo</dt>
                <dd>{typeLabels[String(selected.tipo)]}</dd>
              </div>
              <div>
                <dt>Direito de referência</dt>
                <dd>
                  {draft.direitoId
                    ? "Direito selecionado"
                    : "Sem direito selecionado"}
                </dd>
              </div>
              <div>
                <dt>Datas</dt>
                <dd>
                  {formatDate(draft.dataInicio)} até {formatDate(draft.dataFim)}
                </dd>
              </div>
              <div>
                <dt>Dias</dt>
                <dd>{decimal(draft.quantidadeDias)}</dd>
              </div>
              <div>
                <dt>Saldo atual</dt>
                <dd>{decimal(currentLedger?.saldoContabil)} dias</dd>
              </div>
              <div>
                <dt>Já comprometido</dt>
                <dd>{decimal(currentLedger?.diasComprometidos)} dias</dd>
              </div>
              <div>
                <dt>Disponível estimado</dt>
                <dd>{decimal(estimated)} dias</dd>
              </div>
              {draft.motivo && (
                <div>
                  <dt>Justificativa</dt>
                  <dd>{draft.motivo}</dd>
                </div>
              )}
              {draft.observacoes && (
                <div>
                  <dt>Observações</dt>
                  <dd>{draft.observacoes}</dd>
                </div>
              )}
            </dl>
          </section>
        )}
        <footer className="vacation-dialog-actions">
          {step > (initial ? 1 : 0) && (
            <Button variant="secondary" onClick={() => setStep(step - 1)}>
              <ChevronLeft size={16} /> Voltar
            </Button>
          )}
          <span />
          {(initial ? step < 3 : step < 3) ? (
            <Button onClick={next}>Continuar</Button>
          ) : (
            <Button loading={pending} onClick={() => void submit()}>
              Confirmar programação
            </Button>
          )}
        </footer>
      </div>
    </Dialog>
  );
}

function LeaveDetail({
  row,
  open,
  onOpenChange,
  onChanged,
  onProgram,
}: {
  row: Row | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
  onProgram: () => void;
}) {
  const [operation, setOperation] = useState<{
    type: "status" | "cancel" | "consume" | "edit";
    period: Row;
  } | null>(null);
  const [reason, setReason] = useState("");
  const [quantity, setQuantity] = useState("");
  const [rightId, setRightId] = useState("");
  const [editStart, setEditStart] = useState("");
  const [editEnd, setEditEnd] = useState("");
  const [editDays, setEditDays] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  if (!row) return null;
  const current = ledger(row),
    periods = asRows(current.periodos),
    rights = asRows(current.direitos),
    consumptions = asRows(current.consumos),
    adjustments = asRows(current.ajustesHistorico);
  const updatePeriod = async (period: Row, status: string) =>
    api(`periodos/${period.id}`, "PUT", {
      vinculoId: period.vinculoId,
      tipo: period.tipo,
      dataInicio: isoDate(period.dataInicio),
      dataFim: isoDate(period.dataFim),
      quantidadeDias: String(period.quantidadeDias),
      status,
      motivo: reason || period.motivo || null,
      observacoes: period.observacoes || null,
    });
  const perform = async () => {
    if (!operation || pending) return;
    setPending(true);
    setError("");
    try {
      if (operation.type === "consume")
        await api("consumos", "POST", {
          periodoId: operation.period.id,
          direitoId: rightId || null,
          quantidadeDias: quantity,
          motivo: reason || null,
        });
      else if (operation.type === "edit")
        await api(`periodos/${operation.period.id}`, "PUT", {
          vinculoId: operation.period.vinculoId,
          tipo: operation.period.tipo,
          dataInicio: editStart,
          dataFim: editEnd,
          quantidadeDias: editDays,
          status: operation.period.status,
          motivo: reason || operation.period.motivo || null,
          observacoes: operation.period.observacoes || null,
        });
      else
        await updatePeriod(
          operation.period,
          operation.type === "cancel"
            ? "CANCELADO"
            : operation.period.status === "PROGRAMADO"
              ? "EM_GOZO"
              : "CONCLUIDO",
        );
      setOperation(null);
      setReason("");
      setQuantity("");
      setRightId("");
      onChanged();
    } catch (cause) {
      setError((cause as Error).message);
      onChanged();
    } finally {
      setPending(false);
    }
  };
  const events = [
    ...rights.map((item) => ({
      id: `right-${item.id}`,
      date: isoDate(item.dataAquisicao),
      title: `Direito adquirido: ${decimal(item.quantidadeDias)} dias`,
      description: item.prazoConcessivo
        ? `Prazo concessivo ${formatDate(item.prazoConcessivo)}`
        : undefined,
      tone: "info" as const,
    })),
    ...periods.map((item) => ({
      id: `period-${item.id}`,
      date: isoDate(item.dataInicio),
      title: `${item.status === "CANCELADO" ? "Período cancelado" : "Período"}: ${decimal(item.quantidadeDias)} dias`,
      description: `${formatDate(item.dataInicio)} até ${formatDate(item.dataFim)} · ${String(item.status)}`,
      tone:
        item.status === "CANCELADO"
          ? ("danger" as const)
          : ("success" as const),
    })),
    ...adjustments.map((item) => ({
      id: `adjust-${item.id}`,
      date: isoDate(item.dataReferencia ?? item.criadoEm),
      title: `Ajuste ${String(item.tipo).toLocaleLowerCase("pt-BR")}: ${decimal(item.quantidadeDias)} dias`,
      description: String(item.motivo ?? ""),
      tone: "warning" as const,
    })),
  ]
    .filter((event) => event.date)
    .sort((a, b) => b.date.localeCompare(a.date));
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={display(row.pessoa)}
      description={`${typeLabels[String(row.tipo)]} · ${display(row.unidade)}`}
      size="lg"
    >
      {operation ? (
        <section className="vacation-operation">
          <Button
            variant="ghost"
            onClick={() => {
              setOperation(null);
              setError("");
            }}
          >
            <ChevronLeft size={16} /> Voltar
          </Button>
          <h3>
            {operation.type === "consume"
              ? "Registrar consumo"
              : operation.type === "edit"
                ? "Reagendar período"
                : operation.type === "cancel"
                  ? "Cancelar período"
                  : operation.period.status === "PROGRAMADO"
                    ? "Iniciar férias"
                    : "Concluir período"}
          </h3>
          {error && <Notice text={error} error />}
          {operation.type === "consume" && (
            <>
              <FormField label="Quantidade de dias" required>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                />
              </FormField>
              <FormField label="Direito utilizado">
                <Select
                  value={rightId}
                  onChange={(event) => setRightId(event.target.value)}
                >
                  <option value="">Sem alocação</option>
                  {rights.map((right) => (
                    <option key={String(right.id)} value={String(right.id)}>
                      {formatDate(right.dataAquisicao)} ·{" "}
                      {decimal(right.pendente)} dias
                    </option>
                  ))}
                </Select>
              </FormField>
            </>
          )}
          {operation.type === "edit" && (
            <div className="vacation-form-grid">
              <FormField label="Data inicial" required>
                <DateInput
                  value={editStart}
                  onChange={(event) => setEditStart(event.target.value)}
                />
              </FormField>
              <FormField label="Data final" required>
                <DateInput
                  value={editEnd}
                  onChange={(event) => setEditEnd(event.target.value)}
                />
              </FormField>
              <FormField label="Quantidade de dias" required>
                <Input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={editDays}
                  onChange={(event) => setEditDays(event.target.value)}
                />
              </FormField>
            </div>
          )}
          <FormField
            label="Motivo / justificativa"
            required={operation.type === "cancel"}
          >
            <Textarea
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </FormField>
          <Button loading={pending} onClick={() => void perform()}>
            Confirmar
          </Button>
        </section>
      ) : (
        <>
          <div className="vacation-detail-summary">
            <MetricCard
              label="Adquiridos"
              value={`${decimal(current.adquiridos)} dias`}
            />
            <MetricCard
              label="Utilizados"
              value={`${decimal(current.consumidos)} dias`}
            />
            <MetricCard
              label="Já comprometido"
              value={`${decimal(current.diasComprometidos)} dias`}
            />
            <MetricCard
              label="Disponível"
              value={`${decimal(current.saldoDisponivelParaProgramar)} dias`}
            />
          </div>
          {asRows(current.alertas).length > 0 && (
            <div className="vacation-alerts">
              {asRows(current.alertas).map((alert, index) => (
                <Notice key={index} text={String(alert)} tone="warning" />
              ))}
            </div>
          )}
          <div className="vacation-detail-actions">
            <Button onClick={onProgram}>
              <CalendarPlus size={17} /> Programar
            </Button>
          </div>
          <section>
            <h3>Períodos</h3>
            {periods.length ? (
              <div className="vacation-period-list">
                {periods.map((period) => (
                  <article key={String(period.id)}>
                    <div>
                      <strong>
                        {formatDate(period.dataInicio)} até{" "}
                        {formatDate(period.dataFim)}
                      </strong>
                      <span>{decimal(period.quantidadeDias)} dias</span>
                    </div>
                    <StatusBadge value={period.status} />
                    {period.status === "PROGRAMADO" && (
                      <ActionMenu
                        label="Ações do período"
                        items={[
                          {
                            label: "Editar / reagendar",
                            onSelect: () => {
                              setEditStart(isoDate(period.dataInicio));
                              setEditEnd(isoDate(period.dataFim));
                              setEditDays(String(period.quantidadeDias));
                              setOperation({ type: "edit", period });
                            },
                          },
                          {
                            label: "Iniciar gozo",
                            onSelect: () =>
                              setOperation({ type: "status", period }),
                          },
                          {
                            label: "Cancelar",
                            tone: "danger",
                            onSelect: () =>
                              setOperation({ type: "cancel", period }),
                          },
                        ]}
                      />
                    )}
                    {period.status === "EM_GOZO" && (
                      <ActionMenu
                        label="Ações do período"
                        items={[
                          {
                            label: "Registrar consumo",
                            onSelect: () =>
                              setOperation({ type: "consume", period }),
                          },
                          {
                            label: "Concluir",
                            onSelect: () =>
                              setOperation({ type: "status", period }),
                          },
                        ]}
                      />
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <EmptyState
                title="Nenhum período"
                description="Ainda não há programação para este vínculo."
              />
            )}
          </section>
          <section>
            <h3>Histórico de direitos e períodos</h3>
            {events.length ? (
              <Timeline
                items={events}
                label="Histórico de direitos e períodos"
              />
            ) : (
              <EmptyState
                title="Nenhum histórico"
                description="Ainda não existem eventos registrados."
              />
            )}
          </section>
          {consumptions.length > 0 && (
            <section>
              <h3>Consumos</h3>
              <ul className="vacation-simple-list">
                {consumptions.map((item) => (
                  <li key={String(item.id)}>
                    {decimal(item.quantidadeDias)} dias ·{" "}
                    {String(item.motivo ?? "Sem observação")}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </Dialog>
  );
}

export function LeavePage({ navigate: _navigate }: { navigate: Navigate }) {
  const options = usePeopleOptions();
  const initial = useMemo(() => new URLSearchParams(location.search), []);
  const [filters, setFilters] = useState<Filters>({
    q: initial.get("q") ?? "",
    status: initial.get("status") ?? "",
    tipo: initial.get("tipo") ?? "",
    unidadeId: initial.get("unidadeId") ?? "",
    equipeId: initial.get("equipeId") ?? "",
    ano: initial.get("ano") ?? String(new Date().getFullYear()),
    situacao: (initial.get("situacao") as Situation) ?? "",
  });
  const [page, setPage] = useState(Number(initial.get("page") ?? 1));
  const [data, setData] = useState<LeaveList>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 25,
    resumo: emptySummary,
    ano: Number(filters.ano),
  });
  const [loading, setLoading] = useState(true),
    [loaded, setLoaded] = useState(false),
    [error, setError] = useState(""),
    [version, setVersion] = useState(0);
  const [detail, setDetail] = useState<Row | null>(null),
    [programFor, setProgramFor] = useState<Row | null | undefined>(undefined);
  const query = queryFor(filters, page);
  useEffect(() => {
    let active = true;
    setLoading(true);
    const timer = setTimeout(
      () =>
        void api<LeaveList>(`descansos-operacional?${query}`)
          .then((result) => {
            if (!active) return;
            setData(result);
            setError("");
            setLoaded(true);
            const requested = initial.get("vinculoId");
            if (requested && !detail)
              setDetail(
                result.items.find((item) => item.id === requested) ?? null,
              );
          })
          .catch((reason) => {
            if (active) setError((reason as Error).message);
          })
          .finally(() => {
            if (active) setLoading(false);
          }),
      180,
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query, version]);
  useEffect(() => {
    const params = new URLSearchParams(query);
    if (detail?.id) params.set("vinculoId", String(detail.id));
    history.replaceState({}, "", `/app/ferias?${params}`);
  }, [detail, query]);
  const update = (key: keyof Filters, value: string) => {
    setFilters((current) => ({ ...current, [key]: value }) as Filters);
    setPage(1);
  };
  const hasFilters = [
    filters.q,
    filters.status,
    filters.tipo,
    filters.unidadeId,
    filters.equipeId,
    filters.situacao,
  ].some(Boolean);
  const clear = () => {
    setFilters({
      q: "",
      status: "",
      tipo: "",
      unidadeId: "",
      equipeId: "",
      ano: filters.ano,
      situacao: "",
    });
    setPage(1);
  };
  const columns: DataTableColumn<Row>[] = [
    {
      key: "pessoa",
      label: "Pessoa",
      priority: "primary",
      render: (row) => (
        <div className="vacation-person-cell">
          <strong>{display(row.pessoa)}</strong>
          <small>{display(row.unidade)}</small>
        </div>
      ),
    },
    {
      key: "tipo",
      label: "Vínculo",
      priority: "always",
      render: (row) => typeLabels[String(row.tipo)] ?? String(row.tipo),
    },
    {
      key: "disponivel",
      label: "Disponível",
      align: "end",
      priority: "always",
      render: (row) => (
        <strong>
          {decimal(ledger(row).saldoDisponivelParaProgramar)} dias
        </strong>
      ),
    },
    {
      key: "saldo",
      label: "Saldo atual",
      align: "end",
      priority: "secondary",
      render: (row) => `${decimal(ledger(row).saldoContabil)} dias`,
    },
    {
      key: "comprometido",
      label: "Comprometido",
      align: "end",
      priority: "secondary",
      render: (row) => `${decimal(ledger(row).diasComprometidos)} dias`,
    },
    {
      key: "unidade",
      label: "Unidade",
      priority: "secondary",
      render: (row) => display(row.unidade),
    },
    {
      key: "proximo",
      label: "Próximo período",
      priority: "desktop",
      render: (row) => {
        const next = asRows(ledger(row).periodos)
          .filter((item) => item.status === "PROGRAMADO")
          .sort((a, b) =>
            isoDate(a.dataInicio).localeCompare(isoDate(b.dataInicio)),
          )[0];
        return next
          ? `${formatDate(next.dataInicio)} · ${decimal(next.quantidadeDias)} dias`
          : "—";
      },
    },
    {
      key: "situacao",
      label: "Situação",
      priority: "always",
      render: (row) => (
        <StatusBadge value={primarySituation(row, filters.ano)} />
      ),
    },
  ];
  const metric = (key: Situation, label: string, value: number) => (
    <button
      type="button"
      className={
        filters.situacao === key
          ? "vacation-metric is-selected"
          : "vacation-metric"
      }
      aria-label={`${label}: ${value} pessoas`}
      aria-pressed={filters.situacao === key}
      onClick={() => update("situacao", filters.situacao === key ? "" : key)}
    >
      <MetricCard label={label} value={value} supportingText="pessoas" />
    </button>
  );
  return (
    <div className="vacations-page">
      <PageHeader
        title="Férias"
        description="Acompanhe direitos, programações e saldos por pessoa."
        action={
          <Button onClick={() => setProgramFor(null)}>
            <CalendarPlus size={17} /> Programar férias ou descanso
          </Button>
        }
      />
      {error && loaded && <Notice text={error} error />}
      {!loaded && loading ? (
        <LoadingSkeleton variant="metrics" label="Carregando férias…" />
      ) : (
        <RefreshingContent refreshing={loading}>
          <section className="vacation-metrics" aria-label="Resumo de férias">
            {metric("A_PROGRAMAR", "A programar", data.resumo.aProgramar)}
            {metric("PROGRAMADO", "Programadas", data.resumo.programadas)}
            {metric("EM_GOZO", "Em férias", data.resumo.emFerias)}
            {metric("CONCLUIDO", "Concluídas", data.resumo.concluidas)}
          </section>
        </RefreshingContent>
      )}
      <FilterBar
        search={filters.q}
        searchLabel="Buscar pessoa"
        searchPlaceholder="Nome, CPF, e-mail ou matrícula"
        onSearchChange={(value) => update("q", value)}
        onClear={clear}
        activeFilters={
          [
            filters.unidadeId && {
              key: "unidade",
              label: `Unidade: ${display(options.units.find((item) => item.id === filters.unidadeId))}`,
              onRemove: () => update("unidadeId", ""),
            },
            filters.tipo && {
              key: "tipo",
              label: `Vínculo: ${typeLabels[filters.tipo]}`,
              onRemove: () => update("tipo", ""),
            },
            filters.status && {
              key: "status",
              label: `Status: ${filters.status}`,
              onRemove: () => update("status", ""),
            },
            filters.equipeId && {
              key: "equipe",
              label: `Equipe: ${display(options.teams.find((item) => item.id === filters.equipeId))}`,
              onRemove: () => update("equipeId", ""),
            },
          ].filter(Boolean) as Array<{
            key: string;
            label: string;
            onRemove: () => void;
          }>
        }
        primaryFilters={
          <>
            <FormField label="Ano">
              <Select
                value={filters.ano}
                onChange={(event) => update("ano", event.target.value)}
              >
                {Array.from(
                  { length: 5 },
                  (_, index) => new Date().getFullYear() - 2 + index,
                ).map((year) => (
                  <option key={year}>{year}</option>
                ))}
              </Select>
            </FormField>
            <FormField label="Unidade">
              <Select
                value={filters.unidadeId}
                onChange={(event) => update("unidadeId", event.target.value)}
              >
                <option value="">Todas</option>
                {options.units.map((item) => (
                  <option key={String(item.id)} value={String(item.id)}>
                    {display(item)}
                  </option>
                ))}
              </Select>
            </FormField>
          </>
        }
      >
        <FormField label="Vínculo">
          <Select
            value={filters.tipo}
            onChange={(event) => update("tipo", event.target.value)}
          >
            <option value="">Todos</option>
            {Object.entries(typeLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </FormField>
        <FormField label="Status do vínculo">
          <Select
            value={filters.status}
            onChange={(event) => update("status", event.target.value)}
          >
            <option value="">Todos</option>
            <option value="ATIVO">Ativo</option>
            <option value="AFASTADO">Afastado</option>
            <option value="DESLIGADO">Desligado</option>
          </Select>
        </FormField>
        <FormField label="Equipe">
          <Select
            value={filters.equipeId}
            onChange={(event) => update("equipeId", event.target.value)}
          >
            <option value="">Todas</option>
            {options.teams.map((item) => (
              <option key={String(item.id)} value={String(item.id)}>
                {display(item)}
              </option>
            ))}
          </Select>
        </FormField>
      </FilterBar>
      <section className="panel vacation-table-panel">
        <p className="vacation-result-count">
          {data.total} pessoa(s) encontrada(s)
          {filters.situacao ? ` · ${situationLabels[filters.situacao]}` : ""}
        </p>
        {error && !loaded ? (
          <div className="vacation-state">
            <Notice text={error} error />
            <Button onClick={() => setVersion((current) => current + 1)}>
              Tentar novamente
            </Button>
          </div>
        ) : (
          <DataTable
            rows={data.items}
            columns={columns}
            primaryKey="pessoa"
            responsiveStrategy="expandable"
            refreshing={loading}
            onRow={(row) => setDetail(row)}
            getRowLabel={(row) => display(row.pessoa)}
            rowActions={(row) => (
              <ActionMenu
                label={`Ações de ${display(row.pessoa)}`}
                items={[
                  { label: "Ver detalhes", onSelect: () => setDetail(row) },
                  { label: "Programar", onSelect: () => setProgramFor(row) },
                ]}
              />
            )}
            empty={
              <EmptyState
                title={
                  hasFilters
                    ? "Nenhuma pessoa encontrada"
                    : "Nenhum vínculo cadastrado"
                }
                description={
                  hasFilters
                    ? "Revise ou limpe os filtros aplicados."
                    : "Cadastre pessoas e vínculos para iniciar o acompanhamento."
                }
                action={
                  hasFilters ? (
                    <Button variant="secondary" onClick={clear}>
                      Limpar filtros
                    </Button>
                  ) : undefined
                }
              />
            }
          />
        )}
        {data.total > data.pageSize && (
          <Pagination page={page} total={data.total} onChange={setPage} />
        )}
      </section>
      <LeaveDetail
        row={detail}
        open={Boolean(detail)}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        onChanged={() => setVersion((current) => current + 1)}
        onProgram={() => {
          setProgramFor(detail);
          setDetail(null);
        }}
      />
      <ProgramFlow
        open={programFor !== undefined}
        onOpenChange={(open) => {
          if (!open) setProgramFor(undefined);
        }}
        initial={programFor ?? null}
        candidates={data.items}
        onSaved={() => setVersion((current) => current + 1)}
      />
    </div>
  );
}
