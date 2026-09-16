import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { api, display, type Row } from "../../api";
import { Notice } from "../../components";
import { Button } from "../../components/ui/button";
import {
  CurrencyInput,
  LoadingSkeleton,
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
const transportTypes = ["ONIBUS", "ONIBUS_INTER", "BARCA", "METRO"];
const labels: Record<string, string> = {
  ALIMENTACAO: "Alimentação",
  TRANSPORTE: "Transporte",
  CESTA_BASICA: "Cesta básica",
  PREMIACAO: "Premiação",
  OUTRO: "Outro",
  ONIBUS: "Ônibus",
  ONIBUS_INTER: "Ônibus intermunicipal",
  BARCA: "Barca",
  METRO: "Metrô",
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
  const [units, setUnits] = useState<Row[]>([]),
    [unitId, setUnitId] = useState(""),
    [type, setType] = useState("ALIMENTACAO"),
    [month, setMonth] = useState(monthToday()),
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
    [rowErrors, setRowErrors] = useState<Record<string, string>>({});

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
    void api<{ vinculos: Row[]; configuracoes: Row[] }>(
      `beneficios/lote/opcoes?unidadeId=${unitId}&tipo=${type}&competencia=${month}-01`,
    )
      .then((result) => {
        setLinks(result.vinculos);
        setConfigs(result.configuracoes);
        setConfigId((current) =>
          type === "TRANSPORTE"
            ? ""
            : result.configuracoes.some(
                  (config) => String(config.id) === current,
                )
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
      .catch((reason) => setError((reason as Error).message))
      .finally(() => setLoading(false));
  }, [unitId, type, month]);
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
    if (!selected.length || (type !== "TRANSPORTE" && !configId)) return;
    const errors: Record<string, string> = {};
    for (const link of selected) {
      const item = items[String(link.id)]!;
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
          ))
      )
        errors[String(link.id)] =
          "Informe dias, fornecedor e valor para cada condução.";
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
          configuracaoId: type === "TRANSPORTE" ? null : configId,
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
                <option key={option}>{labels[option]}</option>
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
          {type !== "TRANSPORTE" && (
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
          )}
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
                    {type === "TRANSPORTE" && <th>Conduções e cartões</th>}
                  </tr>
                </thead>
                <tbody>
                  {visibleLinks.map((link) => {
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
                                    <option key={option}>
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
                                      fornecedorId: "",
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
                disabled={
                  saving ||
                  !selected.length ||
                  (type !== "TRANSPORTE" && !configId)
                }
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
              {type === "TRANSPORTE" && (
                <p>
                  Total mensal revisado:{" "}
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
    </div>
  );
}
