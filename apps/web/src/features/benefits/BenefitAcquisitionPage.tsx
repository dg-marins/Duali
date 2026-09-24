import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, display, type Row } from "../../api";
import {
  Button,
  CurrencyInput,
  Dialog,
  EmptyState,
  LoadingSkeleton,
  MetricCard,
  Notice,
  PageHeader,
  RefreshingContent,
  StatusBadge,
  money,
} from "../../components/ui";
import {
  benefitLabels,
  occurrenceLabels,
  sumDecimal,
} from "./benefitCycleModel";

type DetailKey = { unidadeId: string; tipo: string };
type DetailMode = "summary" | "confirm" | "reverse";
type DetailResponse = {
  possuiPrevisao: boolean;
  previsao: (Row & { itens: Row[] }) | null;
  pedidos: Row[];
  fechamento: string;
};

export function BenefitAcquisitionPage({
  navigate,
}: {
  navigate: (path: string) => void;
}) {
  const params = new URLSearchParams(location.search);
  const [units, setUnits] = useState<Row[]>([]);
  const [unit, setUnit] = useState(params.get("unidadeId") ?? "");
  const [month, setMonth] = useState(
    (params.get("competencia") ?? new Date().toISOString().slice(0, 7)).slice(
      0,
      7,
    ),
  );
  const [type, setType] = useState(
    params.get("tipo") ?? params.get("categoria") ?? "",
  );
  const [cycleRows, setCycleRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);
  const [detailKey, setDetailKey] = useState<DetailKey | null>(null);
  const [detail, setDetail] = useState<DetailResponse | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [mode, setMode] = useState<DetailMode>("summary");
  const [selectedOrder, setSelectedOrder] = useState<Row | null>(null);
  const [working, setWorking] = useState(false);
  const [purchaseDate, setPurchaseDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [externalReference, setExternalReference] = useState("");
  const [confirmationItems, setConfirmationItems] = useState<
    Record<
      string,
      { valor: string; status: "CONFIRMADO" | "REJEITADO"; motivo: string }
    >
  >({});
  const [reversal, setReversal] = useState({
    itemId: "",
    valor: "",
    motivo: "",
  });
  const competence = `${month}-01`;

  async function load() {
    setLoading(true);
    try {
      const query = new URLSearchParams({ competencia: competence });
      if (unit) query.set("unidadeId", unit);
      const cycle = await api<{ itens: Row[] }>(
        `beneficios/ciclo-mensal?${query}`,
      );
      setCycleRows(cycle.itens);
      setError("");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }

  async function loadDetail(key: DetailKey) {
    setDetailLoading(true);
    try {
      const query = new URLSearchParams({
        competencia: competence,
        unidadeId: key.unidadeId,
        tipo: key.tipo,
      });
      setDetail(
        await api<DetailResponse>(`beneficios/ciclo-mensal/detalhe?${query}`),
      );
      setError("");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setDetailLoading(false);
    }
  }

  useEffect(() => {
    void api<{ items: Row[] }>("unidades?pageSize=100&page=1")
      .then((result) => setUnits(result.items))
      .catch((reason) => setError((reason as Error).message));
  }, []);
  useEffect(() => {
    const query = new URLSearchParams({ competencia: competence });
    if (unit) query.set("unidadeId", unit);
    if (type) {
      query.set("tipo", type);
      query.set("categoria", type);
    }
    history.replaceState({}, "", `${location.pathname}?${query}`);
    void load();
  }, [unit, month, type, reloadVersion]);
  useEffect(() => {
    if (detailKey) void loadDetail(detailKey);
  }, [detailKey, month]);

  const categories = useMemo(() => {
    const groups = new Map<
      string,
      { unidadeId: string; unidade: string; tipo: string; rows: Row[] }
    >();
    for (const row of cycleRows.filter((item) => !type || item.tipo === type)) {
      const key = `${row.unidadeId}:${row.tipo}`;
      const group = groups.get(key) ?? {
        unidadeId: String(row.unidadeId),
        unidade: String(row.unidade),
        tipo: String(row.tipo),
        rows: [],
      };
      group.rows.push(row);
      groups.set(key, group);
    }
    return [...groups.values()].sort(
      (a, b) =>
        a.unidade.localeCompare(b.unidade, "pt-BR") ||
        a.tipo.localeCompare(b.tipo, "pt-BR"),
    );
  }, [cycleRows, type]);
  const unitCards = useMemo(() => {
    const groups = new Map<
      string,
      { unidadeId: string; unidade: string; categories: typeof categories }
    >();
    for (const category of categories) {
      const current = groups.get(category.unidadeId) ?? {
        unidadeId: category.unidadeId,
        unidade: category.unidade,
        categories: [],
      };
      current.categories.push(category);
      groups.set(category.unidadeId, current);
    }
    return [...groups.values()];
  }, [categories]);

  function categoryValues(rows: Row[]) {
    const predicted = new Set(
      rows.flatMap((row) =>
        Array.isArray(row.vinculosPrevistos)
          ? (row.vinculosPrevistos as string[])
          : [],
      ),
    );
    const requested = sumDecimal(rows.map((row) => row.valorSolicitado));
    const pending = sumDecimal(rows.map((row) => row.saldoPendente));
    return {
      predicted: predicted.size,
      forecast: sumDecimal(rows.map((row) => row.valorPrevisto)),
      requested,
      concluded: sumDecimal(rows.map((row) => row.valorConcluido)),
      pending,
      state:
        BigInt(pending.replace(".", "")) > 0n
          ? "SOLICITADO"
          : BigInt(requested.replace(".", "")) > 0n
            ? "CONCLUIDO"
            : predicted.size
              ? "PREVISTO"
              : "CANCELADO",
      occurrences: [
        ...new Set(
          rows.flatMap((row) =>
            Array.isArray(row.ocorrencias) ? (row.ocorrencias as string[]) : [],
          ),
        ),
      ],
      impediments: [
        ...new Set(
          rows.flatMap((row) =>
            Array.isArray(row.impedimentos)
              ? (row.impedimentos as string[])
              : [],
          ),
        ),
      ],
    };
  }

  function openConfirmation(order: Row) {
    setSelectedOrder(order);
    setExternalReference(String(order.referenciaExterna ?? ""));
    setConfirmationItems(
      Object.fromEntries(
        ((order.itens as Row[]) ?? [])
          .filter((item) => item.status === "PENDENTE")
          .map((item) => [
            String(item.id),
            {
              valor: String(item.valorReservado),
              status: "CONFIRMADO" as const,
              motivo: "",
            },
          ]),
      ),
    );
    setMode("confirm");
  }
  async function confirm() {
    if (!selectedOrder) return;
    setWorking(true);
    try {
      await api(
        `aquisicoes-beneficios/${selectedOrder.id}/confirmar`,
        "POST",
        {
          dataCompra: purchaseDate,
          ...(externalReference
            ? { referenciaExterna: externalReference }
            : {}),
          itens: Object.entries(confirmationItems).map(([itemId, item]) => ({
            itemId,
            valor: item.status === "REJEITADO" ? "0" : item.valor,
            status: item.status,
            ...(item.motivo ? { motivo: item.motivo } : {}),
          })),
        },
        { idempotencyKey: crypto.randomUUID() },
      );
      toast.success("Compra registrada.");
      setMode("summary");
      await load();
      if (detailKey) await loadDetail(detailKey);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function cancel(order: Row) {
    setWorking(true);
    try {
      await api(
        `aquisicoes-beneficios/${order.id}/cancelar`,
        "POST",
        {},
        { idempotencyKey: crypto.randomUUID() },
      );
      toast.success("Pedido cancelado.");
      await load();
      if (detailKey) await loadDetail(detailKey);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function reverse() {
    if (!reversal.itemId) return;
    setWorking(true);
    try {
      await api(
        `aquisicoes-beneficios/itens/${reversal.itemId}/reverter`,
        "POST",
        { valor: reversal.valor, data: purchaseDate, motivo: reversal.motivo },
        { idempotencyKey: crypto.randomUUID() },
      );
      toast.success("Reversão registrada.");
      setMode("summary");
      await load();
      if (detailKey) await loadDetail(detailKey);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setWorking(false);
    }
  }

  const context = new URLSearchParams({ competencia: competence });
  if (unit) context.set("unidadeId", unit);
  if (type) context.set("tipo", type);
  return (
    <div className="page-stack benefits-page competencies-page">
      <PageHeader
        title="Competências"
        description="Acompanhe o ciclo financeiro mensal por unidade e categoria."
        action={
          <div className="benefits-header-actions">
            <Button
              variant="secondary"
              onClick={() => navigate(`/app/beneficios?${context}`)}
            >
              Voltar ao resumo
            </Button>
            <Button
              variant="secondary"
              onClick={() => navigate(`/app/beneficios/fechamento?${context}`)}
            >
              Gerenciar fechamento
            </Button>
          </div>
        }
      />
      <section className="panel benefits-context">
        <label>
          <span>Competência</span>
          <input
            type="month"
            value={month}
            onChange={(event) => setMonth(event.target.value)}
          />
        </label>
        <label>
          <span>Unidade</span>
          <select
            value={unit}
            onChange={(event) => setUnit(event.target.value)}
          >
            <option value="">Todas as unidades</option>
            {units.map((item) => (
              <option key={String(item.id)} value={String(item.id)}>
                {display(item)}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span>Categoria</span>
          <select
            value={type}
            onChange={(event) => setType(event.target.value)}
          >
            <option value="">Todas</option>
            {Object.entries(benefitLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </section>
      {error && (
        <div className="benefits-error">
          <Notice text={error} error />
          <Button
            variant="secondary"
            onClick={() => setReloadVersion((value) => value + 1)}
          >
            Tentar novamente
          </Button>
        </div>
      )}
      {loading && !cycleRows.length ? (
        <LoadingSkeleton variant="table" label="Carregando competências…" />
      ) : (
        <RefreshingContent refreshing={loading}>
          <section
            className="competency-unit-grid"
            aria-label="Competências por unidade"
          >
            {unitCards.length ? (
              unitCards.map((unitCard) => (
                <article
                  className="panel competency-unit-card"
                  key={unitCard.unidadeId}
                >
                  <header>
                    <div>
                      <h2>{unitCard.unidade}</h2>
                      <p>
                        {new Intl.DateTimeFormat("pt-BR", {
                          month: "long",
                          year: "numeric",
                          timeZone: "UTC",
                        }).format(new Date(`${competence}T00:00:00Z`))}
                      </p>
                    </div>
                  </header>
                  <div className="competency-category-grid">
                    {unitCard.categories.map((category) => {
                      const values = categoryValues(category.rows);
                      return (
                        <button
                          className="competency-category-card"
                          key={category.tipo}
                          onClick={() => {
                            setMode("summary");
                            setDetail(null);
                            setDetailKey({
                              unidadeId: category.unidadeId,
                              tipo: category.tipo,
                            });
                          }}
                        >
                          <span className="competency-category-title">
                            <strong>
                              {benefitLabels[category.tipo] ?? category.tipo}
                            </strong>
                            <StatusBadge value={values.state} />
                          </span>
                          <dl>
                            <div>
                              <dt>Pessoas previstas</dt>
                              <dd>{values.predicted || "—"}</dd>
                            </div>
                            <div>
                              <dt>Previsto</dt>
                              <dd>
                                {values.predicted
                                  ? money(values.forecast)
                                  : "—"}
                              </dd>
                            </div>
                            <div>
                              <dt>Solicitado</dt>
                              <dd>{money(values.requested)}</dd>
                            </div>
                            <div>
                              <dt>Concluído</dt>
                              <dd>{money(values.concluded)}</dd>
                            </div>
                            <div>
                              <dt>Pendente</dt>
                              <dd>{money(values.pending)}</dd>
                            </div>
                          </dl>
                          {[...values.occurrences, ...values.impediments]
                            .length > 0 && (
                            <small>
                              {[...values.occurrences, ...values.impediments]
                                .map((item) => occurrenceLabels[item] ?? item)
                                .join(" · ")}
                            </small>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </article>
              ))
            ) : (
              <EmptyState
                title={
                  unit || type
                    ? "Nenhuma competência encontrada"
                    : "Competência sem movimentação"
                }
                description="Não há previsão ou pedido para os filtros selecionados."
              />
            )}
          </section>
        </RefreshingContent>
      )}
      <Dialog
        open={Boolean(detailKey)}
        onOpenChange={(open) => {
          if (!open) {
            setDetailKey(null);
            setDetail(null);
            setMode("summary");
          }
        }}
        title={
          detailKey
            ? `${benefitLabels[detailKey.tipo] ?? detailKey.tipo} — competência`
            : "Competência"
        }
        description="Previsão, pedidos e movimentações preservados no ciclo mensal."
        size="lg"
      >
        {detailLoading && !detail ? (
          <LoadingSkeleton variant="detail" />
        ) : (
          detail && (
            <div className="competency-detail-modal">
              {mode !== "summary" && (
                <Button variant="ghost" onClick={() => setMode("summary")}>
                  ← Voltar
                </Button>
              )}
              {mode === "summary" && (
                <>
                  <div className="benefit-summary-metrics">
                    {(() => {
                      const matching = cycleRows.filter(
                        (row) =>
                          row.unidadeId === detailKey?.unidadeId &&
                          row.tipo === detailKey?.tipo,
                      );
                      const values = categoryValues(matching);
                      return (
                        <>
                          <MetricCard
                            label="Previsto"
                            value={
                              detail.possuiPrevisao
                                ? money(values.forecast)
                                : "—"
                            }
                            supportingText={
                              detail.possuiPrevisao
                                ? `${values.predicted} pessoa(s)`
                                : "Sem previsão"
                            }
                          />
                          <MetricCard
                            label="Solicitado"
                            value={money(values.requested)}
                          />
                          <MetricCard
                            label="Concluído"
                            value={money(values.concluded)}
                          />
                          <MetricCard
                            label="Pendente"
                            value={money(values.pending)}
                          />
                        </>
                      );
                    })()}
                  </div>
                  {detail.previsao && (
                    <section>
                      <h3>Composição prevista</h3>
                      <ul className="benefit-detail-list">
                        {detail.previsao.itens.map((item) => (
                          <li key={String(item.id)}>
                            <span>
                              <strong>{display(item.pessoaNome)}</strong>
                              <small>
                                {item.incluido
                                  ? display(item.fornecedor)
                                  : (occurrenceLabels[
                                      String(item.motivoExclusao)
                                    ] ?? display(item.motivoExclusao))}
                              </small>
                            </span>
                            <span>
                              {item.incluido
                                ? money(item.valorPrevisto)
                                : "Excluído"}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <section>
                    <h3>Pedidos em andamento</h3>
                    {detail.pedidos
                      .filter((order) => order.status !== "CANCELADA")
                      .map((order) => (
                        <article
                          className="benefit-order-card"
                          key={String(order.id)}
                        >
                          <header>
                            <div>
                              <strong>{display(order.fornecedor)}</strong>
                              <StatusBadge value={order.status} />
                            </div>
                            <small>
                              {((order.itens as Row[]) ?? []).length} item(ns)
                            </small>
                          </header>
                          <ul className="benefit-detail-list">
                            {((order.itens as Row[]) ?? []).map((item) => (
                              <li key={String(item.id)}>
                                <span>
                                  <strong>{display(item.pessoaNome)}</strong>
                                  <small>
                                    <StatusBadge value={item.status} />
                                  </small>
                                </span>
                                <span>{money(item.valorSolicitado)}</span>
                              </li>
                            ))}
                          </ul>
                          <div className="form-actions">
                            {order.status === "PENDENTE" && (
                              <>
                                <Button onClick={() => openConfirmation(order)}>
                                  Confirmar compra
                                </Button>
                                <Button
                                  variant="danger"
                                  disabled={working}
                                  onClick={() => void cancel(order)}
                                >
                                  Cancelar pedido
                                </Button>
                              </>
                            )}
                            {order.status === "CONFIRMADA" && (
                              <Button
                                variant="secondary"
                                onClick={() => {
                                  const first = ((order.itens as Row[]) ??
                                    [])[0];
                                  setSelectedOrder(order);
                                  setReversal({
                                    itemId: String(first?.id ?? ""),
                                    valor: "",
                                    motivo: "",
                                  });
                                  setMode("reverse");
                                }}
                              >
                                Reverter confirmação
                              </Button>
                            )}
                          </div>
                        </article>
                      ))}
                  </section>
                  {detail.pedidos.some(
                    (order) => order.status === "CANCELADA",
                  ) && (
                    <section>
                      <h3>Histórico cancelado</h3>
                      {detail.pedidos
                        .filter((order) => order.status === "CANCELADA")
                        .map((order) => (
                          <article
                            className="benefit-order-card is-cancelled"
                            key={String(order.id)}
                          >
                            <strong>{display(order.fornecedor)}</strong>
                            <StatusBadge value="CANCELADA" />
                            <ul className="benefit-detail-list">
                              {((order.itens as Row[]) ?? []).map((item) => (
                                <li key={String(item.id)}>
                                  <span>{display(item.pessoaNome)}</span>
                                  <span>{money(item.valorSolicitado)}</span>
                                </li>
                              ))}
                            </ul>
                          </article>
                        ))}
                    </section>
                  )}
                </>
              )}
              {mode === "confirm" && selectedOrder && (
                <section>
                  <h3>Confirmar compra</h3>
                  <div className="form-grid">
                    <label>
                      <span>Data da compra</span>
                      <input
                        type="date"
                        value={purchaseDate}
                        onChange={(event) =>
                          setPurchaseDate(event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>Referência externa</span>
                      <input
                        value={externalReference}
                        onChange={(event) =>
                          setExternalReference(event.target.value)
                        }
                      />
                    </label>
                    {((selectedOrder.itens as Row[]) ?? [])
                      .filter((item) => item.status === "PENDENTE")
                      .map((item) => {
                        const current = confirmationItems[String(item.id)];
                        return (
                          <fieldset key={String(item.id)}>
                            <legend>{display(item.pessoaNome)}</legend>
                            <label>
                              <span>Resultado</span>
                              <select
                                value={current?.status ?? "CONFIRMADO"}
                                onChange={(event) =>
                                  setConfirmationItems((all) => ({
                                    ...all,
                                    [String(item.id)]: {
                                      ...(all[String(item.id)] ?? {
                                        valor: String(item.valorReservado),
                                        motivo: "",
                                      }),
                                      status: event.target.value as
                                        | "CONFIRMADO"
                                        | "REJEITADO",
                                    },
                                  }))
                                }
                              >
                                <option value="CONFIRMADO">Confirmado</option>
                                <option value="REJEITADO">Rejeitado</option>
                              </select>
                            </label>
                            <label>
                              <span>Valor comprado</span>
                              <CurrencyInput
                                disabled={current?.status === "REJEITADO"}
                                value={current?.valor ?? ""}
                                ariaLabel={`Valor comprado de ${display(item.pessoaNome)}`}
                                onValueChange={(value) =>
                                  setConfirmationItems((all) => ({
                                    ...all,
                                    [String(item.id)]: {
                                      ...(all[String(item.id)] ?? {
                                        status: "CONFIRMADO",
                                        motivo: "",
                                      }),
                                      valor: value,
                                    },
                                  }))
                                }
                              />
                            </label>
                            <label>
                              <span>Motivo da diferença ou rejeição</span>
                              <input
                                value={current?.motivo ?? ""}
                                onChange={(event) =>
                                  setConfirmationItems((all) => ({
                                    ...all,
                                    [String(item.id)]: {
                                      ...(all[String(item.id)] ?? {
                                        status: "CONFIRMADO",
                                        valor: String(item.valorReservado),
                                      }),
                                      motivo: event.target.value,
                                    },
                                  }))
                                }
                              />
                            </label>
                          </fieldset>
                        );
                      })}
                  </div>
                  <Button loading={working} onClick={() => void confirm()}>
                    Registrar confirmação
                  </Button>
                </section>
              )}
              {mode === "reverse" && selectedOrder && (
                <section>
                  <h3>Reverter confirmação</h3>
                  <div className="form-grid">
                    <label>
                      <span>Colaborador</span>
                      <select
                        value={reversal.itemId}
                        onChange={(event) =>
                          setReversal((current) => ({
                            ...current,
                            itemId: event.target.value,
                          }))
                        }
                      >
                        {((selectedOrder.itens as Row[]) ?? []).map((item) => (
                          <option key={String(item.id)} value={String(item.id)}>
                            {display(item.pessoaNome)}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Data</span>
                      <input
                        type="date"
                        value={purchaseDate}
                        onChange={(event) =>
                          setPurchaseDate(event.target.value)
                        }
                      />
                    </label>
                    <label>
                      <span>Valor</span>
                      <CurrencyInput
                        value={reversal.valor}
                        ariaLabel="Valor a reverter"
                        onValueChange={(value) =>
                          setReversal((current) => ({
                            ...current,
                            valor: value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      <span>Motivo</span>
                      <input
                        value={reversal.motivo}
                        onChange={(event) =>
                          setReversal((current) => ({
                            ...current,
                            motivo: event.target.value,
                          }))
                        }
                      />
                    </label>
                  </div>
                  <Button
                    loading={working}
                    disabled={!reversal.valor || !reversal.motivo}
                    onClick={() => void reverse()}
                  >
                    Registrar reversão
                  </Button>
                </section>
              )}
            </div>
          )
        )}
      </Dialog>
    </div>
  );
}
