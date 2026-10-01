import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { api, display, type Row } from "../../../api";
import {
  Badge,
  Button,
  Checkbox,
  ConfirmDialog,
  CurrencyInput,
  DataTable,
  EmptyState,
  FilterBar,
  FormField,
  Input,
  LoadingSkeleton,
  Notice,
  PageHeader,
  Select,
  StatusBadge,
  money,
  type DataTableColumn,
} from "../../../components/ui";
import { registerNavigationGuard } from "../../../navigationGuard";

const labels: Record<string, string> = {
  ALIMENTACAO: "Alimentação",
  TRANSPORTE: "Transporte",
  CESTA_BASICA: "Cesta básica",
  PREMIACAO: "Premiação",
  OUTRO: "Outro",
  ONIBUS: "Ônibus",
  ONIBUS_INTER: "Ônibus Intermunicipal",
  BARCA: "Barca",
  METRO: "Metrô",
  TREM: "Trem",
  OUTROS: "Outros",
};
const benefitTypes = [
  "ALIMENTACAO",
  "TRANSPORTE",
  "CESTA_BASICA",
  "PREMIACAO",
  "OUTRO",
] as const;
type TransportItem = {
  tipoConducao: string;
  fornecedorId: string;
  fornecedor?: Row;
  valorDiario: string;
};
type SupplierOption = {
  configuracaoId: string;
  fornecedorId: string;
  fornecedor: Row;
};
export type MonthlyOrderDraft = Row & {
  id: string;
  vinculoId: string;
  configuracaoId: string;
  fornecedores: SupplierOption[];
  incluir: boolean;
  quantidadeDias: string;
  quantidade: string;
  valorUnitario: string;
  valorMensalBase: string;
  valorSolicitado: string;
  modoAlimentacao: "DIAS_TRABALHADOS" | "VALOR_MENSAL";
  motivoAfastado: string;
  transporteItens: TransportItem[];
};

function normalizeDraft(row: Row): MonthlyOrderDraft {
  const vinculoId = String(row.vinculoId);
  return {
    ...row,
    id: vinculoId,
    vinculoId,
    configuracaoId: String(row.configuracaoId ?? ""),
    fornecedores: (row.fornecedores as SupplierOption[] | undefined) ?? [],
    incluir: Boolean(row.incluirAutomaticamente),
    quantidadeDias: String(row.quantidadeDias ?? ""),
    quantidade: String(row.quantidade ?? ""),
    valorUnitario: String(row.valorUnitario ?? ""),
    valorMensalBase: String(row.valorMensalBase ?? ""),
    valorSolicitado: String(row.valorSugerido ?? ""),
    modoAlimentacao:
      row.valorMensalBase !== null && row.valorMensalBase !== undefined
        ? "VALOR_MENSAL"
        : "DIAS_TRABALHADOS",
    motivoAfastado: "",
    transporteItens: (row.transporteItens as TransportItem[] | undefined) ?? [],
  };
}

// Retained only for the page's existing presentation and validation. The
// backend recalculates every persisted value with Prisma.Decimal.
export function requestedTotal(row: MonthlyOrderDraft, type: string) {
  return type === "TRANSPORTE"
    ? (
        row.transporteItens.reduce(
          (total, item) => total + Number(item.valorDiario || 0),
          0,
        ) * Number(row.quantidadeDias || 0)
      ).toFixed(2)
    : type === "ALIMENTACAO"
      ? row.modoAlimentacao === "VALOR_MENSAL"
        ? row.valorMensalBase
        : (
            Number(row.quantidadeDias || 0) * Number(row.valorUnitario || 0)
          ).toFixed(2)
      : (Number(row.quantidade || 0) * Number(row.valorUnitario || 0)).toFixed(
          2,
        );
}

