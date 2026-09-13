import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, display, type Row } from "../../api";
import { Notice } from "../../components";
import { Button } from "../../components/ui/button";
import { LoadingSkeleton, PageHeader, RefreshingContent } from "../../ui";

const types = [
  "ALIMENTACAO",
  "TRANSPORTE",
  "CESTA_BASICA",
  "PREMIACAO",
  "OUTRO",
];
const transportTypes = ["ONIBUS", "ONIBUS_INTER", "BARCA", "METRO"];
const monthToday = () => new Date().toISOString().slice(0, 7);

type BatchItem = {
  selected: boolean;
  valorDiario: string;
  quantidadeDias: string;
  quantidade: string;
  valorUnitario: string;
  transporteItens: Array<{
    tipoConducao: string;
    cartaoTransporteId: string;
    valorDiario: string;
  }>;
};

export function BenefitBatchPage({
  navigate,
}: {
  navigate: (path: string) => void;
}) {
  const [units, setUnits] = useState<Row[]>([]),
    [unitId, setUnitId] = useState(""),
    [type, setType] = useState("ALIMENTACAO"),
    [month, setMonth] = useState(monthToday()),
    [configs, setConfigs] = useState<Row[]>([]),
    [links, setLinks] = useState<Row[]>([]),
    [cards, setCards] = useState<Row[]>([]),
    [configId, setConfigId] = useState(""),
    [items, setItems] = useState<Record<string, BatchItem>>({}),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState("");

  useEffect(() => {
    void api<{ items: Row[]; total: number }>("unidades?pageSize=100&page=1")
      .then(async (first) => {
        const pages = Math.ceil(first.total / 100);
        const rest = await Promise.all(
          Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
            api<{ items: Row[] }>(`unidades?pageSize=100&page=${index + 2}`),
          ),
        );
        const all = [...first.items, ...rest.flatMap((page) => page.items)];
        setUnits(all);
        setUnitId((current) => current || String(all[0]?.id ?? ""));
      })
      .catch((reason) => setError((reason as Error).message))
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    if (!unitId) return;
    setLoading(true);
    void api<{ vinculos: Row[]; configuracoes: Row[]; cartoes: Row[] }>(
      `beneficios/lote/opcoes?unidadeId=${unitId}&tipo=${type}`,
    )
      .then((result) => {
        setLinks(result.vinculos);
        setConfigs(result.configuracoes);
        setCards(result.cartoes);
        setConfigId((current) =>
          result.configuracoes.some((config) => String(config.id) === current)
            ? current
            : String(result.configuracoes[0]?.id ?? ""),
        );
        setItems(
          Object.fromEntries(
            result.vinculos.map((link) => {
              const existing = (link.beneficios as Row[] | undefined)?.[0];
              return [
                String(link.id),
                {
                  selected: false,
                  valorDiario: String(existing?.valorDiario ?? ""),
                  quantidadeDias: "22",
                  quantidade: String(existing?.quantidadeRecorrente ?? "1"),
                  valorUnitario: String(
                    existing?.valorUnitarioRecorrente ?? "",
                  ),
                  transporteItens: [
                    {
                      tipoConducao: "ONIBUS",
                      cartaoTransporteId: String(result.cartoes[0]?.id ?? ""),
                      valorDiario: "",
                    },
                  ],
                },
              ];
            }),
          ),
        );
        setError("");
      })
      .catch((reason) => setError((reason as Error).message))
      .finally(() => setLoading(false));
  }, [unitId, type]);
  const selected = useMemo(
    () => links.filter((link) => items[String(link.id)]?.selected),
    [items, links],
  );
  const update = (id: string, patch: Partial<BatchItem>) =>
    setItems((all) => ({ ...all, [id]: { ...all[id]!, ...patch } }));
  const updateTransport = (
    id: string,
    index: number,
    patch: Record<string, string>,
  ) => {
    const current = items[id]!;
    update(id, {
      transporteItens: current.transporteItens.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    });
  };
  async function submit() {
    if (!selected.length || !configId) return;
    setSaving(true);
    setError("");
    try {
      await api("beneficios/lote", "POST", {
        unidadeId: unitId,
        tipo: type,
        competencia: `${month}-01`,
        configuracaoId: configId,
        itens: selected.map((link) => {
          const item = items[String(link.id)]!;
          return {
            vinculoId: link.id,
            ...(type === "ALIMENTACAO"
              ? {
                  valorDiario: Number(item.valorDiario),
                  quantidadeDias: Number(item.quantidadeDias),
                }
              : type === "TRANSPORTE"
                ? {
                    quantidadeDias: Number(item.quantidadeDias),
                    transporteItens: item.transporteItens.map((transport) => ({
                      ...transport,
                      valorDiario: Number(transport.valorDiario),
                    })),
                  }
                : {
                    quantidade: Number(item.quantidade),
                    valorUnitario: Number(item.valorUnitario),
                  }),
          };
        }),
      });
      toast.success(
        `${selected.length} benefício(s) cadastrados ou atualizados.`,
      );
      navigate("/app/beneficios/aquisicao");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <div className="page-stack">
      <PageHeader
        title="Cadastrar benefícios em lote"
        description="Defina adesões, valores e competência para colaboradores ativos da unidade."
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
            <span>Categoria</span>
            <select
              value={type}
              onChange={(event) => setType(event.target.value)}
            >
              {types.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Unidade</span>
            <select
              value={unitId}
              onChange={(event) => setUnitId(event.target.value)}
            >
              {units.map((unit) => (
                <option key={String(unit.id)} value={String(unit.id)}>
                  {display(unit)}
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
            <span>Fornecedor</span>
            <select
              value={configId}
              onChange={(event) => setConfigId(event.target.value)}
            >
              <option value="">Selecione…</option>
              {configs.map((config) => (
                <option key={String(config.id)} value={String(config.id)}>
                  {display(config.fornecedor)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>
      {loading ? (
        <LoadingSkeleton variant="table" label="Carregando colaboradores…" />
      ) : (
        <RefreshingContent refreshing={saving}>
          <section className="panel">
            <h2>Colaboradores ativos</h2>
            {!configs.length && (
              <Notice
                text="Não há fornecedor ativo configurado para esta unidade e categoria."
                error
              />
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th aria-label="Selecionar" />
                    <th>Pessoa</th>
                    <th>Equipe</th>
                    <th>Benefício atual</th>
                    {type === "ALIMENTACAO" || type === "TRANSPORTE" ? (
                      <>
                        <th>Dias</th>
                        <th>Valor diário</th>
                      </>
                    ) : (
                      <>
                        <th>Quantidade</th>
                        <th>Valor unitário</th>
                      </>
                    )}
                    {type === "TRANSPORTE" && <th>Conduções e cartões</th>}
                  </tr>
                </thead>
                <tbody>
                  {links.map((link) => {
                    const item = items[String(link.id)]!;
                    const existing = (
                      link.beneficios as Row[] | undefined
                    )?.[0];
                    return (
                      <tr key={String(link.id)}>
                        <td>
                          <input
                            type="checkbox"
                            aria-label={`Selecionar ${display(link.pessoa)}`}
                            checked={item?.selected ?? false}
                            onChange={(event) =>
                              update(String(link.id), {
                                selected: event.target.checked,
                              })
                            }
                          />
                        </td>
                        <td>{display(link.pessoa)}</td>
                        <td>{display(link.equipe)}</td>
                        <td>
                          {existing
                            ? `${display(existing.tipo)} · ${display((existing.configuracaoRecorrente as Row | undefined)?.fornecedor)}`
                            : "Novo"}
                        </td>
                        {(type === "ALIMENTACAO" || type === "TRANSPORTE") && (
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.quantidadeDias}
                              onChange={(event) =>
                                update(String(link.id), {
                                  quantidadeDias: event.target.value,
                                })
                              }
                            />
                          </td>
                        )}
                        {type === "ALIMENTACAO" && (
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.valorDiario}
                              onChange={(event) =>
                                update(String(link.id), {
                                  valorDiario: event.target.value,
                                })
                              }
                            />
                          </td>
                        )}
                        {type === "TRANSPORTE" && <td>Configurado ao lado</td>}
                        {!["ALIMENTACAO", "TRANSPORTE"].includes(type) && (
                          <>
                            <td>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.quantidade}
                                onChange={(event) =>
                                  update(String(link.id), {
                                    quantidade: event.target.value,
                                  })
                                }
                              />
                            </td>
                            <td>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.valorUnitario}
                                onChange={(event) =>
                                  update(String(link.id), {
                                    valorUnitario: event.target.value,
                                  })
                                }
                              />
                            </td>
                          </>
                        )}
                        {type === "TRANSPORTE" && (
                          <td>
                            {item.transporteItens.map((transport, index) => (
                              <div className="form-actions" key={index}>
                                <select
                                  value={transport.tipoConducao}
                                  onChange={(event) =>
                                    updateTransport(String(link.id), index, {
                                      tipoConducao: event.target.value,
                                    })
                                  }
                                >
                                  {transportTypes.map((option) => (
                                    <option key={option}>{option}</option>
                                  ))}
                                </select>
                                <select
                                  value={transport.cartaoTransporteId}
                                  onChange={(event) =>
                                    updateTransport(String(link.id), index, {
                                      cartaoTransporteId: event.target.value,
                                    })
                                  }
                                >
                                  {cards.map((card) => (
                                    <option
                                      key={String(card.id)}
                                      value={String(card.id)}
                                    >
                                      {display(card)}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  aria-label={`Valor diário ${index + 1} de ${display(link.pessoa)}`}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={transport.valorDiario}
                                  onChange={(event) =>
                                    updateTransport(String(link.id), index, {
                                      valorDiario: event.target.value,
                                    })
                                  }
                                />
                                <button
                                  type="button"
                                  className="secondary"
                                  onClick={() =>
                                    update(String(link.id), {
                                      transporteItens:
                                        item.transporteItens.filter(
                                          (_, itemIndex) => itemIndex !== index,
                                        ),
                                    })
                                  }
                                >
                                  Remover
                                </button>
                              </div>
                            ))}
                            <button
                              type="button"
                              className="secondary"
                              onClick={() =>
                                update(String(link.id), {
                                  transporteItens: [
                                    ...item.transporteItens,
                                    {
                                      tipoConducao: "ONIBUS",
                                      cartaoTransporteId: String(
                                        cards[0]?.id ?? "",
                                      ),
                                      valorDiario: "",
                                    },
                                  ],
                                })
                              }
                            >
                              + Transporte
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!links.length && <p>Nenhum vínculo ativo nesta unidade.</p>}
            <div className="form-actions">
              <Button
                disabled={saving || !selected.length || !configId}
                onClick={() => void submit()}
              >
                Cadastrar {selected.length} pessoa(s)
              </Button>
            </div>
          </section>
        </RefreshingContent>
      )}
    </div>
  );
}
