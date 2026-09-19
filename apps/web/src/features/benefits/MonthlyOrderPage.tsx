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
};
type TransportItem = {
  tipoConducao: string;
  fornecedorId: string;
  fornecedor?: Row;
  valorDiario: string;
};
type Draft = Row & {
  beneficioVinculoId: string;
  incluir: boolean;
  quantidadeDias: string;
  quantidade: string;
  valorUnitario: string;
  valorMensalBase: string;
  valorSolicitado: string;
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
  const [team, setTeam] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const competence = `${month}-01`;

  useEffect(() => {
    void api<{ items: Row[] }>("unidades?page=1&pageSize=100")
      .then((response) => {
        setUnits(response.items);
        setUnit((value) => value || String(response.items[0]?.id ?? ""));
      })
      .catch((reason) => setError((reason as Error).message));
  }, []);
  useEffect(() => {
    if (!unit) return;
    const params = new URLSearchParams({
      unidadeId: unit,
      competencia: competence,
      tipo: type,
    });
    history.replaceState({}, "", `${location.pathname}?${params}`);
    setLoading(true);
    void api<Row[]>(`aquisicoes-beneficios/pedido/previa?${params}`)
      .then((response) => {
        setRows(
          response.map((row) => ({
            ...row,
            beneficioVinculoId: String(row.beneficioVinculoId),
            incluir: Boolean(row.incluirAutomaticamente),
            quantidadeDias: String(row.quantidadeDias ?? ""),
            quantidade: String(row.quantidade ?? ""),
            valorUnitario: String(row.valorUnitario ?? ""),
            valorMensalBase: String(row.valorMensalBase ?? ""),
            valorSolicitado: String(row.valorSugerido ?? ""),
            motivoAfastado: "",
            transporteItens:
              (row.transporteItens as TransportItem[] | undefined) ?? [],
          })),
        );
        setError("");
      })
      .catch((reason) => setError((reason as Error).message))
      .finally(() => setLoading(false));
  }, [unit, month, type]);

  const teams = useMemo(
    () =>
      [
        ...new Set(rows.map((row) => String(row.equipe ?? "")).filter(Boolean)),
      ].sort(),
    [rows],
  );
  const visible = useMemo(
    () =>
      rows.filter(
        (row) =>
          (!query ||
            String(row.pessoa)
              .toLocaleLowerCase("pt-BR")
              .includes(query.toLocaleLowerCase("pt-BR"))) &&
          (!team || row.equipe === team),
      ),
    [rows, query, team],
  );
  const selected = rows.filter((row) => row.incluir);
  const update = (id: string, patch: Partial<Draft>) =>
    setRows((all) =>
      all.map((row) =>
        row.beneficioVinculoId === id ? { ...row, ...patch } : row,
      ),
    );
  const updateTransportItem = (
    id: string,
    index: number,
    patch: Partial<TransportItem>,
  ) =>
    setRows((all) =>
      all.map((row) => {
        if (row.beneficioVinculoId !== id) return row;
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
      : row.valorSolicitado;

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
            beneficioVinculoId: row.beneficioVinculoId,
            incluir: row.incluir,
            quantidadeDias: row.quantidadeDias || null,
            quantidade: row.quantidade || null,
            valorUnitario: row.valorUnitario || null,
            valorMensalBase: row.valorMensalBase || null,
            valorSolicitado: requestedTotal(row) || null,
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
              <label>
                <span>Equipe</span>
                <select
                  value={team}
                  onChange={(event) => setTeam(event.target.value)}
                >
                  <option value="">Todas</option>
                  {teams.map((value) => (
                    <option key={value}>{value}</option>
                  ))}
                </select>
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
                    <th>Equipe</th>
                    <th>Referência anterior</th>
                    <th>Dias</th>
                    <th>Valor/dia</th>
                    <th>Valor mensal</th>
                    <th>Total solicitado</th>
                    <th>Situação</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((row) => (
                    <tr key={row.beneficioVinculoId}>
                      <td>
                        <input
                          aria-label={`Incluir ${row.pessoa}`}
                          type="checkbox"
                          disabled={Boolean(row.impedimento)}
                          checked={row.incluir}
                          onChange={(event) =>
                            update(row.beneficioVinculoId, {
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
                              <label
                                key={`${item.fornecedorId}-${item.tipoConducao}-${index}`}
                              >
                                <span>
                                  {labels[item.tipoConducao] ??
                                    item.tipoConducao}{" "}
                                  · {display(item.fornecedor)}
                                </span>
                                <CurrencyInput
                                  value={item.valorDiario}
                                  onValueChange={(value) =>
                                    updateTransportItem(
                                      row.beneficioVinculoId,
                                      index,
                                      { valorDiario: value },
                                    )
                                  }
                                  ariaLabel={`Valor diário de ${item.tipoConducao} para ${row.pessoa}`}
                                />
                              </label>
                            ))}
                          </details>
                        )}
                      </td>
                      <td>{display(row.equipe)}</td>
                      <td>
                        {row.referenciaStatus === "NOVA_AQUISICAO"
                          ? "Nova aquisição"
                          : row.referenciaStatus === "SEM_REFERENCIA"
                            ? "Sem referência no mês anterior"
                            : money(row.referenciaAnterior)}
                      </td>
                      <td>
                        <input
                          aria-label={`Dias de ${row.pessoa}`}
                          type="number"
                          min="0"
                          value={row.quantidadeDias}
                          onChange={(event) =>
                            update(row.beneficioVinculoId, {
                              quantidadeDias: event.target.value,
                            })
                          }
                        />
                      </td>
                      <td>
                        {type === "TRANSPORTE" ? (
                          "Por condução"
                        ) : (
                          <CurrencyInput
                            value={row.valorUnitario}
                            onValueChange={(value) =>
                              update(row.beneficioVinculoId, {
                                valorUnitario: value,
                              })
                            }
                            ariaLabel={`Valor diário de ${row.pessoa}`}
                          />
                        )}
                      </td>
                      <td>
                        {type === "ALIMENTACAO" ? (
                          <CurrencyInput
                            value={row.valorMensalBase}
                            onValueChange={(value) =>
                              update(row.beneficioVinculoId, {
                                valorMensalBase: value,
                                valorSolicitado: value,
                              })
                            }
                            ariaLabel={`Valor mensal de ${row.pessoa}`}
                          />
                        ) : (
                          "—"
                        )}
                      </td>
                      <td>
                        {type === "TRANSPORTE" ? (
                          money(requestedTotal(row))
                        ) : (
                          <CurrencyInput
                            value={row.valorSolicitado}
                            onValueChange={(value) =>
                              update(row.beneficioVinculoId, {
                                valorSolicitado: value,
                                valorMensalBase:
                                  type === "ALIMENTACAO"
                                    ? value
                                    : row.valorMensalBase,
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
                                update(row.beneficioVinculoId, {
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