function TransportComposition({
  row,
  update,
  updateItem,
}: {
  row: MonthlyOrderDraft;
  update: (patch: Partial<MonthlyOrderDraft>) => void;
  updateItem: (index: number, patch: Partial<TransportItem>) => void;
}) {
  return (
    <div
      className="benefit-order-transport"
      aria-label={`Transporte de ${row.pessoa}`}
    >
      <div className="benefit-order-transport__heading">
        <strong>Conduções e fornecedores</strong>
        <span>{row.transporteItens.length} condução(ões)</span>
      </div>
      {row.transporteItens.map((item, index) => (
        <div
          className="benefit-order-transport__row transport-composition-row"
          key={`${item.fornecedorId}-${item.tipoConducao}-${index}`}
        >
          <FormField label={<span>{`Condução ${index + 1}`}</span>}>
            <Select
              aria-label={`Condução de ${row.pessoa}`}
              value={item.tipoConducao}
              onChange={(event) =>
                updateItem(index, { tipoConducao: event.target.value })
              }
            >
              <option value="">Selecione a condução</option>
              {[
                "ONIBUS",
                "ONIBUS_INTER",
                "BARCA",
                "METRO",
                "TREM",
                "OUTROS",
              ].map((value) => (
                <option key={value} value={value}>
                  {labels[value]}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField
            label={<span>{`Fornecedor da condução ${index + 1}`}</span>}
          >
            <Select
              aria-label={`Fornecedor de ${row.pessoa}`}
              value={item.fornecedorId}
              onChange={(event) =>
                updateItem(index, { fornecedorId: event.target.value })
              }
            >
              <option value="">Selecione o fornecedor</option>
              {row.fornecedores.map((option) => (
                <option key={option.fornecedorId} value={option.fornecedorId}>
                  {display(option.fornecedor)}
                </option>
              ))}
            </Select>
          </FormField>
          <FormField label={`Valor diário da condução ${index + 1}`}>
            <CurrencyInput
              value={item.valorDiario}
              onValueChange={(value) =>
                updateItem(index, { valorDiario: value })
              }
              ariaLabel={`Valor diário de ${item.tipoConducao || `condução ${index + 1}`} para ${row.pessoa}`}
              placeholder="Informe o valor diário"
            />
          </FormField>
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              update({
                transporteItens: row.transporteItens.filter(
                  (_, itemIndex) => itemIndex !== index,
                ),
              })
            }
          >
            Remover
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="secondary"
        onClick={() =>
          update({
            transporteItens: [
              ...row.transporteItens,
              { tipoConducao: "", fornecedorId: "", valorDiario: "" },
            ],
          })
        }
      >
        Adicionar condução
      </Button>
    </div>
  );
}

export function MonthlyOrderPage({
  navigate,
}: {
  navigate: (path: string) => void;
}) {
  const initial = useMemo(() => new URLSearchParams(location.search), []);
  const [units, setUnits] = useState<Row[]>([]);
  const [unit, setUnit] = useState(initial.get("unidadeId") ?? "");
  const [month, setMonth] = useState(
    (initial.get("competencia") ?? new Date().toISOString().slice(0, 7)).slice(
      0,
      7,
    ),
  );
  const [type, setType] = useState(initial.get("tipo") ?? "ALIMENTACAO");
  const [rows, setRows] = useState<MonthlyOrderDraft[]>([]);
  const [baseline, setBaseline] = useState("[]");
  const [draftReady, setDraftReady] = useState(false);
  const [query, setQuery] = useState("");
  const [unitsLoading, setUnitsLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [unitsError, setUnitsError] = useState("");
  const [reloadPreview, setReloadPreview] = useState(0);
  const [confirmGenerate, setConfirmGenerate] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const pendingDiscard = useRef<(() => void) | null>(null);
  const releaseGuard = useRef<(() => void) | null>(null);
  const contextRef = useRef("");
  const competence = `${month}-01`;
  const serializedDraft = useMemo(() => JSON.stringify(rows), [rows]);
  const dirty = draftReady && serializedDraft !== baseline;

  const loadUnits = useCallback(async () => {
    setUnitsLoading(true);
    setUnitsError("");
    try {
      const all: Row[] = [];
      for (let page = 1; ; page++) {
        const response = await api<{ items: Row[]; total: number }>(
          `unidades?page=${page}&pageSize=100`,
        );
        all.push(...response.items);
        if (all.length >= response.total || !response.items.length) break;
      }
      setUnits(all);
      setUnit((value) => value || String(all[0]?.id ?? ""));
    } catch (reason) {
      setUnitsError((reason as Error).message);
    } finally {
      setUnitsLoading(false);
    }
  }, []);

  useEffect(() => void loadUnits(), [loadUnits]);
  useEffect(() => {
    if (!unit) return;
    const context = `${unit}:${competence}:${type}`;
    const contextChanged = contextRef.current !== context;
    contextRef.current = context;
    let current = true;
    const params = new URLSearchParams({
      unidadeId: unit,
      competencia: competence,
      tipo: type,
    });
    history.replaceState({}, "", `/app/beneficios/aquisicao?${params}`);
    setError("");
    if (contextChanged) {
      setRows([]);
      setBaseline("[]");
      setDraftReady(false);
      setLoading(true);
    } else if (rows.length) setRefreshing(true);
    else setLoading(true);
    void api<Row[]>(`aquisicoes-beneficios/pedido/previa?${params}`)
      .then((response) => {
        if (!current) return;
        const next = response.map(normalizeDraft);
        setRows(next);
        setBaseline(JSON.stringify(next));
        setDraftReady(true);
        setError("");
      })
      .catch((reason) => {
        if (current) setError((reason as Error).message);
      })
      .finally(() => {
        if (!current) return;
        setLoading(false);
        setRefreshing(false);
      });
    return () => {
      current = false;
    };
    // A draft edit must never trigger another preview request.
  }, [unit, month, type, reloadPreview]);

  useEffect(() => {
    if (!dirty) return;
    const unregister = registerNavigationGuard((_destination, proceed) => {
      pendingDiscard.current = proceed;
      setConfirmDiscard(true);
      return true;
    });
    releaseGuard.current = unregister;
    const unload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", unload);
    return () => {
      unregister();
      if (releaseGuard.current === unregister) releaseGuard.current = null;
      window.removeEventListener("beforeunload", unload);
    };
  }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const marker = { ...(history.state ?? {}), dualiBenefitOrderGuard: true };
    history.pushState(marker, "", location.href);
    let allowing = false;
    const back = () => {
      if (allowing) return;
      history.pushState(marker, "", location.href);
      pendingDiscard.current = () => {
        allowing = true;
        history.go(-2);
      };
      setConfirmDiscard(true);
    };
    window.addEventListener("popstate", back);
    return () => window.removeEventListener("popstate", back);
  }, [dirty]);

  const selected = useMemo(() => rows.filter((row) => row.incluir), [rows]);
  const visible = useMemo(
    () =>
      rows.filter(
        (row) =>
          !query ||
          String(row.pessoa)
            .toLocaleLowerCase("pt-BR")
            .includes(query.toLocaleLowerCase("pt-BR")),
      ),
    [rows, query],
  );
  const selectedTotal = useMemo(
    () =>
      selected.reduce(
        (sum, row) => sum + Number(requestedTotal(row, type) || 0),
        0,
      ),
    [selected, type],
  );
  const unitName = display(units.find((item) => String(item.id) === unit));
  const update = useCallback(
    (id: string, patch: Partial<MonthlyOrderDraft>) =>
      setRows((all) =>
        all.map((row) => (row.vinculoId === id ? { ...row, ...patch } : row)),
      ),
    [],
  );
  const updateTransportItem = useCallback(
    (id: string, index: number, patch: Partial<TransportItem>) =>
      setRows((all) =>
        all.map((row) =>
          row.vinculoId !== id
            ? row
            : {
                ...row,
                transporteItens: row.transporteItens.map((item, itemIndex) =>
                  itemIndex === index ? { ...item, ...patch } : item,
                ),
              },
        ),
      ),
    [],
  );
  const requestContextChange = useCallback(
    (action: () => void) => {
      if (!dirty) action();
      else {
        pendingDiscard.current = action;
        setConfirmDiscard(true);
      }
    },
    [dirty],
  );
  const acceptDiscard = useCallback(() => {
    const action = pendingDiscard.current;
    pendingDiscard.current = null;
    setConfirmDiscard(false);
    releaseGuard.current?.();
    releaseGuard.current = null;
    setBaseline(serializedDraft);
    setDraftReady(false);
    action?.();
  }, [serializedDraft]);

  const validate = useCallback(() => {
    if (
      selected.some(
        (row) => row.vinculoStatus === "AFASTADO" && !row.motivoAfastado.trim(),
      )
    ) {
      setError(
        "Informe o motivo para cada vínculo afastado incluído no pedido.",
      );
      return false;
    }
    if (
      selected.some(
        (row) =>
          (type === "TRANSPORTE"
            ? !row.transporteItens.length ||
              row.transporteItens.some(
                (item) =>
                  !item.tipoConducao || !item.fornecedorId || !item.valorDiario,
              )
            : !row.configuracaoId) ||
          Number(requestedTotal(row, type) || 0) <= 0,
      )
    ) {
      setError(
        "Complete condução, fornecedor, valores e quantidades das pessoas selecionadas.",
      );
      return false;
    }
    setError("");
    return true;
  }, [selected, type]);
  const openConfirmation = useCallback(() => {
    if (!saving && selected.length && validate()) setConfirmGenerate(true);
  }, [saving, selected.length, validate]);
  const generate = useCallback(async () => {
    if (saving || !validate()) return;
    setConfirmGenerate(false);
    setSaving(true);
    try {
      const result = await api<{ pedidos: number; competencias: number }>(
        "aquisicoes-beneficios/pedido/gerar",
        "POST",
        {
          unidadeId: unit,
          competencia: competence,
          tipo: type,
          itens: rows.map((row) => ({
            vinculoId: row.vinculoId,
            configuracaoId: row.configuracaoId || null,
            incluir: row.incluir,
            quantidadeDias: row.quantidadeDias || null,
            quantidade: row.quantidade || null,
            valorUnitario: row.valorUnitario || null,
            valorMensalBase: row.valorMensalBase || null,
            valorSolicitado: requestedTotal(row, type) || null,
            ...(type === "ALIMENTACAO"
              ? { modoAlimentacao: row.modoAlimentacao }
              : {}),
            motivoAfastado: row.motivoAfastado || undefined,
            transporteItens:
              type === "TRANSPORTE"
                ? row.transporteItens.map((item) => ({
                    tipoConducao: item.tipoConducao,
                    fornecedorId: item.fornecedorId,
                    valorDiario: item.valorDiario,
                  }))
                : undefined,
          })),
        },
        { idempotencyKey: crypto.randomUUID() },
      );
      releaseGuard.current?.();
      releaseGuard.current = null;
      setBaseline(serializedDraft);
      setDraftReady(false);
      toast.success(
        `${result.pedidos} pedido(s) gerado(s) para ${result.competencias} pessoa(s).`,
      );
      navigate(
        `/app/beneficios/competencias?unidadeId=${unit}&competencia=${competence}&tipo=${type}`,
      );
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }, [
    competence,
    navigate,
    rows,
    saving,
    serializedDraft,
    type,
    unit,
    validate,
  ]);

  const columns: DataTableColumn<MonthlyOrderDraft>[] = [
    {
      key: "include",
      label: "Incluir",
      priority: "always",
      render: (row) => (
        <Checkbox
          aria-label={`Incluir ${row.pessoa}`}
          disabled={Boolean(row.impedimento)}
          checked={row.incluir}
          onChange={(event) =>
            update(row.vinculoId, { incluir: event.target.checked })
          }
        />
      ),
    },
    {
      key: "person",
      label: "Pessoa",
      priority: "primary",
      render: (row) => <strong>{String(row.pessoa)}</strong>,
    },
    {
      key: "supplier",
      label: "Fornecedor",
      priority: "secondary",
      render: (row) =>
        type === "TRANSPORTE" ? (
          "Por condução"
        ) : (
          <Select
            aria-label={`Fornecedor de ${row.pessoa}`}
            value={row.configuracaoId}
            onChange={(event) =>
              update(row.vinculoId, { configuracaoId: event.target.value })
            }
          >
            <option value="">Selecione</option>
            {row.fornecedores.map((option) => (
              <option key={option.configuracaoId} value={option.configuracaoId}>
                {display(option.fornecedor)}
              </option>
            ))}
          </Select>
        ),
    },
    {
      key: "reference",
      label: "Referência",
      priority: "secondary",
      render: (row) => (
        <span className="benefit-order-reference">
          <strong>
            {row.valorPrevisto == null
              ? "Sem previsão persistida"
              : `Previsto: ${money(row.valorPrevisto)}`}
          </strong>
          <span>
            {row.referenciaStatus === "NOVA_AQUISICAO"
              ? "Nova aquisição"
              : row.referenciaStatus === "SEM_REFERENCIA"
                ? "Sem referência no mês anterior"
                : `Mês anterior: ${money(row.referenciaAnterior)}`}
          </span>
        </span>
      ),
    },
    {
      key: "parameters",
      label: type === "TRANSPORTE" ? "Dias e conduções" : "Parâmetros",
      priority: "desktop",
      render: (row) =>
        type === "TRANSPORTE" ? (
          <div className="benefit-order-parameters">
            <FormField label={<span>Dias</span>}>
              <Input
                type="number"
                min="0"
                aria-label={`Dias de ${row.pessoa}`}
                value={row.quantidadeDias}
                onChange={(event) =>
                  update(row.vinculoId, { quantidadeDias: event.target.value })
                }
              />
            </FormField>
            <TransportComposition
              row={row}
              update={(patch) => update(row.vinculoId, patch)}
              updateItem={(index, patch) =>
                updateTransportItem(row.vinculoId, index, patch)
              }
            />
          </div>
        ) : type === "ALIMENTACAO" ? (
          <div className="benefit-order-parameters">
            <FormField label={<span>Cálculo</span>}>
              <Select
                aria-label={`Cálculo de alimentação de ${row.pessoa}`}
                value={row.modoAlimentacao}
                onChange={(event) =>
                  update(row.vinculoId, {
                    modoAlimentacao: event.target.value as
                      | "DIAS_TRABALHADOS"
                      | "VALOR_MENSAL",
                  })
                }
              >
                <option value="DIAS_TRABALHADOS">Dias trabalhados</option>
                <option value="VALOR_MENSAL">Valor mensal</option>
              </Select>
            </FormField>
            {row.modoAlimentacao === "DIAS_TRABALHADOS" ? (
              <div className="benefit-order-food-fields">
                <FormField label={<span>Dias</span>}>
                  <Input
                    type="number"
                    min="0"
                    aria-label={`Dias de ${row.pessoa}`}
                    value={row.quantidadeDias}
                    onChange={(event) =>
                      update(row.vinculoId, {
                        quantidadeDias: event.target.value,
                      })
                    }
                  />
                </FormField>
                <FormField label="Valor diário">
                  <CurrencyInput
                    value={row.valorUnitario}
                    onValueChange={(value) =>
                      update(row.vinculoId, { valorUnitario: value })
                    }
                    ariaLabel={`Valor diário de ${row.pessoa}`}
                  />
                </FormField>
              </div>
            ) : (
              <FormField label="Valor mensal">
                <CurrencyInput
                  value={row.valorMensalBase}
                  onValueChange={(value) =>
                    update(row.vinculoId, { valorMensalBase: value })
                  }
                  ariaLabel={`Valor mensal de ${row.pessoa}`}
                />
              </FormField>
            )}
          </div>
        ) : (
          <div className="benefit-order-quantity-fields">
            <FormField label={<span>Quantidade</span>}>
              <Input
                type="number"
                min="0"
                aria-label={`Quantidade de ${row.pessoa}`}
                value={row.quantidade}
                onChange={(event) =>
                  update(row.vinculoId, { quantidade: event.target.value })
                }
              />
            </FormField>
            <FormField label="Valor unitário">
              <CurrencyInput
                value={row.valorUnitario}
                onValueChange={(value) =>
                  update(row.vinculoId, { valorUnitario: value })
                }
                ariaLabel={`Valor unitário de ${row.pessoa}`}
              />
            </FormField>
          </div>
        ),
    },
    {
      key: "total",
      label: "Total solicitado",
      align: "end",
      priority: "always",
      render: (row) => (
        <output aria-label={`Total solicitado de ${row.pessoa}`}>
          <strong>{money(requestedTotal(row, type))}</strong>
        </output>
      ),
    },
    {
      key: "status",
      label: "Situação",
      priority: "always",
      render: (row) =>
        row.impedimento ? (
          <span className="benefit-order-blocked">
            {String(row.impedimento)}
          </span>
        ) : row.vinculoStatus === "AFASTADO" ? (
          <StatusBadge value="AFASTADO" />
        ) : (
          <Badge tone="success">Elegível</Badge>
        ),
    },
    {
      key: "awayReason",
      label: "Motivo da inclusão",
      priority: "desktop",
      render: (row) =>
        row.vinculoStatus === "AFASTADO" ? (
          <div className="benefit-order-away">
            <FormField label={<span>Motivo da inclusão</span>}>
              <Input
                aria-label={`Motivo da inclusão de ${row.pessoa}`}
                value={row.motivoAfastado}
                onChange={(event) =>
                  update(row.vinculoId, { motivoAfastado: event.target.value })
                }
              />
            </FormField>
          </div>
        ) : null,
    },
  ];

  const empty = query ? (
    <EmptyState
      title="Nenhuma pessoa corresponde à busca"
      description="Limpe ou altere a busca para ver as pessoas elegíveis desta competência."
      action={
        <Button type="button" variant="secondary" onClick={() => setQuery("")}>
          Limpar busca
        </Button>
      }
    />
  ) : (
    <EmptyState
      title="Nenhuma pessoa elegível"
      description="Não há vínculos elegíveis para esta unidade, competência e categoria."
    />
  );

  return (
    <div className="page-stack benefit-order-page">
      <PageHeader
        title="Fazer pedido"
        description="Revise as sugestões desta competência e altere somente as exceções."
        action={
          <Button
            type="button"
            variant="secondary"
            onClick={() =>
              navigate(
                `/app/beneficios?unidadeId=${unit}&competencia=${competence}`,
              )
            }
          >
            Voltar
          </Button>
        }
      />
      <Notice
        text="As alterações permanecem como rascunho nesta página. Gerar pedido cria os pedidos e suas reservas em uma única operação."
        tone="info"
      />
      <Notice text={unitsError} error />
      <Notice text={error} error />
      {unitsLoading ? (
        <LoadingSkeleton variant="detail" label="Carregando unidades…" />
      ) : unitsError ? (
        <EmptyState
          title="Não foi possível carregar as unidades"
          description="Tente novamente para iniciar o pedido mensal."
          action={
            <Button onClick={() => void loadUnits()}>Tentar novamente</Button>
          }
        />
      ) : !units.length ? (
        <EmptyState
          title="Nenhuma unidade disponível"
          description="Cadastre uma unidade ativa antes de emitir pedidos mensais."
        />
      ) : (
        <>
          <FilterBar
            search={query}
            searchLabel="Buscar pessoa"
            searchPlaceholder="Digite o nome da pessoa"
            onSearchChange={setQuery}
            primaryFilters={
              <div className="benefit-order-context">
                <FormField label="Competência">
                  <Input
                    type="month"
                    value={month}
                    onChange={(event) => {
                      const value = event.target.value;
                      requestContextChange(() => setMonth(value));
                    }}
                  />
                </FormField>
                <FormField label="Unidade">
                  <Select
                    value={unit}
                    onChange={(event) => {
                      const value = event.target.value;
                      requestContextChange(() => setUnit(value));
                    }}
                  >
                    {units.map((item) => (
                      <option key={String(item.id)} value={String(item.id)}>
                        {display(item)}
                      </option>
                    ))}
                  </Select>
                </FormField>
                <FormField label="Benefício">
                  <Select
                    value={type}
                    onChange={(event) => {
                      const value = event.target.value;
                      requestContextChange(() => setType(value));
                    }}
                  >
                    {benefitTypes.map((value) => (
                      <option key={value} value={value}>
                        {labels[value]}
                      </option>
                    ))}
                  </Select>
                </FormField>
              </div>
            }
          />
          <section
            className="panel benefit-order-content"
            aria-labelledby="benefit-order-heading"
          >
            <div className="benefit-order-summary">
              <div>
                <h2 id="benefit-order-heading">{labels[type]}</h2>
                <p>
                  {selected.length} pessoa(s) serão incluídas. A retirada vale
                  somente para esta emissão.
                </p>
              </div>
              <div className="benefit-order-summary__total">
                <span>Total de apresentação</span>
                <strong>{money(selectedTotal)}</strong>
              </div>
            </div>
            {loading && !rows.length ? (
              <LoadingSkeleton variant="table" label="Carregando elegíveis…" />
            ) : error && !rows.length ? (
              <EmptyState
                title="Não foi possível carregar a prévia"
                description="O pedido não foi alterado. Tente carregar os dados novamente."
                action={
                  <Button
                    onClick={() => setReloadPreview((value) => value + 1)}
                  >
                    Tentar novamente
                  </Button>
                }
              />
            ) : (
              <DataTable
                columns={columns}
                rows={visible}
                empty={empty}
                responsiveStrategy="expandable"
                refreshing={refreshing}
                expandButtonText="Ver"
                getRowLabel={(row) => String(row.pessoa)}
              />
            )}
            <div className="benefit-order-actions">
              <div aria-live="polite">
                {saving ? "Gerando pedidos e reservas…" : ""}
              </div>
              <Button
                type="button"
                loading={saving}
                disabled={!selected.length || loading || refreshing}
                onClick={openConfirmation}
              >
                Gerar pedido
              </Button>
            </div>
          </section>
        </>
      )}
      <ConfirmDialog
        open={confirmGenerate}
        onOpenChange={(open) => !saving && setConfirmGenerate(open)}
        title="Gerar pedidos e reservas?"
        description={`Competência: ${competence.split("-").slice(0, 2).reverse().join("/")} · Unidade: ${unitName} · Categoria: ${labels[type]} · Pessoas: ${selected.length} · Total de apresentação: ${money(selectedTotal)}. Esta operação criará os pedidos e as reservas correspondentes.`}
        confirmLabel="Gerar pedido"
        onConfirm={() => void generate()}
      />
      <ConfirmDialog
        open={confirmDiscard}
        onOpenChange={(open) => {
          setConfirmDiscard(open);
          if (!open) pendingDiscard.current = null;
        }}
        title="Descartar alterações do pedido?"
        description="Seleções, valores, fornecedores, conduções e motivos ainda não foram salvos e serão perdidos."
        confirmLabel="Descartar alterações"
        onConfirm={acceptDiscard}
      />
    </div>
  );
}
