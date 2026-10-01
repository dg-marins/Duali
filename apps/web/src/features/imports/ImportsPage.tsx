import {
  useEffect,
  useMemo,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { api, display, type Row } from "../../api";
import { Lookup } from "../../components";
import { registerNavigationGuard } from "../../navigationGuard";
import { screens, type Field } from "../../resources";
import {
  Badge,
  Button,
  ConfirmDialog,
  DataTable,
  DateInput,
  EmptyState,
  FormField,
  Input,
  LoadingSkeleton,
  MetricCard,
  Notice,
  PageHeader,
  Pagination,
  RefreshingContent,
  Select,
  Sheet,
  StatusBadge,
  Stepper,
  Textarea,
  useFormDirty,
  type DataTableColumn,
  type StepperItem,
} from "../../components/ui";

type Rule = {
  coluna?: string;
  valor?: string | number | boolean | null;
  grupo?: string;
};

type Group = { nome: string; dominio: string; campos: Record<string, Rule> };

interface ImportSheet {
  nome: string;
  colunas: string[];
  linhas: number;
  previa: Row[];
}

interface Batch {
  id: string;
  nomeArquivo: string;
  status?: string;
  criadoEm?: string;
  confirmadaEm?: string | null;
  abas: ImportSheet[];
  items?: Row[];
  total?: number;
  totalRegistros?: number;
  summary?: { status: string; acao: string; _count: number }[];
}

interface HistoryResponse {
  items: Row[];
  total: number;
  page?: number;
  pageSize?: number;
}

const PAGE_SIZE = 25;
const domains = screens.filter((screen) => screen.path !== "usuarios");
const canReview = (status?: string) =>
  status === "REVISAO" || status === "PARCIAL";
const importProfiles = [
  ["AUTO", "Detectar automaticamente"],
  ["PESSOAS", "Pessoas e vínculos"],
  ["ESTAGIOS", "Estágios"],
  ["DESCANSOS", "Férias"],
  ["BENEFICIOS", "Benefícios"],
] as const;

function initialGroups(profile: string): Group[] {
  const domain =
    profile === "ESTAGIOS"
      ? "estagios"
      : profile === "DESCANSOS"
        ? "periodos"
        : profile === "BENEFICIOS"
          ? "competencias"
          : "pessoas";
  return [
    {
      nome:
        domains.find((screen) => screen.path === domain)?.title ?? "Pessoas",
      dominio: domain,
      campos: {},
    },
  ];
}

function dateTime(value: unknown) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(String(value)));
}

export function importStepperFor(batch: Batch | null): StepperItem[] {
  const steps: StepperItem[] = [
    {
      id: "preparacao",
      label: "Preparação",
      status: batch ? "complete" : "current",
    },
  ];
  if (!batch || !batch.status || batch.status === "UPLOAD") {
    steps.push({
      id: "mapeamento",
      label: "Mapeamento",
      status: batch ? "current" : "upcoming",
    });
  }
  if (batch?.status && batch.status !== "UPLOAD") {
    steps.push({
      id: "revisao",
      label: "Revisão",
      status: batch.status === "CONFIRMADA" ? "complete" : "current",
    });
  }
  if (batch?.status === "CONFIRMADA") {
    steps.push({ id: "resultado", label: "Resultado", status: "current" });
  } else if (!batch) {
    steps.push({ id: "revisao", label: "Revisão", status: "upcoming" });
    steps.push({ id: "resultado", label: "Resultado", status: "upcoming" });
  }
  return steps;
}

export function stableImportGroups(groups: Group[]) {
  return JSON.stringify(groups);
}

function OriginalValues({ item }: { item: Row }) {
  const rows = Object.entries(
    (item.dadosOriginais as Row | undefined) ?? {},
  ).map(([key, value]) => ({ id: key, key, value }));
  return (
    <DataTable
      rows={rows}
      responsiveStrategy="scroll"
      columns={[
        { key: "key", label: "Coluna original", priority: "primary" },
        {
          key: "value",
          label: "Valor preservado",
          priority: "always",
          render: (row) => display(row.value),
        },
      ]}
      empty={
        <EmptyState
          title="Sem dados originais"
          description="O item não possui valores originais disponíveis."
        />
      }
    />
  );
}

