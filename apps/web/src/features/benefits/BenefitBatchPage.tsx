import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, display, type Row } from "../../api";
import { Notice } from "../../components";
import { Button } from "../../components/ui/button";
import {
  ConfirmDialog,
  CurrencyInput,
  LoadingSkeleton,
  money,
  PageHeader,
  RefreshingContent,
} from "../../ui";

const types = [
  "ALIMENTACAO",
  "TRANSPORTE",
  "CESTA_BASICA",
  "PREMIACAO",
  "OUTRO",
];
const transportTypes = ["ONIBUS", "ONIBUS_INTER", "BARCA", "METRO", "TREM"];
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
};
const monthToday = () => new Date().toISOString().slice(0, 7);
const decimalValue = (value: string) => {
  const cleaned = value.replace(/[^\d,.-]/g, "").trim();
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const result = Number(normalized);
  return Number.isFinite(result) ? result : 0;
};

type BatchItem = {
  selected: boolean;
  ambiguous: boolean;
  valorDiario: string;
  quantidadeDias: string;
  quantidade: string;
  valorUnitario: string;
  transporteItens: Array<{
    tipoConducao: string;
    fornecedorId: string;
    valorDiario: string;
  }>;
};

export function BenefitBatchPage({
  navigate,
}: {
  navigate: (path: string) => void;
}) {
  const initial = new URLSearchParams(location.search);
  const [units, setUnits] = useState<Row[]>([]),
    [unitId, setUnitId] = useState(initial.get("unidadeId") ?? ""),
    [type, setType] = useState(initial.get("categoria") ?? "ALIMENTACAO"),
    [month, setMonth] = useState(
      initial.get("competencia")?.slice(0, 7) ?? monthToday(),
    ),
    [configs, setConfigs] = useState<Row[]>([]),
    [links, setLinks] = useState<Row[]>([]),
    [configId, setConfigId] = useState(""),
    [items, setItems] = useState<Record<string, BatchItem>>({}),
    [loading, setLoading] = useState(true),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [search, setSearch] = useState(""),
    [team, setTeam] = useState(""),
    [dirty, setDirty] = useState(false),
    [review, setReview] = useState(false),
    [rowErrors, setRowErrors] = useState<Record<string, string>>({}),
    [pendingChange, setPendingChange] = useState<(() => void) | null>(null),
    [reloadKey, setReloadKey] = useState(0);
  const confirmContextChange = (change: () => void) => {
    if (dirty) setPendingChange(() => change);
    else change();
  };

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
    let active = true;
    setLoading(true);
    void api<{ vinculos: Row[]; configuracoes: Row[] }>(
      `beneficios/lote/opcoes?unidadeId=${unitId}&tipo=${type}&competencia=${month}-01`,
    )
      .then((result) => {
        if (!active) return;
        setLinks(result.vinculos);
        setConfigs(result.configuracoes);
        setConfigId((current) =>
          result.configuracoes.some((config) => String(config.id) === current)
            ? current
            : "",
        );
        setItems(
          Object.fromEntries(
            result.vinculos.map((link) => {
              const matching = (link.beneficios as Row[] | undefined) ?? [];
              const existing = matching.length === 1 ? matching[0] : undefined;
              return [
                String(link.id),
                {
                  selected: false,
                  ambiguous: matching.length > 1,
                  valorDiario: String(existing?.valorDiario ?? ""),
                  quantidadeDias:
                    type === "TRANSPORTE" && link.sugestaoDiasTransporte != null
                      ? String(link.sugestaoDiasTransporte)
                      : "",
                  quantidade: String(existing?.quantidadeRecorrente ?? "1"),
                  valorUnitario: String(
                    existing?.valorUnitarioRecorrente ?? "",
                  ),
                  transporteItens:
                    type === "TRANSPORTE" &&
                    Array.isArray(existing?.transporteItens) &&
                    existing.transporteItens.length
                      ? (existing.transporteItens as Row[]).map(
                          (transport) => ({
                            tipoConducao: String(transport.tipoConducao),
                            fornecedorId: String(transport.fornecedorId ?? ""),
                            valorDiario: String(transport.valorDiario ?? ""),
                          }),
                        )
                      : [],
                },
              ];
            }),
          ),
        );
        setError("");
        setDirty(false);
        setRowErrors({});
      })
      .catch((reason) => {
        if (active) setError((reason as Error).message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [unitId, type, month, reloadKey]);
  useEffect(() => {
    const protect = (event: BeforeUnloadEvent) => {
      if (!dirty) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", protect);
    return () => window.removeEventListener("beforeunload", protect);
  }, [dirty]);
  const selected = useMemo(
    () => links.filter((link) => items[String(link.id)]?.selected),
    [items, links],
  );
  const selectedTransportTotal = useMemo(
    () =>
      selected.reduce((total, link) => {
        const item = items[String(link.id)]!;
        const daily = item.transporteItens.reduce(
          (sum, transport) => sum + decimalValue(transport.valorDiario),
          0,
        );
        return total + daily * decimalValue(item.quantidadeDias);
      }, 0),
    [items, selected],
  );
  const teams = useMemo(
    () =>
      [
        ...new Set(
          links
            .map((link) => display(link.equipe))
            .filter((value) => value !== "—"),
        ),
      ].sort(),
    [links],
  );
  const visibleLinks = useMemo(
    () =>
      links.filter(
        (link) =>
          (!search ||
            display(link.pessoa)
              .toLocaleLowerCase("pt-BR")
              .includes(search.toLocaleLowerCase("pt-BR"))) &&
          (!team || display(link.equipe) === team),
      ),
    [links, search, team],
  );
  const update = (id: string, patch: Partial<BatchItem>) => (
    setDirty(true),
    setItems((all) => ({ ...all, [id]: { ...all[id]!, ...patch } }))
  );
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
    const errors: Record<string, string> = {};
    const referenceSupplierId = String(
      configs.find((config) => String(config.id) === configId)?.fornecedorId ??
        "",
    );
    for (const link of selected) {
      const item = items[String(link.id)]!;
      if (item.ambiguous) {
        errors[String(link.id)] =
          "Há mais de uma adesão vigente. Revise o benefício no perfil antes de incluí-lo no lote.";
        continue;
      }
      if (
        type === "ALIMENTACAO" &&
        (!item.valorDiario.trim() || !item.quantidadeDias.trim())
      )
        errors[String(link.id)] = "Informe valor diário e dias.";
      if (
        type === "TRANSPORTE" &&
        (!item.quantidadeDias.trim() ||
          !item.transporteItens.length ||
          item.transporteItens.some(
            (transport) =>
              !transport.fornecedorId || !transport.valorDiario.trim(),
          ) ||
          !item.transporteItens.some(
            (transport) => transport.fornecedorId === referenceSupplierId,
          ))
      )
        errors[String(link.id)] =
          "Informe dias, valor e fornecedor para cada condução, incluindo o fornecedor de referência.";
      if (
        !["ALIMENTACAO", "TRANSPORTE"].includes(type) &&
        (!item.quantidade.trim() || !item.valorUnitario.trim())
      )
        errors[String(link.id)] = "Informe quantidade e valor unitário.";
    }
    if (Object.keys(errors).length) {
      setRowErrors(errors);
      setError("Revise os campos obrigatórios destacados.");
      setReview(false);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await api(
        "beneficios/lote",
        "POST",
        {
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
                    valorDiario: item.valorDiario,
                    quantidadeDias: item.quantidadeDias,
                  }
                : type === "TRANSPORTE"
                  ? {
                      quantidadeDias: item.quantidadeDias,
                      transporteItens: item.transporteItens.map(
                        (transport) => ({
                          ...transport,
                          valorDiario: transport.valorDiario,
                        }),
                      ),
                    }
                  : {
                      quantidade: item.quantidade,
                      valorUnitario: item.valorUnitario,
                    }),
            };
          }),
        },
        { idempotencyKey: crypto.randomUUID() },
      );
      toast.success(
        `${selected.length} benefício(s) cadastrados ou atualizados.`,
      );
      setDirty(false);
      navigate(
        `/app/beneficios/aquisicao?unidadeId=${unitId}&competencia=${month}-01`,
      );
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
          <Button
            variant="outline"
            onClick={() =>
              confirmContextChange(() => navigate("/app/beneficios"))
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
            <span>Unidade</span>
            <select
              value={unitId}
              onChange={(event) => {
                const next = event.target.value;
                confirmContextChange(() => {
                  setConfigId("");
                  setUnitId(next);
                });
              }}
            >
              {units.map((unit) => (
                <option key={String(unit.id)} value={String(unit.id)}>
                  {display(unit)}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Categoria</span>
            <select
              value={type}
              onChange={(event) => {
                const next = event.target.value;
                confirmContextChange(() => {
                  setConfigId("");
                  setType(next);
                });
              }}
            >
              {types.map((option) => (
                <option key={option} value={option}>
                  {labels[option]}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>
              {type === "TRANSPORTE"
                ? "Fornecedor de referência"
                : "Fornecedor"}
            </span>
            <select
              value={configId}
              onChange={(event) => {
                const next = event.target.value;
                confirmContextChange(() => {
                  setConfigId(next);
                  setReloadKey((current) => current + 1);
                });
              }}
            >
              <option value="">Selecione…</option>
              {configs.map((config) => (
                <option key={String(config.id)} value={String(config.id)}>
                  {display(config.fornecedor)}
                </option>
              ))}
            </select>
            {type === "TRANSPORTE" && (
              <small>Cada condução pode usar outro fornecedor.</small>
            )}
          </label>
          <label>
            <span>Competência</span>
            <input
              type="month"
              value={month}
              onChange={(event) => {
                const next = event.target.value;
                confirmContextChange(() => setMonth(next));
              }}
            />
          </label>
        </div>
      </section>
      {loading ? (
        <LoadingSkeleton variant="table" label="Carregando colaboradores…" />
      ) : (
        <RefreshingContent refreshing={saving}>
          <section className="panel">
            <h2>Colaboradores ativos</h2>
            <p className="muted">
              Selecione pessoas, revise exceções por linha e confirme ao final.
            </p>
            {type === "TRANSPORTE" && selected.length > 1 && (
              <div className="form-actions">
                <button
                  type="button"
                  className="secondary"
                  onClick={() => {
                    const source = items[String(selected[0]!.id)]!;
                    if (!source.transporteItens.length) {
                      setError(
                        "Configure os transportes da primeira pessoa selecionada antes de aplicar o modelo.",
                      );
                      return;
                    }
                    setItems((all) => ({
                      ...all,
                      ...Object.fromEntries(
                        selected.slice(1).map((link) => [
                          String(link.id),
                          {
                            ...all[String(link.id)]!,
                            transporteItens: source.transporteItens.map(
                              (transport) => ({ ...transport }),
                            ),
                          },
                        ]),
                      ),
                    }));
                    setDirty(true);
                  }}
                >
                  Substituir selecionados pelo modelo da primeira pessoa
                </button>
                <small>
                  A ação é apenas um preenchimento inicial e pode ser revisada
                  por pessoa antes de salvar.
                </small>
              </div>
            )}
            {!configs.length && (
              <Notice
                text="Não há fornecedor ativo configurado para esta unidade e categoria."
                error
              />
            )}
            <div className="filter-grid compact-filter-grid">
              <label>
                <span>Buscar pessoa</span>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Nome do colaborador"
                />
              </label>
              <label>
                <span>Equipe</span>
                <select
                  value={team}
                  onChange={(event) => setTeam(event.target.value)}
                >
                  <option value="">Todas</option>
                  {teams.map((option) => (
                    <option key={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  aria-label="Selecionar resultados filtrados"
                  checked={
                    visibleLinks.length > 0 &&
                    visibleLinks.every(
                      (link) => items[String(link.id)]?.selected,
                    )
                  }
                  onChange={(event) => {
                    setDirty(true);
                    setItems((all) => ({
                      ...all,
                      ...Object.fromEntries(
                        visibleLinks.map((link) => [
                          String(link.id),
                          {
                            ...all[String(link.id)]!,
                            selected: event.target.checked,
                          },
                        ]),
                      ),
                    }));
                  }}
                />{" "}
                Selecionar resultados filtrados ({visibleLinks.length})
              </label>
            </div>
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
                        <th>
                          {type === "TRANSPORTE"
                            ? "Total diário"
                            : "Valor diário"}
                        </th>
                        {type === "TRANSPORTE" && <th>Total mensal</th>}
                      </>
                    ) : (
                      <>
                        <th>Quantidade</th>
                        <th>Valor unitário</th>
                      </>
                    )}
                    {type === "TRANSPORTE" && <th>Conduções e fornecedores</th>}
                  </tr>
                </thead>
                <tbody>
                  {visibleLinks.map((link) => {
                    const item = items[String(link.id)]!;
                    const existing = item.ambiguous
                      ? undefined
                      : (link.beneficios as Row[] | undefined)?.[0];
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
                          {item.ambiguous
                            ? "Mais de uma adesão vigente · revisão necessária"
                            : existing
                              ? type === "TRANSPORTE"
                                ? "Transporte configurado"
                                : `${labels[String(existing.tipo)] ?? display(existing.tipo)} · ${display((existing.configuracaoRecorrente as Row | undefined)?.fornecedor)}`
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
                            <CurrencyInput
                              value={item.valorDiario}
                              ariaLabel={`Valor diário de ${display(link.pessoa)}`}
                              onValueChange={(value) =>
                                update(String(link.id), {
                                  valorDiario: value,
                                })
                              }
                            />
                          </td>
                        )}
                        {type === "TRANSPORTE" && (
                          <>
                            <td>
                              {item.transporteItens
                                .reduce(
                                  (sum, transport) =>
                                    sum + decimalValue(transport.valorDiario),
                                  0,
                                )
                                .toLocaleString("pt-BR", {
                                  style: "currency",
                                  currency: "BRL",
                                })}
                            </td>
                            <td>
                              {(
                                item.transporteItens.reduce(
                                  (sum, transport) =>
                                    sum + decimalValue(transport.valorDiario),
                                  0,
                                ) * decimalValue(item.quantidadeDias)
                              ).toLocaleString("pt-BR", {
                                style: "currency",
                                currency: "BRL",
                              })}
                            </td>
                          </>
                        )}
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
                              <CurrencyInput
                                value={item.valorUnitario}
                                ariaLabel={`Valor unitário de ${display(link.pessoa)}`}
                                onValueChange={(value) =>
                                  update(String(link.id), {
                                    valorUnitario: value,
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
                                  aria-label={`Fornecedor ${index + 1} de ${display(link.pessoa)}`}
                                  value={transport.fornecedorId}
                                  onChange={(event) =>
                                    updateTransport(String(link.id), index, {
                                      fornecedorId: event.target.value,
                                    })
                                  }
                                >
                                  <option value="">Fornecedor…</option>
                                  {configs.map((config) => (
                                    <option
                                      key={String(config.fornecedorId)}
                                      value={String(config.fornecedorId)}
                                    >
                                      {display(config.fornecedor)}
                                    </option>
                                  ))}
                                </select>
                                <select
                                  value={transport.tipoConducao}
                                  onChange={(event) =>
                                    updateTransport(String(link.id), index, {
                                      tipoConducao: event.target.value,
                                    })
                                  }
                                >
                                  {transportTypes.map((option) => (
                                    <option key={option} value={option}>
                                      {labels[option]}
                                    </option>
                                  ))}
                                </select>
                                <CurrencyInput
                                  aria-label={`Valor diário ${index + 1} de ${display(link.pessoa)}`}
                                  value={transport.valorDiario}
                                  onValueChange={(value) =>
                                    updateTransport(String(link.id), index, {
                                      valorDiario: value,
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
                                      fornecedorId: String(
                                        configs.find(
                                          (config) =>
                                            String(config.id) === configId,
                                        )?.fornecedorId ?? "",
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
                        {rowErrors[String(link.id)] && (
                          <td className="field-error" role="alert">
                            {rowErrors[String(link.id)]}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {!links.length && <p>Nenhum vínculo ativo nesta unidade.</p>}
            <div className="benefit-batch-footer" aria-live="polite">
              <span>{selected.length} pessoa(s) selecionada(s)</span>
              <Button
                disabled={saving || !selected.length || !configId}
                onClick={() => setReview(true)}
              >
                Revisar cadastro
              </Button>
            </div>
          </section>
          {review && (
            <section className="panel review-panel">
              <h2>Revisar cadastro</h2>
              <p>
                {selected.length} adesão(ões) serão criadas ou atualizadas a
                partir de 01/{month}. O histórico anterior será preservado.
              </p>
              <p>
                {display(units.find((unit) => String(unit.id) === unitId))} ·{" "}
                {labels[type]} ·{" "}
                {display(
                  configs.find((config) => String(config.id) === configId)
                    ?.fornecedor,
                )}
              </p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Pessoa</th>
                      <th>Operação</th>
                      <th>Valores do mês</th>
                      <th>Impedimentos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selected.map((link) => {
                      const item = items[String(link.id)]!;
                      const existing =
                        (link.beneficios as Row[] | undefined) ?? [];
                      return (
                        <tr key={String(link.id)}>
                          <td>{display(link.pessoa)}</td>
                          <td>
                            {existing.length
                              ? "Atualizar adesão vigente"
                              : "Nova adesão"}
                          </td>
                          <td>
                            {type === "ALIMENTACAO"
                              ? `${item.quantidadeDias || "—"} dias · ${money(item.valorDiario)} por dia`
                              : type === "TRANSPORTE"
                                ? `${item.quantidadeDias || "—"} dias · ${item.transporteItens.map((transport) => `${labels[transport.tipoConducao] ?? transport.tipoConducao}: ${money(transport.valorDiario)} (${display(configs.find((config) => String(config.fornecedorId) === transport.fornecedorId)?.fornecedor)})`).join("; ") || "Sem conduções"}`
                                : `${item.quantidade || "—"} × ${money(item.valorUnitario)}`}
                          </td>
                          <td className="field-error">
                            {item.ambiguous
                              ? "Mais de uma adesão vigente; revise no perfil."
                              : (rowErrors[String(link.id)] ?? "—")}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {type === "TRANSPORTE" && (
                <p>
                  Estimativa mensal de transporte:{" "}
                  <strong>
                    {selectedTransportTotal.toLocaleString("pt-BR", {
                      style: "currency",
                      currency: "BRL",
                    })}
                  </strong>
                </p>
              )}
              <div className="form-actions">
                <Button variant="outline" onClick={() => setReview(false)}>
                  Continuar editando
                </Button>
                <Button disabled={saving} onClick={() => void submit()}>
                  Confirmar cadastro
                </Button>
              </div>
            </section>
          )}
        </RefreshingContent>
      )}
      <ConfirmDialog
        open={Boolean(pendingChange)}
        onOpenChange={(open) => {
          if (!open) setPendingChange(null);
        }}
        title="Descartar alterações do lote?"
        description="A seleção e os valores preenchidos serão perdidos."
        confirmLabel="Descartar e continuar"
        onConfirm={() => {
          setDirty(false);
          setReview(false);
          pendingChange?.();
          setPendingChange(null);
        }}
      />
    </div>
  );
}
