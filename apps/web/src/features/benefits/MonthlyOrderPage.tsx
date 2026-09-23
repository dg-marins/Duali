import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, display, type Row } from "../../api";
import { Notice } from "../../components";
import { Button } from "../../components/ui/button";
import { CurrencyInput, LoadingSkeleton, money, PageHeader } from "../../ui";

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
type Draft = Row & {
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
  transporteItens?: TransportItem[];
};

export function MonthlyOrderPage({
  navigate,
}: {
  navigate: (path: string) => void;
}) {
  const initial = new URLSearchParams(location.search);
  const [units, setUnits] = useState<Row[]>([]);
  const [unit, setUnit] = useState(initial.get("unidadeId") ?? "");
  const [month, setMonth] = useState(
    (initial.get("competencia") ?? new Date().toISOString().slice(0, 7)).slice(
      0,
      7,
    ),
  );
  const [type, setType] = useState(initial.get("tipo") ?? "ALIMENTACAO");
  const [rows, setRows] = useState<Draft[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const competence = `${month}-01`;

  useEffect(() => {
    void (async () => {
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
    })().catch((reason) => setError((reason as Error).message));
  }, []);
  useEffect(() => {
    if (!unit) return;
    let current = true;
    const params = new URLSearchParams({
      unidadeId: unit,
      competencia: competence,
      tipo: type,
    });
    history.replaceState(
      {},
      "",
      `/app/beneficios/aquisicao?${params.toString()}`,
    );
    setLoading(true);
    void api<Row[]>(`aquisicoes-beneficios/pedido/previa?${params}`)
      .then((response) => {
        if (!current) return;
        setRows(
          response.map((row) => ({
            ...row,
            vinculoId: String(row.vinculoId),
            configuracaoId: String(row.configuracaoId ?? ""),
            fornecedores:
              (row.fornecedores as SupplierOption[] | undefined) ?? [],
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
            transporteItens:
              (row.transporteItens as TransportItem[] | undefined) ?? [],
          })),
        );
        setError("");
      })
      .catch((reason) => {
        if (current) setError((reason as Error).message);
      })
      .finally(() => {
        if (current) setLoading(false);
      });
    return () => {
      current = false;
    };
  }, [unit, month, type]);

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
  const selected = rows.filter((row) => row.incluir);
  const update = (id: string, patch: Partial<Draft>) =>
    setRows((all) =>
      all.map((row) => (row.vinculoId === id ? { ...row, ...patch } : row)),
    );
  const updateTransportItem = (
    id: string,
    index: number,
    patch: Partial<TransportItem>,
  ) =>
    setRows((all) =>
      all.map((row) => {
        if (row.vinculoId !== id) return row;
        return {
          ...row,
          transporteItens: (row.transporteItens ?? []).map((item, itemIndex) =>
            itemIndex === index ? { ...item, ...patch } : item,
          ),
        };
      }),
    );
  const requestedTotal = (row: Draft) =>
    type === "TRANSPORTE"
      ? (
          (row.transporteItens ?? []).reduce(
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
        : (
            Number(row.quantidade || 0) * Number(row.valorUnitario || 0)
          ).toFixed(2);

  async function generate() {
    if (
      selected.some(
        (row) => row.vinculoStatus === "AFASTADO" && !row.motivoAfastado.trim(),
      )
    ) {
      setError(
        "Informe o motivo para cada vínculo afastado incluído no pedido.",
      );
      return;
    }
    if (
      selected.some(
        (row) =>
          (type === "TRANSPORTE"
            ? !(row.transporteItens ?? []).length ||
              row.transporteItens?.some(
                (item) =>
                  !item.tipoConducao || !item.fornecedorId || !item.valorDiario,
              )
            : !row.configuracaoId) || Number(requestedTotal(row) || 0) <= 0,
      )
    ) {
      setError(
        "Complete condução, fornecedor, valores e quantidades das pessoas selecionadas.",
      );
      return;
    }
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
            valorSolicitado: requestedTotal(row) || null,
            ...(type === "ALIMENTACAO"
              ? { modoAlimentacao: row.modoAlimentacao }
              : {}),
            motivoAfastado: row.motivoAfastado || undefined,
            transporteItens:
              type === "TRANSPORTE"
                ? row.transporteItens?.map((item) => ({
                    tipoConducao: item.tipoConducao,
                    fornecedorId: item.fornecedorId,
                    valorDiario: item.valorDiario,
                  }))
                : undefined,
          })),
        },
        { idempotencyKey: crypto.randomUUID() },
      );
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
  }

  return (
    <div className="page-stack monthly-order-page">
      <PageHeader
        title="Fazer pedido"
        description="Revise as sugestões deste mês e altere somente as exceções."
        action={
          <Button
            variant="outline"
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
      <Notice text={error} error />
      <section className="panel filter-panel">
        <div className="filter-grid">
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
              {units.map((item) => (
                <option key={String(item.id)} value={String(item.id)}>
                  {display(item)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Benefício</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              {Object.entries(labels)
                .filter(([key]) =>
                  [
                    "ALIMENTACAO",
                    "TRANSPORTE",
                    "CESTA_BASICA",
                    "PREMIACAO",
                    "OUTRO",
                  ].includes(key),
                )
                .map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
            </select>
          </label>
        </div>
      </section>
      {loading ? (
        <LoadingSkeleton variant="table" label="Carregando elegíveis…" />
      ) : (
        <>
          <section className="panel filter-panel">
            <div className="filter-grid">
              <label>
                <span>Buscar pessoa</span>
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </label>
            </div>
          </section>
          <section className="panel">
            <div className="monthly-order-heading">
              <div>
                <h2>{labels[type]}</h2>
                <p className="muted">
                  {selected.length} pessoa(s) serão incluídas. A retirada vale
                  somente para esta emissão.
                </p>
              </div>
              <strong>
                {money(
                  selected.reduce(
                    (sum, row) => sum + Number(requestedTotal(row) || 0),
                    0,
                  ),
                )}
              </strong>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Incluir</th>
                    <th>Pessoa</th>
                    <th>Fornecedor</th>
                    <th>Referência anterior</th>
                    <th>
                      {type === "ALIMENTACAO"
                        ? "Cálculo"
                        : type === "TRANSPORTE"
                          ? "Dias"
                          : "Quantidade"}
                    </th>
                    <th>
                      {type === "ALIMENTACAO"
                        ? "Dias / valor diário"
                        : type === "TRANSPORTE"
                          ? "Valor/dia"
                          : "Valor unitário"}
                    </th>
                    <th>Valor mensal</th>
                    <th>Total solicitado</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.vinculoId}>
                      <td>
                        <input
                          aria-label={`Incluir ${row.pessoa}`}
                          type="checkbox"
                          disabled={Boolean(row.impedimento)}
                          checked={row.incluir}
                          onChange={(event) =>
                            update(row.vinculoId, {
                              incluir: event.target.checked,
                            })
                          }
                        />
                      </td>
                      <td>
                        <strong>{String(row.pessoa)}</strong>
                        {type === "TRANSPORTE" && (
                          <details className="transport-composition">
                            <summary>Conduções e fornecedores</summary>
                            {row.transporteItens?.map((item, index) => (
                              <div
                                className="transport-composition-row"
                                key={`${item.fornecedorId}-${item.tipoConducao}-${index}`}
                              >
                                <select
                                  aria-label={`Condução de ${row.pessoa}`}
                                  value={item.tipoConducao}
                                  onChange={(event) =>
                                    updateTransportItem(row.vinculoId, index, {
                                      tipoConducao: event.target.value,
                                    })
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
                                </select>
                                <select
                                  aria-label={`Fornecedor de ${row.pessoa}`}
                                  value={item.fornecedorId}
                                  onChange={(event) =>
                                    updateTransportItem(row.vinculoId, index, {
                                      fornecedorId: event.target.value,
                                    })
                                  }
                                >
                                  <option value="">
                                    Selecione o fornecedor
                                  </option>
                                  {row.fornecedores.map((option) => (
                                    <option
                                      key={option.fornecedorId}
                                      value={option.fornecedorId}
                                    >
                                      {display(option.fornecedor)}
                                    </option>
                                  ))}
                                </select>
                                <CurrencyInput
                                  value={item.valorDiario}
                                  onValueChange={(value) =>
                                    updateTransportItem(row.vinculoId, index, {
                                      valorDiario: value,
                                    })
                                  }
                                  ariaLabel={`Valor diário de ${item.tipoConducao} para ${row.pessoa}`}
                                  placeholder="Informe o valor diário"
                                />
                                <Button
                                  variant="outline"
                                  onClick={() =>
                                    update(row.vinculoId, {
                                      transporteItens:
                                        row.transporteItens?.filter(
                                          (_, itemIndex) => itemIndex !== index,
                                        ) ?? [],
                                    })
                                  }
                                >
                                  Remover
                                </Button>
                              </div>
                            ))}
                            <Button
                              variant="outline"
                              onClick={() =>
                                update(row.vinculoId, {
                                  transporteItens: [
                                    ...(row.transporteItens ?? []),
                                    {
                                      tipoConducao: "",
                                      fornecedorId: "",
                                      valorDiario: "",
                                    },
                                  ],
                                })
                              }
                            >
                              Adicionar condução
                            </Button>
                          </details>
                        )}
                      </td>
                      <td>
                        {type === "TRANSPORTE" ? (
                          "Por condução"
                        ) : (
                          <select
                            aria-label={`Fornecedor de ${row.pessoa}`}
                            value={row.configuracaoId}
                            onChange={(event) =>
                              update(row.vinculoId, {
                                configuracaoId: event.target.value,
                              })
                            }
                          >
                            <option value="">Selecione</option>
                            {row.fornecedores.map((option) => (
                              <option
                                key={option.configuracaoId}
                                value={option.configuracaoId}
                              >
                                {display(option.fornecedor)}
                              </option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td>
                        <span className="monthly-order-reference">
                          {row.valorPrevisto !== null &&
                            row.valorPrevisto !== undefined && (
                              <strong>
                                Previsto: {money(row.valorPrevisto)}
                              </strong>
                            )}
                          <span>
                            {row.referenciaStatus === "NOVA_AQUISICAO"
                              ? "Nova aquisição"
                              : row.referenciaStatus === "SEM_REFERENCIA"
                                ? "Sem referência no mês anterior"
                                : `Mês anterior: ${money(row.referenciaAnterior)}`}
                          </span>
                        </span>
                      </td>
                      <td>
                        {type === "ALIMENTACAO" ? (
                          <select
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
                            <option value="DIAS_TRABALHADOS">
                              Dias trabalhados
                            </option>
                            <option value="VALOR_MENSAL">Valor mensal</option>
                          </select>
                        ) : type === "TRANSPORTE" ? (
                          <input
                            aria-label={`Dias de ${row.pessoa}`}
                            type="number"
                            min="0"
                            value={row.quantidadeDias}
                            onChange={(event) =>
                              update(row.vinculoId, {
                                quantidadeDias: event.target.value,
                              })
                            }
                          />
                        ) : (
                          <input
                            aria-label={`Quantidade de ${row.pessoa}`}
                            type="number"
                            min="0"
                            value={row.quantidade}
                            onChange={(event) =>
                              update(row.vinculoId, {
                                quantidade: event.target.value,
                              })
                            }
                          />
                        )}
                      </td>
                      <td>
                        {type === "ALIMENTACAO" ? (
                          row.modoAlimentacao === "DIAS_TRABALHADOS" ? (
                            <div className="monthly-food-daily-fields">
                              <input
                                aria-label={`Dias de ${row.pessoa}`}
                                type="number"
                                min="0"
                                value={row.quantidadeDias}
                                onChange={(event) =>
                                  update(row.vinculoId, {
                                    quantidadeDias: event.target.value,
                                  })
                                }
                              />
                              <CurrencyInput
                                value={row.valorUnitario}
                                onValueChange={(value) =>
                                  update(row.vinculoId, {
                                    valorUnitario: value,
                                  })
                                }
                                ariaLabel={`Valor diário de ${row.pessoa}`}
                              />
                            </div>
                          ) : (
                            "—"
                          )
                        ) : type === "TRANSPORTE" ? (
                          "Por condução"
                        ) : (
                          <CurrencyInput
                            value={row.valorUnitario}
                            onValueChange={(value) =>
                              update(row.vinculoId, {
                                valorUnitario: value,
                              })
                            }
                            ariaLabel={`Valor diário de ${row.pessoa}`}
                          />
                        )}
                      </td>
                      <td>
                        {type === "ALIMENTACAO" ? (
                          row.modoAlimentacao === "VALOR_MENSAL" ? (
                            <CurrencyInput
                              value={row.valorMensalBase}
                              onValueChange={(value) =>
                                update(row.vinculoId, {
                                  valorMensalBase: value,
                                })
                              }
                              ariaLabel={`Valor mensal de ${row.pessoa}`}
                            />
                          ) : (
                            "—"
                          )
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {type === "ALIMENTACAO" || type === "TRANSPORTE" ? (
                          <strong>{money(requestedTotal(row))}</strong>
                        ) : (
                          <CurrencyInput
                            value={row.valorSolicitado}
                            onValueChange={(value) =>
                              update(row.vinculoId, {
                                valorSolicitado: value,
                              })
                            }
                            ariaLabel={`Total solicitado de ${row.pessoa}`}
                          />
                        )}
                      </td>
                      <td>
                        {row.impedimento ? (
                          String(row.impedimento)
                        ) : row.vinculoStatus === "AFASTADO" ? (
                          <label>
                            <span>Afastado</span>
                            <input
                              placeholder="Motivo da inclusão"
                              value={row.motivoAfastado}
                              onChange={(event) =>
                                update(row.vinculoId, {
                                  motivoAfastado: event.target.value,
                                })
                              }
                            />
                          </label>
                        ) : (
                          "Elegível"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="form-actions">
              <Button
                disabled={!selected.length || saving}
                onClick={() => void generate()}
              >
                {saving ? "Gerando…" : "Gerar pedido"}
              </Button>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