function ReviewSheet({
  item,
  open,
  onOpenChange,
  onSaved,
}: {
  item: Row | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const screen = domains.find((candidate) => candidate.path === item?.dominio);
  const [data, setData] = useState<Row>({});
  const [action, setAction] = useState("CRIAR");
  const [target, setTarget] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [before, setBefore] = useState<Row | null>(null);
  const [saving, setSaving] = useState(false);
  const initial = useMemo(
    () =>
      JSON.stringify({
        data: (item?.dadosNormalizados as Row | undefined) ?? {},
        action: "CRIAR",
        target: "",
        reason: "",
      }),
    [item],
  );
  const dirty =
    JSON.stringify({ data, action, target, reason }) !== initial && open;
  useFormDirty(dirty);

  useEffect(() => {
    if (!item || !open) return;
    setData((item.dadosNormalizados as Row | undefined) ?? {});
    setAction("CRIAR");
    setTarget("");
    setReason("");
    setError("");
    setBefore(null);
  }, [item, open]);

  useEffect(() => {
    if (!target || !screen) {
      setBefore(null);
      return;
    }
    let active = true;
    void api<Row>(`${screen.path}/${target}`)
      .then((result) => {
        if (active) setBefore(result);
      })
      .catch(() => {
        if (active) setBefore(null);
      });
    return () => {
      active = false;
    };
  }, [target, screen]);

  if (!item || !screen) return null;
  const candidates =
    (item.candidatos as
      | { id: string; nome: string; evidencia: string }[]
      | undefined) ?? [];
  const differences =
    before && action === "ATUALIZAR"
      ? Object.entries(data)
          .filter(([key, value]) => display(value) !== display(before[key]))
          .map(([key, value]) => ({
            id: key,
            field:
              screen.fields.find((field) => field.key === key)?.label ?? key,
            before: before[key],
            after: value,
          }))
      : [];

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError("");
    try {
      await api(`importacao-itens/${String(item?.id)}`, "PUT", {
        dados: data,
        acao: action,
        ...(target ? { destinoId: target } : {}),
        motivo: reason,
      });
      onSaved();
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function fieldControl(field: Field) {
    const value = data[field.key];
    const update = (next: unknown) => setData({ ...data, [field.key]: next });
    if (field.resource)
      return <Lookup field={field} value={value} onChange={update} />;
    if (field.options)
      return (
        <Select
          value={String(value ?? "")}
          onChange={(event) => update(event.target.value || null)}
        >
          <option value="">Não informado</option>
          {field.options.map((option) => (
            <option key={option}>{option}</option>
          ))}
        </Select>
      );
    if (field.type === "textarea")
      return (
        <Textarea
          value={String(value ?? "")}
          onChange={(event) => update(event.target.value || null)}
        />
      );
    if (field.type === "date")
      return (
        <DateInput
          value={String(value ?? "")}
          onChange={(event) => update(event.target.value || null)}
        />
      );
    return (
      <Input
        type={field.type === "number" ? "number" : "text"}
        value={String(value ?? "")}
        onChange={(event) =>
          update(
            event.target.value === ""
              ? null
              : field.type === "number"
                ? Number(event.target.value)
                : event.target.value,
          )
        }
      />
    );
  }

  return (
    <Sheet
      open={open}
      onOpenChange={onOpenChange}
      title={`Revisar linha ${String(item.numeroLinha)}`}
      description={screen.title}
      size="lg"
      className="imports-review-sheet"
    >
      <form
        onSubmit={(event) => void submit(event)}
        className="imports-review-form"
      >
        <Notice text={error} error />
        {!!(item.mensagens as string[] | undefined)?.length && (
          <Notice
            text={(item.mensagens as string[]).join(" · ")}
            tone="warning"
          />
        )}
        <section>
          <h3>Dados originais</h3>
          <OriginalValues item={item} />
        </section>
        <section>
          <h3>Dados normalizados</h3>
          <div className="imports-field-grid">
            {screen.fields.map((field) => (
              <FormField
                key={field.key}
                label={field.label}
                {...(field.required ? { required: true } : {})}
              >
                {fieldControl(field)}
              </FormField>
            ))}
          </div>
        </section>
        <section>
          <h3>Decisão da revisão</h3>
          <div className="imports-field-grid">
            <FormField label="Decisão" required>
              <Select
                value={action}
                onChange={(event) => setAction(event.target.value)}
              >
                <option value="CRIAR">Criar novo registro</option>
                <option value="VINCULAR">
                  Vincular ao existente sem alterar
                </option>
                <option value="ATUALIZAR">
                  Atualizar existente com dados revisados
                </option>
                <option value="REJEITAR">Rejeitar linha</option>
              </Select>
            </FormField>
            {["VINCULAR", "ATUALIZAR"].includes(action) && (
              <FormField label="Registro de destino" required>
                <div className="imports-target-field">
                  {candidates.length > 0 && (
                    <Select
                      aria-label="Candidatos de duplicidade"
                      value={target}
                      onChange={(event) => setTarget(event.target.value)}
                    >
                      <option value="">Selecionar candidato…</option>
                      {candidates.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.nome} · {candidate.evidencia}
                        </option>
                      ))}
                    </Select>
                  )}
                  <Lookup
                    field={{
                      key: "target",
                      label: "Registro de destino",
                      resource: screen.path,
                    }}
                    value={target}
                    onChange={(value) => setTarget(String(value ?? ""))}
                  />
                </div>
              </FormField>
            )}
            <FormField
              label="Motivo da revisão"
              required
              className="imports-wide-field"
            >
              <Textarea
                required
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </FormField>
          </div>
        </section>
        {before && action === "ATUALIZAR" && (
          <section>
            <h3>Diferenças propostas</h3>
            <DataTable
              rows={differences}
              responsiveStrategy="scroll"
              columns={[
                { key: "field", label: "Campo", priority: "primary" },
                {
                  key: "before",
                  label: "Antes",
                  render: (row) => display(row.before),
                },
                {
                  key: "after",
                  label: "Depois",
                  render: (row) => display(row.after),
                },
              ]}
              empty={
                <EmptyState
                  title="Nenhuma diferença encontrada"
                  description="Os valores revisados são iguais aos dados atuais."
                />
              }
            />
          </section>
        )}
        <footer className="imports-sheet-actions ds-dialog__footer">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onOpenChange(false)}
          >
            Cancelar
          </Button>
          <Button type="submit" loading={saving} disabled={saving}>
            Salvar revisão
          </Button>
        </footer>
      </form>
    </Sheet>
  );
}

