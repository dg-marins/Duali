import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, display, type Row } from "../../api";
import { Notice } from "../../components";
import { Button } from "../../components/ui/button";
import {
  FormSheet,
  LoadingSkeleton,
  PageHeader,
  RefreshingContent,
} from "../../ui";

const money = (value: unknown) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    Number(value ?? 0),
  );

export function BenefitAcquisitionPage({
  navigate,
}: {
  navigate: (path: string) => void;
}) {
  const [units, setUnits] = useState<Row[]>([]),
    [unit, setUnit] = useState(""),
    [month, setMonth] = useState(new Date().toISOString().slice(0, 7)),
    [daysTransport, setDaysTransport] = useState("22"),
    [daysFood, setDaysFood] = useState("22"),
    [rows, setRows] = useState<Row[]>([]),
    [orders, setOrders] = useState<Row[]>([]),
    [selected, setSelected] = useState<Set<string>>(() => new Set()),
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
    [reversal, setReversal] = useState({ itemId: "", valor: "", motivo: "" });
  const competencia = `${month}-01`;
  async function load() {
    if (!unit) return;
    setLoading(true);
    try {
      const [next, acquired] = await Promise.all([
        api<Row[]>(
          `aquisicoes-beneficios/previa?unidadeId=${unit}&competencia=${competencia}`,
        ),
        api<Row[]>(
          `aquisicoes-beneficios?unidadeId=${unit}&competencia=${competencia}`,
        ),
      ]);
      setRows(next);
      setOrders(acquired);
      setSelected(new Set());
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
      setUnit((current) => current || String(all[0]?.id ?? ""));
    })().catch((e) => setError((e as Error).message));
  }, []);
  useEffect(() => {
    void load();
  }, [unit, month]);
  async function prepare() {
    if (!unit) return;
    setWorking(true);
    try {
      const result = await api<{ criadas: number; pendencias: Row[] }>(
        "aquisicoes-beneficios/preparar",
        "POST",
        {
          unidadeId: unit,
          competencia,
          diasTransporte: Number(daysTransport),
          diasAlimentacao: Number(daysFood),
        },
      );
      toast.success(
        result.criadas
          ? `${result.criadas} competência(s) preparada(s).`
          : "Nenhuma competência nova precisava ser criada.",
      );
      if (result.pendencias.length)
        toast.warning(
          `${result.pendencias.length} benefício(s) precisam de configuração.`,
        );
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setWorking(false);
    }
  }
  const groups = useMemo(
    () =>
      Object.entries(
        rows
          .filter(
            (row) =>
              selected.has(String(row.chave)) && Number(row.disponivel) > 0,
          )
          .reduce<Record<string, Row[]>>((acc, row) => {
            const supplier = row.fornecedor as Row;
            const key = [
              row.beneficio,
              supplier.id,
              row.cartaoTransporteId ?? "",
            ].join(":");
            (acc[key] ??= []).push(row);
            return acc;
          }, {}),
      ).map(([key, items]) => ({
        items,
        cardId: String(items[0]?.cartaoTransporteId ?? "") || null,
        key,
      })),
    [rows, selected],
  );
  async function createOrders() {
    setWorking(true);
    try {
      for (const group of groups) {
        const first = group.items[0]!,
          supplier = first.fornecedor as Row;
        await api("aquisicoes-beneficios", "POST", {
          unidadeId: unit,
          competencia,
          tipo: String(first.beneficio),
          fornecedorId: supplier.id,
          ...(group.cardId ? { cartaoTransporteId: group.cardId } : {}),
          itens: group.items.map((row) => ({
            competenciaId: row.id,
            valor: row.disponivel,
          })),
        });
      }
      toast.success(`${groups.length} pedido(s) criado(s).`);
      await load();
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setWorking(false);
    }
  }
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
      await api(`aquisicoes-beneficios/${confirming.id}/confirmar`, "POST", {
        dataCompra: new Date().toISOString().slice(0, 10),
        itens: Object.entries(confirmationItems).map(([itemId, item]) => ({
          itemId,
          valor: Number(item.valor),
          status: item.status,
          ...(item.motivo ? { motivo: item.motivo } : {}),
        })),
      });
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
          valor: Number(reversal.valor),
          data: new Date().toISOString().slice(0, 10),
          motivo: reversal.motivo,
        },
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
      await api(`aquisicoes-beneficios/${order.id}/cancelar`, "POST", {});
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
        title="Aquisição mensal"
        description="Prepare, confira e registre os créditos comprados por colaborador."
        action={
          <Button variant="outline" onClick={() => navigate("/app/beneficios")}>
            Voltar
          </Button>
        }
      />
      <Notice text={error} error />
      <section className="panel filter-panel">
        <div className="filter-grid">
          <label>
            <span>Unidade</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
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
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
          <label>
            <span>Dias padrão de transporte</span>
            <input
              type="number"
              min="0"
              value={daysTransport}
              onChange={(e) => setDaysTransport(e.target.value)}
            />
          </label>
          <label>
            <span>Dias padrão de alimentação</span>
            <input
              type="number"
              min="0"
              value={daysFood}
              onChange={(e) => setDaysFood(e.target.value)}
            />
          </label>
        </div>
        <div className="form-actions">
          <Button disabled={working || !unit} onClick={() => void prepare()}>
            Preparar competência
          </Button>
          <Button
            variant="outline"
            disabled={working || !groups.length}
            onClick={() => void createOrders()}
          >
            Gerar {groups.length || ""} pedido(s)
          </Button>
        </div>
      </section>
      {loading && !rows.length ? (
        <LoadingSkeleton variant="table" label="Carregando aquisições…" />
      ) : (
        <RefreshingContent refreshing={loading}>
          <section className="panel">
            <h2>Conferência por colaborador</h2>
            <p className="muted">
              Selecione apenas valores disponíveis. Vínculos afastados exigem
              conferência manual dos dias.
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th aria-label="Selecionar" />
                    <th>Pessoa</th>
                    <th>Equipe</th>
                    <th>Benefício</th>
                    <th>Fornecedor</th>
                    <th>Dias</th>
                    <th>Previsto</th>
                    <th>Comprado</th>
                    <th>Em pedido</th>
                    <th>Disponível</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={String(row.chave)}>
                      <td>
                        <input
                          aria-label={`Selecionar ${String(row.pessoa)}`}
                          type="checkbox"
                          disabled={Number(row.disponivel) <= 0}
                          checked={selected.has(String(row.chave))}
                          onChange={() =>
                            setSelected((current) => {
                              const next = new Set(current);
                              if (next.has(String(row.chave)))
                                next.delete(String(row.chave));
                              else next.add(String(row.chave));
                              return next;
                            })
                          }
                        />
                      </td>
                      <td>
                        {display(row.pessoa)}
                        {Boolean(row.alerta) && (
                          <small className="warning-text">
                            {display(row.alerta)}
                          </small>
                        )}
                      </td>
                      <td>{display(row.equipe)}</td>
                      <td>{display(row.beneficio)}</td>
                      <td>{display((row.fornecedor as Row).nome)}</td>
                      <td>{display(row.dias)}</td>
                      <td>{money(row.previsto)}</td>
                      <td>{money(row.compradoLiquido)}</td>
                      <td>{money(row.emPedido)}</td>
                      <td>{money(row.disponivel)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="panel">
            <h2>Pedidos da competência</h2>
            {orders.length ? (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fornecedor</th>
                      <th>Benefício</th>
                      <th>Situação</th>
                      <th>Itens</th>
                      <th>Referência</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map((order) => (
                      <tr key={String(order.id)}>
                        <td>{display(order.fornecedor)}</td>
                        <td>{display(order.tipo)}</td>
                        <td>{display(order.status)}</td>
                        <td>
                          {Array.isArray(order.itens) ? order.itens.length : 0}
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
              <p>Nenhum pedido gerado para esta competência.</p>
            )}
          </section>
        </RefreshingContent>
      )}
      <FormSheet
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
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      disabled={current?.status === "REJEITADO"}
                      value={current?.valor ?? ""}
                      onChange={(event) =>
                        setConfirmationItems((all) => ({
                          ...all,
                          [String(item.id)]: {
                            ...(all[String(item.id)] ?? {
                              status: "CONFIRMADO",
                              motivo: "",
                            }),
                            valor: event.target.value,
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
      </FormSheet>
      <FormSheet
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
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={reversal.valor}
              onChange={(event) =>
                setReversal((current) => ({
                  ...current,
                  valor: event.target.value,
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
      </FormSheet>
    </div>
  );
}
