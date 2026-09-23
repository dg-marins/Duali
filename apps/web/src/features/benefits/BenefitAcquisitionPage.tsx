import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, display, type Row } from "../../api";
import { Notice } from "../../components";
import { Button } from "../../components/ui/button";
import {
  FormDialog,
  CurrencyInput,
  LoadingSkeleton,
  PageHeader,
  RefreshingContent,
} from "../../ui";

const money = (value: unknown) =>
  value === null || value === undefined || value === ""
    ? "Não informado"
    : new Intl.NumberFormat("pt-BR", {
        style: "currency",
        currency: "BRL",
      }).format(Number(value));
const labels: Record<string, string> = {
  ALIMENTACAO: "Alimentação",
  TRANSPORTE: "Transporte",
  CESTA_BASICA: "Cesta básica",
  PREMIACAO: "Premiação",
  OUTRO: "Outro",
  PENDENTE: "Pendente",
  CONFIRMADA: "Confirmada",
  CANCELADA: "Cancelada",
};

export function BenefitAcquisitionPage({
  navigate,
}: {
  navigate: (path: string) => void;
}) {
  const [units, setUnits] = useState<Row[]>([]),
    [unit, setUnit] = useState(
      () => new URLSearchParams(window.location.search).get("unidadeId") ?? "",
    ),
    [month, setMonth] = useState(() =>
      (
        new URLSearchParams(window.location.search).get("competencia") ??
        new Date().toISOString().slice(0, 7)
      ).slice(0, 7),
    ),
    [type, setType] = useState(
      () => new URLSearchParams(window.location.search).get("tipo") ?? "",
    ),
    [rows, setRows] = useState<Row[]>([]),
    [orders, setOrders] = useState<Row[]>([]),
    [cycleRows, setCycleRows] = useState<Row[]>([]),
    [loading, setLoading] = useState(true),
    [working, setWorking] = useState(false),
    [error, setError] = useState(""),
    [confirming, setConfirming] = useState<Row | null>(null),
    [confirmationItems, setConfirmationItems] = useState<
      Record<
        string,
        { valor: string; status: "CONFIRMADO" | "REJEITADO"; motivo: string }
      >
    >({}),
    [reversing, setReversing] = useState<Row | null>(null),
    [reversal, setReversal] = useState({ itemId: "", valor: "", motivo: "" }),
    [detail, setDetail] = useState<{ unidadeId: string; tipo: string } | null>(
      null,
    );
  const competencia = `${month}-01`;
  const monthLabel = new Intl.DateTimeFormat("pt-BR", {
    month: "long",
    year: "numeric",
  }).format(new Date(`${month}-01T12:00:00`));
  const visibleRows = useMemo(
    () => rows.filter((row) => !type || row.beneficio === type),
    [rows, type],
  );
  const visibleOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          (!type || order.tipo === type) &&
          (!unit || String(order.unidadeId) === unit),
      ),
    [orders, type, unit],
  );
  async function load() {
    const selectedUnits = unit
      ? units.filter((item) => String(item.id) === unit)
      : units;
    if (!selectedUnits.length) return;
    setLoading(true);
    try {
      const cycleParams = new URLSearchParams({ competencia });
      if (unit) cycleParams.set("unidadeId", unit);
      const [previews, acquired, cycle] = await Promise.all([
        Promise.all(
          selectedUnits.map(async (item) => ({
            unidade: item,
            itens: await api<Row[]>(
              `aquisicoes-beneficios/previa?unidadeId=${item.id}&competencia=${competencia}`,
            ),
          })),
        ),
        api<Row[]>(`aquisicoes-beneficios?competencia=${competencia}`),
        api<{ itens: Row[] }>(`beneficios/ciclo-mensal?${cycleParams}`),
      ]);
      setRows(
        previews.flatMap(({ unidade, itens }) =>
          itens.map((item) => ({
            ...item,
            unidadeId: String(unidade.id),
            unidade,
          })),
        ),
      );
      setOrders(acquired);
      setCycleRows(cycle.itens);
      setError("");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void (async () => {
      const first = await api<{ items: Row[]; total: number }>(
        "unidades?pageSize=100&page=1",
      );
      const pages = Math.ceil(first.total / 100);
      const rest = await Promise.all(
        Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
          api<{ items: Row[] }>(`unidades?pageSize=100&page=${index + 2}`),
        ),
      );
      const all = [...first.items, ...rest.flatMap((page) => page.items)];
      setUnits(all);
    })().catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => {
    const query = new URLSearchParams({ competencia });
    if (unit) query.set("unidadeId", unit);
    if (type) query.set("tipo", type);
    history.replaceState({}, "", `${location.pathname}?${query.toString()}`);
    void load();
  }, [unit, month, type, units]);
  const categoryCards = useMemo(() => {
    const groups = new Map<
      string,
      {
        unidadeId: string;
        unidade: Row;
        tipo: string;
        rows: Row[];
        orders: Row[];
        cycles: Row[];
      }
    >();
    for (const row of visibleRows) {
      const key = `${row.unidadeId}:${row.beneficio}`;
      const group = groups.get(key) ?? {
        unidadeId: String(row.unidadeId),
        unidade: row.unidade as Row,
        tipo: String(row.beneficio),
        rows: [],
        orders: [],
        cycles: [],
      };
      group.rows.push(row);
      groups.set(key, group);
    }
    for (const order of visibleOrders) {
      const key = `${order.unidadeId}:${order.tipo}`;
      const group = groups.get(key) ?? {
        unidadeId: String(order.unidadeId),
        unidade:
          units.find((item) => String(item.id) === String(order.unidadeId)) ??
          ({ nome: "Unidade não identificada" } as Row),
        tipo: String(order.tipo),
        rows: [],
        orders: [],
        cycles: [],
      };
      group.orders.push(order);
      groups.set(key, group);
    }
    for (const cycle of cycleRows.filter((row) => !type || row.tipo === type)) {
      const key = `${cycle.unidadeId}:${cycle.tipo}`;
      const group = groups.get(key) ?? {
        unidadeId: String(cycle.unidadeId),
        unidade:
          units.find((item) => String(item.id) === String(cycle.unidadeId)) ??
          ({ nome: String(cycle.unidade) } as Row),
        tipo: String(cycle.tipo),
        rows: [],
        orders: [],
        cycles: [],
      };
      group.cycles.push(cycle);
      groups.set(key, group);
    }
    return [...groups.values()].sort(
      (a, b) =>
        display(a.unidade).localeCompare(display(b.unidade), "pt-BR") ||
        (labels[a.tipo] ?? a.tipo).localeCompare(
          labels[b.tipo] ?? b.tipo,
          "pt-BR",
        ),
    );
  }, [visibleRows, visibleOrders, cycleRows, type, units]);
  const detailRows = detail
    ? visibleRows.filter(
        (row) =>
          String(row.unidadeId) === detail.unidadeId &&
          row.beneficio === detail.tipo,
      )
    : [];
  const detailOrders = detail
    ? visibleOrders.filter(
        (order) =>
          String(order.unidadeId) === detail.unidadeId &&
          order.tipo === detail.tipo,
      )
    : [];
  const detailCycles = detail
    ? cycleRows.filter(
        (row) =>
          String(row.unidadeId) === detail.unidadeId &&
          row.tipo === detail.tipo,
      )
    : [];
  const unitCards = useMemo(
    () =>
      categoryCards.reduce<
        Array<{
          unidadeId: string;
          unidade: Row;
          categorias: typeof categoryCards;
        }>
      >((all, category) => {
        const current = all.find(
          (item) => item.unidadeId === category.unidadeId,
        );
        if (current) current.categorias.push(category);
        else
          all.push({
            unidadeId: category.unidadeId,
            unidade: category.unidade,
            categorias: [category],
          });
        return all;
      }, []),
    [categoryCards],
  );
  function openConfirmation(order: Row) {
    const initial = Object.fromEntries(
      (order.itens as Row[])
        .filter((item) => item.status === "PENDENTE")
        .map((item) => [
          String(item.id),
          {
            valor: String(item.valorReservado),
            status: "CONFIRMADO" as const,
            motivo: "",
          },
        ]),
    );
    setConfirmationItems(initial);
    setConfirming(order);
  }
  async function confirm() {
    if (!confirming) return;
    setWorking(true);
    try {
      await api(
        `aquisicoes-beneficios/${confirming.id}/confirmar`,
        "POST",
        {
          dataCompra: new Date().toISOString().slice(0, 10),
          itens: Object.entries(confirmationItems).map(([itemId, item]) => ({
            itemId,
            valor: item.valor,
            status: item.status,
            ...(item.motivo ? { motivo: item.motivo } : {}),
          })),
        },
        { idempotencyKey: crypto.randomUUID() },
      );
      toast.success("Compra confirmada por colaborador.");
      setConfirming(null);
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setWorking(false);
    }
  }
  async function reverse() {
    if (!reversing || !reversal.itemId) return;
    setWorking(true);
    try {
      await api(
        `aquisicoes-beneficios/itens/${reversal.itemId}/reverter`,
        "POST",
        {
          valor: reversal.valor,
          data: new Date().toISOString().slice(0, 10),
          motivo: reversal.motivo,
        },
        { idempotencyKey: crypto.randomUUID() },
      );
      toast.success("Reversão registrada.");
      setReversing(null);
      await load();
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
        {
          idempotencyKey: crypto.randomUUID(),
        },
      );
      toast.success("Pedido cancelado e valores liberados.");
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setWorking(false);
    }
  }
  return (
    <div className="page-stack">
      <PageHeader
        title="Competências"
        description="Acompanhe pedidos, confirmações, reversões e pendências do mês."
        action={
          <Button variant="outline" onClick={() => navigate("/app/beneficios")}>
            Voltar
          </Button>
        }
      />
      <Notice text={error} error />
      <section className="panel filter-panel competency-filters">
        <div className="filter-grid">
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
            <span>Competência</span>
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
          <label>
            <span>Categoria</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              <option value="">Todas</option>
              {[
                "ALIMENTACAO",
                "TRANSPORTE",
                "CESTA_BASICA",
                "PREMIACAO",
                "OUTRO",
              ].map((value) => (
                <option key={value} value={value}>
                  {labels[value]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>{" "}
      {loading && !visibleRows.length ? (
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
                  <header className="competency-unit-card-header">
                    <div>
                      <h2>{display(unitCard.unidade)}</h2>
                      <p className="muted">Competência: {monthLabel}</p>
                    </div>
                    <strong>
                      {money(
                        unitCard.categorias.reduce(
                          (total, category) =>
                            total +
                            category.cycles.reduce(
                              (sum, row) =>
                                sum + Number(row.valorPrevisto ?? 0),
                              0,
                            ),
                          0,
                        ),
                      )}
                    </strong>
                  </header>
                  <div className="competency-category-grid">
                    {unitCard.categorias.map((category) => {
                      const previsto = category.cycles.reduce(
                        (sum, row) => sum + Number(row.valorPrevisto ?? 0),
                        0,
                      );
                      const solicitado = category.cycles.reduce(
                        (sum, row) => sum + Number(row.valorSolicitado ?? 0),
                        0,
                      );
                      const concluido = category.cycles.reduce(
                        (sum, row) => sum + Number(row.valorConcluido ?? 0),
                        0,
                      );
                      const emPedido = category.cycles.reduce(
                        (sum, row) => sum + Number(row.saldoPendente ?? 0),
                        0,
                      );
                      const personIds = new Set(
                        category.cycles.flatMap((row) => {
                          const requested = Array.isArray(
                            row.vinculosSolicitados,
                          )
                            ? (row.vinculosSolicitados as string[])
                            : [];
                          const predicted = Array.isArray(row.vinculosPrevistos)
                            ? (row.vinculosPrevistos as string[])
                            : [];
                          return solicitado > 0 ? requested : predicted;
                        }),
                      );
                      const activeOrder = category.orders.find(
                        (order) => order.status !== "CANCELADA",
                      );
                      const situacao =
                        emPedido > 0
                          ? "Solicitado"
                          : solicitado > 0
                            ? "Concluído"
                            : previsto > 0
                              ? "Previsto"
                              : activeOrder
                                ? (labels[String(activeOrder.status)] ??
                                  display(activeOrder.status))
                                : category.orders.length
                                  ? "Cancelado"
                                  : "Não solicitado";
                      return (
                        <button
                          className="competency-category-card"
                          key={category.tipo}
                          onClick={() =>
                            setDetail({
                              unidadeId: category.unidadeId,
                              tipo: category.tipo,
                            })
                          }
                        >
                          <span>{labels[category.tipo] ?? category.tipo}</span>
                          <strong>{money(previsto)}</strong>
                          <small>
                            {personIds.size} pessoa(s) · {situacao}
                          </small>
                          <small>
                            Solicitado: {money(solicitado)} · Concluído:{" "}
                            {money(concluido)} · Pendente: {money(emPedido)}
                          </small>
                        </button>
                      );
                    })}
                  </div>
                </article>
              ))
            ) : (
              <section className="panel empty-state">
                <h2>Sem competências nesta seleção</h2>
                <p>Faça um pedido para criar os lançamentos da competência.</p>
              </section>
            )}
          </section>
        </RefreshingContent>
      )}
      <FormDialog
        open={Boolean(detail)}
        onOpenChange={(open) => !open && setDetail(null)}
        title={
          detail
            ? `${labels[detail.tipo] ?? detail.tipo} — competência`
            : "Competência"
        }
        description="Confira os lançamentos e os pedidos desta categoria antes de confirmar, cancelar ou reverter."
      >
        <div className="page-stack competency-detail-modal">
          {detailCycles.length > 0 && (
            <section className="competency-cycle-summary">
              <h3>Resumo do ciclo</h3>
              <div className="benefit-summary-metrics">
                <div className="metric-card">
                  <span>Previsto</span>
                  <strong>
                    {money(
                      detailCycles.reduce(
                        (sum, row) => sum + Number(row.valorPrevisto ?? 0),
                        0,
                      ),
                    )}
                  </strong>
                </div>
                <div className="metric-card">
                  <span>Solicitado</span>
                  <strong>
                    {money(
                      detailCycles.reduce(
                        (sum, row) => sum + Number(row.valorSolicitado ?? 0),
                        0,
                      ),
                    )}
                  </strong>
                </div>
                <div className="metric-card">
                  <span>Concluído</span>
                  <strong>
                    {money(
                      detailCycles.reduce(
                        (sum, row) => sum + Number(row.valorConcluido ?? 0),
                        0,
                      ),
                    )}
                  </strong>
                </div>
              </div>
            </section>
          )}
          <section>
            <h3>Lançamentos</h3>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Pessoa</th>
                    <th>Equipe</th>
                    <th>Fornecedor</th>
                    <th>Dias</th>
                    <th>Previsto</th>
                    <th>Comprado</th>
                    <th>Em pedido</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map((row) => (
                    <tr key={String(row.chave)}>
                      <td>{display(row.pessoa)}</td>
                      <td>{display(row.equipe)}</td>
                      <td>
                        {display((row.fornecedor as Row | undefined)?.nome)}
                      </td>
                      <td>{display(row.dias)}</td>
                      <td>{money(row.previsto)}</td>
                      <td>{money(row.compradoLiquido)}</td>
                      <td>{money(row.emPedido)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section>
            <h3>Pedidos</h3>
            {detailOrders.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fornecedor</th>
                      <th>Situação</th>
                      <th>Itens e valor original</th>
                      <th>Referência</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailOrders.map((order) => (
                      <tr key={String(order.id)}>
                        <td>{display(order.fornecedor)}</td>
                        <td>
                          {labels[String(order.status)] ??
                            display(order.status)}
                        </td>
                        <td>
                          <details>
                            <summary>
                              {Array.isArray(order.itens)
                                ? order.itens.length
                                : 0}{" "}
                              item(ns)
                            </summary>
                            <ul>
                              {((order.itens as Row[] | undefined) ?? []).map(
                                (item) => (
                                  <li key={String(item.id)}>
                                    {display(item.pessoaNome)} ·{" "}
                                    {money(
                                      item.valorSolicitado ??
                                        item.valorReservado,
                                    )}
                                  </li>
                                ),
                              )}
                            </ul>
                          </details>
                        </td>
                        <td>{display(order.referenciaExterna)}</td>
                        <td>
                          {order.status === "PENDENTE" && (
                            <div className="form-actions">
                              <button
                                disabled={working}
                                onClick={() => openConfirmation(order)}
                              >
                                Confirmar
                              </button>
                              <button
                                className="secondary"
                                disabled={working}
                                onClick={() => void cancel(order)}
                              >
                                Cancelar
                              </button>
                            </div>
                          )}
                          {order.status === "CONFIRMADA" && (
                            <button
                              className="secondary"
                              disabled={working}
                              onClick={() => {
                                const items = order.itens as Row[];
                                setReversal({
                                  itemId: String(items[0]?.id ?? ""),
                                  valor: "",
                                  motivo: "",
                                });
                                setReversing(order);
                              }}
                            >
                              Reverter crédito
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">
                Nenhum pedido emitido para esta categoria.
              </p>
            )}
          </section>
        </div>
      </FormDialog>
      <FormDialog
        open={Boolean(confirming)}
        onOpenChange={(open) => !open && setConfirming(null)}
        title="Confirmar aquisição"
        description="Informe o resultado por colaborador. Diferenças e rejeições exigem motivo."
      >
        <div className="form-grid">
          {(confirming?.itens as Row[] | undefined)
            ?.filter((item) => item.status === "PENDENTE")
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
                    <span>Motivo</span>
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
        <div className="form-actions">
          <button
            className="secondary"
            type="button"
            onClick={() => setConfirming(null)}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={working}
            onClick={() => void confirm()}
          >
            Confirmar aquisição
          </button>
        </div>
      </FormDialog>
      <FormDialog
        open={Boolean(reversing)}
        onOpenChange={(open) => !open && setReversing(null)}
        title="Reverter crédito"
        description="A reversão preserva a compra original e exige motivo."
      >
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
              {(reversing?.itens as Row[] | undefined)?.map((item) => (
                <option key={String(item.id)} value={String(item.id)}>
                  {display(item.pessoaNome)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Valor a reverter</span>
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
        <div className="form-actions">
          <button
            className="secondary"
            type="button"
            onClick={() => setReversing(null)}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={working || !reversal.valor || !reversal.motivo}
            onClick={() => void reverse()}
          >
            Registrar reversão
          </button>
        </div>
      </FormDialog>
    </div>
  );
}