export function ImportsPage() {
  const [batch, setBatch] = useState<Batch | null>(null);
  const [situation, setSituation] = useState("TODOS");
  const [domainFilter, setDomainFilter] = useState("");
  const [history, setHistory] = useState<Row[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyPage, setHistoryPage] = useState(1);
  const [profile, setProfile] = useState("AUTO");
  const [aba, setAba] = useState("");
  const [groups, setGroups] = useState<Group[]>(initialGroups("AUTO"));
  const [mappingBaseline, setMappingBaseline] = useState(
    stableImportGroups(initialGroups("AUTO")),
  );
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [batchLoading, setBatchLoading] = useState(false);
  const [review, setReview] = useState<Row | null>(null);
  const [page, setPage] = useState(1);
  const [confirming, setConfirming] = useState(false);
  const [discardMapping, setDiscardMapping] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<
    (() => void) | null
  >(null);
  const mappingDirty =
    Boolean(batch && (!batch.status || batch.status === "UPLOAD")) &&
    stableImportGroups(groups) !== mappingBaseline;

  useEffect(() => {
    if (!mappingDirty) return;
    const unregister = registerNavigationGuard((_destination, proceed) => {
      setPendingNavigation(() => proceed);
      setDiscardMapping(true);
      return true;
    });
    const unload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", unload);
    return () => {
      unregister();
      window.removeEventListener("beforeunload", unload);
    };
  }, [mappingDirty]);

  async function loadHistory(nextPage = historyPage, preserve = true) {
    setHistoryLoading(true);
    try {
      const result = await api<HistoryResponse>(
        `importacoes?page=${nextPage}&pageSize=${PAGE_SIZE}`,
      );
      setHistory(result.items);
      setHistoryTotal(result.total ?? result.items.length);
      setHistoryPage(nextPage);
      setError("");
    } catch (cause) {
      setError((cause as Error).message);
      if (!preserve) setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  useEffect(() => {
    void loadHistory(1, false);
  }, []);

  async function load(id: string, nextPage = page) {
    setBatchLoading(true);
    try {
      const query = new URLSearchParams({
        page: String(nextPage),
        situacao: situation,
        ...(domainFilter ? { dominio: domainFilter } : {}),
      });
      const result = await api<Batch>(`importacoes/${id}?${query}`);
      setBatch(result);
      setAba((current) => current || result.abas[0]?.nome || "");
      setPage(nextPage);
      setError("");
    } finally {
      setBatchLoading(false);
    }
  }

  useEffect(() => {
    if (!batch?.id || batch.status === "UPLOAD") return;
    void load(batch.id, 1).catch((cause) => setError((cause as Error).message));
  }, [situation, domainFilter]);

  async function upload(file: File) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("arquivo", file);
      const result = await api<Batch>("importacoes", "POST", form);
      const nextGroups = initialGroups(profile);
      setGroups(nextGroups);
      setMappingBaseline(stableImportGroups(nextGroups));
      setPage(1);
      setReview(null);
      setConfirming(false);
      if (result.status && result.status !== "UPLOAD") await load(result.id, 1);
      else {
        setBatch(result);
        setAba(result.abas[0]?.nome ?? "");
      }
      await loadHistory(1);
      setNotice(
        "Arquivo recebido. O processamento foi registrado e pode ser retomado pelo histórico.",
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function updateGroups(next: Group[]) {
    setGroups(next);
  }

  function rule(index: number, key: string, next: Rule | undefined) {
    updateGroups(
      groups.map((group, groupIndex) => {
        if (groupIndex !== index) return group;
        const fields = { ...group.campos };
        if (next) fields[key] = next;
        else delete fields[key];
        return { ...group, campos: fields };
      }),
    );
  }

  function fixed(field: Field, value: string): Rule {
    return {
      valor:
        field.type === "checkbox"
          ? value === "true"
          : field.type === "number" && value !== ""
            ? Number(value)
            : value,
    };
  }

  async function analyze() {
    if (!batch || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`importacoes/${batch.id}/analisar`, "POST", {
        aba,
        grupos: groups,
      });
      setMappingBaseline(stableImportGroups(groups));
      await load(batch.id, 1);
      await loadHistory(1);
      setNotice(
        "Análise concluída. Itens aptos podem ter sido publicados pelo processamento atual.",
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function publish() {
    if (!batch || busy) return;
    setBusy(true);
    setError("");
    try {
      await api(`importacoes/${batch.id}/publicar-validos`, "POST", {});
      setConfirming(false);
      await load(batch.id, 1);
      await loadHistory(1);
      setNotice(
        "Publicação processada. Pendências e dependências permanecem disponíveis para revisão.",
      );
    } catch (cause) {
      setError((cause as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const sheet = batch?.abas.find((candidate) => candidate.nome === aba);
  const historyColumns: DataTableColumn<Row>[] = [
    { key: "nomeArquivo", label: "Arquivo", priority: "primary" },
    {
      key: "status",
      label: "Estado da importação",
      priority: "always",
      render: (row) => <StatusBadge value={row.status} />,
    },
    {
      key: "criadoEm",
      label: "Criada em",
      priority: "secondary",
      render: (row) => dateTime(row.criadoEm),
    },
    {
      key: "confirmadaEm",
      label: "Confirmada em",
      priority: "desktop",
      render: (row) => dateTime(row.confirmadaEm),
    },
  ];
  const reviewColumns: DataTableColumn<Row>[] = [
    { key: "numeroLinha", label: "Linha", priority: "primary" },
    { key: "grupo", label: "Grupo", priority: "always" },
    {
      key: "status",
      label: "Estado do item",
      priority: "always",
      render: (row) => <StatusBadge value={row.status} />,
    },
    {
      key: "acao",
      label: "Decisão",
      priority: "secondary",
      render: (row) => <Badge tone="neutral">{String(row.acao)}</Badge>,
    },
    { key: "dominio", label: "Domínio", priority: "secondary" },
    {
      key: "mensagens",
      label: "Mensagens",
      priority: "secondary",
      render: (row) =>
        ((row.mensagens as string[] | undefined) ?? []).join(" · ") || "—",
    },
  ];
  const previewColumns: DataTableColumn<Row>[] = (sheet?.colunas ?? []).map(
    (column, index) => ({
      key: column,
      label: column,
      priority: index === 0 ? "primary" : "secondary",
      render: (row) => display(row[column]),
    }),
  );

  return (
    <main className="imports-page">
      <PageHeader
        title="Importações"
        description="Envie arquivos, revise pendências e acompanhe o resultado persistido de cada processamento."
      />
      <Stepper
        steps={importStepperFor(batch)}
        ariaLabel="Etapas da importação"
      />
      <Notice text={error} error />
      <Notice text={notice} />

      <section className="panel imports-preparation">
        <div className="imports-section-heading">
          <div>
            <h2>Preparação</h2>
            <p>
              Selecionar um arquivo inicia o upload e cria um registro
              persistente da importação.
            </p>
          </div>
        </div>
        <div className="imports-field-grid">
          <FormField
            label="Modelo inicial de mapeamento"
            description="Ajuda a preparar o mapeamento genérico. Perfis especializados continuam sendo detectados pelo servidor."
          >
            <Select
              value={profile}
              disabled={busy}
              onChange={(event) => {
                const nextProfile = event.target.value;
                const nextGroups = initialGroups(nextProfile);
                setProfile(nextProfile);
                setGroups(nextGroups);
                setMappingBaseline(stableImportGroups(nextGroups));
              }}
            >
              {importProfiles.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            label="Arquivo XLSX ou CSV UTF-8"
            description="Até 10 MB. O upload começa automaticamente após a seleção."
          >
            <Input
              type="file"
              accept=".xlsx,.csv"
              disabled={busy}
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
          </FormField>
        </div>
        {busy && <p role="status">Processando operação persistente…</p>}
      </section>

      <section className="panel imports-history">
        <div className="imports-section-heading">
          <div>
            <h2>Histórico</h2>
            <p>Retome importações registradas anteriormente.</p>
          </div>
        </div>
        {historyLoading && history.length === 0 ? (
          <LoadingSkeleton variant="table" label="Carregando histórico…" />
        ) : (
          <RefreshingContent refreshing={historyLoading} preserveContentAccess>
            <DataTable
              rows={history}
              columns={historyColumns}
              responsiveStrategy="priority"
              empty={
                <EmptyState
                  title="Nenhuma importação registrada"
                  description="Selecione um arquivo para iniciar."
                />
              }
              rowActions={(row) => (
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void load(String(row.id), 1).catch((cause) =>
                      setError((cause as Error).message),
                    )
                  }
                >
                  Retomar
                </Button>
              )}
            />
            {historyTotal > PAGE_SIZE && (
              <Pagination
                page={historyPage}
                pageSize={PAGE_SIZE}
                total={historyTotal}
                onChange={(next) => void loadHistory(next)}
              />
            )}
          </RefreshingContent>
        )}
      </section>

      {batchLoading && !batch && (
        <LoadingSkeleton variant="detail" label="Carregando importação…" />
      )}

      {batch && (!batch.status || batch.status === "UPLOAD") && (
        <RefreshingContent refreshing={batchLoading} preserveContentAccess>
          <section className="panel imports-mapping">
            <div className="imports-section-heading">
              <div>
                <h2>Mapeamento</h2>
                <p>{batch.nomeArquivo}</p>
              </div>
              <StatusBadge value="UPLOAD" />
            </div>
            <Notice
              tone="info"
              text="Analisar cria itens de staging e o processamento atual pode publicar imediatamente os registros considerados seguros."
            />
            <FormField label="Aba">
              <Select
                value={aba}
                onChange={(event) => setAba(event.target.value)}
              >
                {batch.abas.map((candidate) => (
                  <option key={candidate.nome}>{candidate.nome}</option>
                ))}
              </Select>
            </FormField>
            <p>{sheet?.linhas ?? 0} linhas encontradas.</p>
            {sheet && (
              <section className="imports-preview">
                <h3>Amostra do arquivo</h3>
                <p>
                  As cinco primeiras linhas são exibidas como recebidas e ainda
                  não representam dados normalizados.
                </p>
                <DataTable
                  rows={(sheet.previa ?? []).map((row, index) => ({
                    ...row,
                    id: `preview-${index}`,
                  }))}
                  columns={previewColumns}
                  responsiveStrategy="scroll"
                  empty={
                    <EmptyState
                      title="A aba selecionada não possui linhas para amostra"
                      description="Selecione outra aba ou confira o arquivo enviado."
                    />
                  }
                />
              </section>
            )}
            <div className="imports-groups">
              {groups.map((group, index) => {
                const screen = domains.find(
                  (candidate) => candidate.path === group.dominio,
                )!;
                return (
                  <section
                    className="imports-mapping-group"
                    key={`${index}-${group.dominio}`}
                  >
                    <div className="imports-field-grid">
                      <FormField label="Nome do grupo">
                        <Input
                          value={group.nome}
                          onChange={(event) =>
                            updateGroups(
                              groups.map((current, currentIndex) =>
                                currentIndex === index
                                  ? { ...current, nome: event.target.value }
                                  : current,
                              ),
                            )
                          }
                        />
                      </FormField>
                      <FormField label="Domínio">
                        <Select
                          value={group.dominio}
                          onChange={(event) =>
                            updateGroups(
                              groups.map((current, currentIndex) =>
                                currentIndex === index
                                  ? {
                                      ...current,
                                      dominio: event.target.value,
                                      campos: {},
                                    }
                                  : current,
                              ),
                            )
                          }
                        >
                          {domains.map((candidate) => (
                            <option key={candidate.path} value={candidate.path}>
                              {candidate.title}
                            </option>
                          ))}
                        </Select>
                      </FormField>
                    </div>
                    <div className="imports-mapping-fields">
                      {screen.fields.map((field) => {
                        const current = group.campos[field.key];
                        const source = current?.coluna
                          ? `coluna:${current.coluna}`
                          : current?.grupo
                            ? `grupo:${current.grupo}`
                            : current?.valor !== undefined
                              ? "fixo"
                              : "";
                        return (
                          <div className="imports-mapping-row" key={field.key}>
                            <span className="imports-mapping-label">
                              {field.label}
                              {field.required ? " *" : ""}
                            </span>
                            <Select
                              aria-label={`Origem ${group.nome} ${field.label}`}
                              value={source}
                              onChange={(event) => {
                                const value = event.target.value;
                                rule(
                                  index,
                                  field.key,
                                  value.startsWith("coluna:")
                                    ? { coluna: value.slice(7) }
                                    : value.startsWith("grupo:")
                                      ? { grupo: value.slice(6) }
                                      : value === "fixo"
                                        ? { valor: "" }
                                        : undefined,
                                );
                              }}
                            >
                              <option value="">Não importar</option>
                              {sheet?.colunas.map((column) => (
                                <option key={column} value={`coluna:${column}`}>
                                  Coluna: {column}
                                </option>
                              ))}
                              <option value="fixo">Valor fixo</option>
                              {groups.slice(0, index).map((previous) => (
                                <option
                                  key={previous.nome}
                                  value={`grupo:${previous.nome}`}
                                >
                                  Registro do grupo: {previous.nome}
                                </option>
                              ))}
                            </Select>
                            {current?.valor !== undefined &&
                              (field.resource ? (
                                <Lookup
                                  field={field}
                                  value={current.valor}
                                  onChange={(value) =>
                                    rule(index, field.key, {
                                      valor: String(value ?? ""),
                                    })
                                  }
                                />
                              ) : field.options || field.type === "checkbox" ? (
                                <Select
                                  aria-label={`Valor fixo ${field.label}`}
                                  value={String(current.valor)}
                                  onChange={(event) =>
                                    rule(
                                      index,
                                      field.key,
                                      fixed(field, event.target.value),
                                    )
                                  }
                                >
                                  <option value="">Selecione…</option>
                                  {(field.options ?? ["true", "false"]).map(
                                    (option) => (
                                      <option key={option}>{option}</option>
                                    ),
                                  )}
                                </Select>
                              ) : field.type === "date" ? (
                                <DateInput
                                  aria-label={`Valor fixo ${field.label}`}
                                  value={String(current.valor ?? "")}
                                  onChange={(event) =>
                                    rule(
                                      index,
                                      field.key,
                                      fixed(field, event.target.value),
                                    )
                                  }
                                />
                              ) : (
                                <Input
                                  aria-label={`Valor fixo ${field.label}`}
                                  type={
                                    field.type === "number" ? "number" : "text"
                                  }
                                  value={String(current.valor ?? "")}
                                  onChange={(event) =>
                                    rule(
                                      index,
                                      field.key,
                                      fixed(field, event.target.value),
                                    )
                                  }
                                />
                              ))}
                          </div>
                        );
                      })}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={groups.length === 1 || busy}
                      onClick={() =>
                        updateGroups(
                          groups.filter(
                            (_, groupIndex) => groupIndex !== index,
                          ),
                        )
                      }
                    >
                      Remover grupo
                    </Button>
                  </section>
                );
              })}
            </div>
            <div className="imports-actions">
              <Button
                type="button"
                variant="secondary"
                disabled={busy}
                onClick={() =>
                  updateGroups([
                    ...groups,
                    {
                      nome: `Grupo ${groups.length + 1}`,
                      dominio: "documentos",
                      campos: {},
                    },
                  ])
                }
              >
                Adicionar grupo
              </Button>
              <Button
                type="button"
                loading={busy}
                disabled={busy}
                onClick={() => void analyze()}
              >
                Analisar e gerar prévia
              </Button>
            </div>
          </section>
        </RefreshingContent>
      )}

      {batch?.status && batch.status !== "UPLOAD" && (
        <RefreshingContent refreshing={batchLoading} preserveContentAccess>
          <section className="panel imports-review">
            <div className="imports-section-heading">
              <div>
                <h2>
                  {batch.status === "CONFIRMADA" ? "Resultado" : "Revisão"} ·{" "}
                  {batch.nomeArquivo}
                  <span className="sr-only"> · {batch.status}</span>
                </h2>
              </div>
              <div className="imports-state-pair">
                <span>Estado da importação</span>
                <StatusBadge value={batch.status} />
              </div>
            </div>
            <p>
              {batch.totalRegistros ?? batch.total ?? 0} registros encontrados
              {batch.totalRegistros !== undefined &&
              batch.totalRegistros !== batch.total
                ? ` · ${batch.total ?? 0} no filtro atual`
                : ""}
              .
            </p>
            <div className="metrics imports-summary">
              {batch.summary?.map((entry) => (
                <MetricCard
                  key={`${entry.status}-${entry.acao}`}
                  label={`${entry.status} · ${entry.acao}`}
                  value={entry._count}
                  tone={
                    /PENDENTE|AGUARDANDO|REVISAO/i.test(
                      `${entry.status} ${entry.acao}`,
                    )
                      ? "warning"
                      : "neutral"
                  }
                />
              ))}
            </div>
            <div className="imports-filter-grid">
              <FormField label="Situação">
                <Select
                  value={situation}
                  onChange={(event) => setSituation(event.target.value)}
                >
                  <option value="TODOS">Todos</option>
                  <option value="DUPLICIDADE">Possível duplicidade</option>
                  <option value="DATA">Data inválida</option>
                  <option value="REFERENCIA">Referência</option>
                  <option value="DEPENDENCIA">Dependência</option>
                  <option value="REJEITADOS">Rejeitados</option>
                  <option value="PRONTOS">Prontos</option>
                </Select>
              </FormField>
              <FormField label="Domínio">
                <Select
                  value={domainFilter}
                  onChange={(event) => setDomainFilter(event.target.value)}
                >
                  <option value="">Todos</option>
                  {domains.map((domain) => (
                    <option key={domain.path} value={domain.path}>
                      {domain.title}
                    </option>
                  ))}
                </Select>
              </FormField>
            </div>
            <DataTable
              rows={batch.items ?? []}
              columns={reviewColumns}
              responsiveStrategy="expandable"
              getRowLabel={(row) => `linha ${String(row.numeroLinha)}`}
              expandButtonText="Mensagens"
              empty={
                <EmptyState
                  title="Nenhum item corresponde aos filtros"
                  description="Remova ou altere os filtros para consultar outros itens."
                />
              }
              rowActions={(row) =>
                canReview(batch.status) ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={(event) => {
                      event.stopPropagation();
                      setReview(row);
                    }}
                    onKeyDown={(event) => event.stopPropagation()}
                  >
                    Revisar
                  </Button>
                ) : null
              }
            />
            {(batch.total ?? 0) > PAGE_SIZE && (
              <Pagination
                page={page}
                pageSize={PAGE_SIZE}
                total={batch.total ?? 0}
                onChange={(next) => void load(batch.id, next)}
              />
            )}
            {canReview(batch.status) && (
              <div className="imports-actions">
                <Button disabled={busy} onClick={() => setConfirming(true)}>
                  Publicar itens disponíveis
                </Button>
              </div>
            )}
          </section>
        </RefreshingContent>
      )}

      <ReviewSheet
        item={review}
        open={Boolean(review)}
        onOpenChange={(open) => {
          if (!open) setReview(null);
        }}
        onSaved={() => {
          setReview(null);
          if (batch) void load(batch.id, page);
          void loadHistory(1);
          setNotice(
            "Revisão salva. O servidor processou os itens que ficaram disponíveis.",
          );
        }}
      />
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Publicar itens disponíveis?"
        description="Somente itens disponíveis serão publicados. Pendentes e dependentes podem permanecer, e a importação pode continuar parcial. Itens já persistidos não serão duplicados."
        confirmLabel={busy ? "Publicando…" : "Publicar disponíveis"}
        onConfirm={() => void publish()}
      />
      <ConfirmDialog
        open={discardMapping}
        onOpenChange={(open) => {
          setDiscardMapping(open);
          if (!open) setPendingNavigation(null);
        }}
        title="Descartar alterações do mapeamento?"
        description="As alterações locais ainda não analisadas serão perdidas. O arquivo enviado continuará registrado."
        confirmLabel="Descartar alterações"
        onConfirm={() => {
          setDiscardMapping(false);
          setMappingBaseline(stableImportGroups(groups));
          const proceed = pendingNavigation;
          setPendingNavigation(null);
          proceed?.();
        }}
      />
    </main>
  );
}
