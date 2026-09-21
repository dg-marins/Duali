import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { api, display, type Row } from "../../api";
import { Notice } from "../../components";
import { Button } from "../../components/ui/button";
import {
  CurrencyInput,
  FormDialog,
  LoadingSkeleton,
  money,
  RefreshingContent,
} from "../../ui";
const conductionLabels: Record<string, string> = {
  ONIBUS: "Ônibus",
  ONIBUS_INTER: "Ônibus Intermunicipal",
  BARCA: "Barca",
  METRO: "Metrô",
  TREM: "Trem",
  OUTROS: "Outros",
};
const benefitLabels: Record<string, string> = {
  ALIMENTACAO: "Alimentação",
  TRANSPORTE: "Transporte",
  CESTA_BASICA: "Cesta básica",
  PREMIACAO: "Premiação",
  OUTRO: "Outro",
};
function cents(value: string) {
  return /^\d+(?:\.\d{1,2})?$/.test(value)
    ? Number(value.split(".")[0]) * 100 +
        Number((value.split(".")[1] ?? "").padEnd(2, "0"))
    : NaN;
}
export function BenefitClosingPage({
  navigate,
}: {
  navigate: (path: string) => void;
}) {
  const initial = new URLSearchParams(location.search);
  const [units, setUnits] = useState<Row[]>([]),
    [unitSearch, setUnitSearch] = useState(""),
    [unit, setUnit] = useState(initial.get("unidadeId") ?? ""),
    [month, setMonth] = useState(
      initial.get("competencia")?.slice(0, 7) ??
        new Date().toISOString().slice(0, 7),
    ),
    [closing, setClosing] = useState<Row | null>(null),
    [unitsLoading, setUnitsLoading] = useState(true),
    [loading, setLoading] = useState(false),
    [hasLoaded, setHasLoaded] = useState(false),
    [error, setError] = useState(""),
    [reopening, setReopening] = useState(false),
    [reason, setReason] = useState(""),
    [reasonError, setReasonError] = useState(""),
    [adjusting, setAdjusting] = useState<Row | null>(null),
    [adjustmentType, setAdjustmentType] = useState("CREDITO"),
    [adjustmentValue, setAdjustmentValue] = useState(""),
    [adjustmentReason, setAdjustmentReason] = useState(""),
    [distribution, setDistribution] = useState<Record<string, string>>({}),
    [adjustmentError, setAdjustmentError] = useState(""),
    [adjustmentSaving, setAdjustmentSaving] = useState(false);
  const closeAdjustment = () => {
    setAdjusting(null);
    setAdjustmentType("CREDITO");
    setAdjustmentValue("");
    setAdjustmentReason("");
    setDistribution({});
    setAdjustmentError("");
  };
  async function submitAdjustment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!adjusting) return;
    const value = cents(adjustmentValue);
    if (
      !Number.isSafeInteger(value) ||
      value <= 0 ||
      !adjustmentReason.trim()
    ) {
      setAdjustmentError("Informe valor positivo e motivo.");
      return;
    }
    const transport = (adjusting.beneficioVinculo as Row).tipo === "TRANSPORTE";
    const allocations = Object.entries(distribution)
      .filter(([, amount]) => amount !== "")
      .map(([transporteCompetenciaItemId, amount]) => ({
        transporteCompetenciaItemId,
        valor: amount,
      }));
    if (
      transport &&
      (!allocations.length ||
        allocations.some(
          (item) =>
            !Number.isSafeInteger(cents(item.valor)) || cents(item.valor) <= 0,
        ) ||
        allocations.reduce((sum, item) => sum + cents(item.valor), 0) !== value)
    ) {
      setAdjustmentError(
        "Distribua o valor integral entre as conduções afetadas.",
      );
      return;
    }
    setAdjustmentSaving(true);
    setAdjustmentError("");
    try {
      await api(
        transport ? "ajustes-beneficios/distribuido" : "ajustes-beneficios",
        "POST",
        {
          competenciaId: adjusting.id,
          tipo: adjustmentType,
          valor: adjustmentValue,
          motivo: adjustmentReason.trim(),
          ...(transport ? { distribuicoes: allocations } : {}),
        },
        transport ? { idempotencyKey: crypto.randomUUID() } : {},
      );
      closeAdjustment();
      toast.success("Ajuste registrado.");
      await load();
    } catch (cause) {
      setAdjustmentError((cause as Error).message);
    } finally {
      setAdjustmentSaving(false);
    }
  }
  useEffect(() => {
    const timer = setTimeout(() => {
      setUnitsLoading(true);
      void api<{ items: Row[] }>(
        `unidades?pageSize=100&q=${encodeURIComponent(unitSearch)}`,
      )
        .then((r) => {
          setUnits(r.items);
          const firstUnitId = r.items[0]?.id;
          if (firstUnitId) setUnit((current) => current || String(firstUnitId));
          if (!r.items.length) setHasLoaded(true);
          setError("");
        })
        .catch((reason) => setError((reason as Error).message))
        .finally(() => setUnitsLoading(false));
    }, 150);
    return () => clearTimeout(timer);
  }, [unitSearch]);
  async function load() {
    if (!unit) return;
    setLoading(true);
    try {
      const rows = await api<Row[]>(
        `beneficios/fechamentos?unidadeId=${unit}&competencia=${month}-01`,
      );
      if (rows[0])
        setClosing(await api<Row>(`beneficios/fechamentos/${rows[0].id}`));
      else setClosing(null);
      setError("");
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }
  useEffect(() => {
    void load();
  }, [unit, month]);
  async function create() {
    await api("beneficios/fechamentos", "POST", {
      unidadeId: unit,
      competencia: `${month}-01`,
    });
    toast.success("Competência preparada.");
    await load();
  }
  async function action(name: string, body: Row = {}) {
    if (!closing) return;
    await api(`beneficios/fechamentos/${closing.id}/${name}`, "POST", body);
    toast.success("Situação atualizada.");
    await load();
  }
  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Benefícios</p>
          <h1>Fechamento de competência</h1>
          <p>Controle mensal por unidade, sem fluxo de aprovação.</p>
        </div>
        <Button variant="outline" onClick={() => navigate("/app/beneficios")}>
          Voltar
        </Button>
      </section>
      <section className="panel filter-panel">
        <div className="filter-grid">
          <label>
            <span>Buscar unidade</span>
            <input
              value={unitSearch}
              onChange={(e) => setUnitSearch(e.target.value)}
            />
          </label>
          <label>
            <span>Unidade</span>
            <select value={unit} onChange={(e) => setUnit(e.target.value)}>
              {units.map((u) => (
                <option key={String(u.id)} value={String(u.id)}>
                  {display(u)}
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
        </div>
      </section>
      <Notice text={error} error />
      {!hasLoaded ? (
        <section className="panel">
          <LoadingSkeleton variant="detail" label="Carregando competência…" />
        </section>
      ) : (
        <RefreshingContent refreshing={unitsLoading || loading}>
          {!closing ? (
            <section className="panel">
              <p>A competência ainda não foi preparada.</p>
              <Button disabled={!unit} onClick={() => void create()}>
                Preparar competência
              </Button>
            </section>
          ) : (
            <>
              <section className="stats-grid">
                <article className="stat-card">
                  <span>Situação</span>
                  <strong>{display(closing.status)}</strong>
                </article>
                <article className="stat-card">
                  <span>Pessoas cobertas</span>
                  <strong>{display(closing.pessoasCobertas)}</strong>
                </article>
                <article className="stat-card">
                  <span>Pendências</span>
                  <strong>{display(closing.pendencias)}</strong>
                </article>
                <article className="stat-card">
                  <span>Total</span>
                  <strong>{money((closing.totais as Row)?.total)}</strong>
                </article>
              </section>
              <section className="panel">
                <h2>Totais</h2>
                <div className="stats-grid">
                  {Object.entries((closing.totais as Row) ?? {})
                    .filter(([k]) => k !== "total")
                    .map(([k, v]) => (
                      <article className="stat-card" key={k}>
                        <span>{k.replaceAll("_", " ")}</span>
                        <strong>{money(v)}</strong>
                      </article>
                    ))}
                </div>
                <div className="form-actions">
                  {closing.status === "ABERTA" && (
                    <Button onClick={() => void action("revisar")}>
                      Iniciar revisão
                    </Button>
                  )}
                  {closing.status === "EM_REVISAO" && (
                    <Button onClick={() => void action("fechar")}>
                      Fechar competência
                    </Button>
                  )}
                  {closing.status === "FECHADA" && (
                    <Button onClick={() => setReopening(true)}>
                      Reabrir competência
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    onClick={() => navigate("/app/pendencias")}
                  >
                    Revisar pendências
                  </Button>
                </div>
              </section>
              <section className="panel">
                <h2>Lançamentos da competência</h2>
                <p className="muted">
                  Selecione uma pessoa para registrar uma correção antes do
                  fechamento.
                </p>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Pessoa</th>
                        <th>Benefício</th>
                        <th>Fornecedor</th>
                        <th>Valor final</th>
                        <th>Ação</th>
                      </tr>
                    </thead>
                    <tbody>
                      {((closing.lancamentos as Row[] | undefined) ?? []).map(
                        (row) => {
                          const benefit = row.beneficioVinculo as Row;
                          const link = benefit.vinculo as Row;
                          const config = row.configuracao as Row;
                          return (
                            <tr key={String(row.id)}>
                              <td>{display(link.pessoa)}</td>
                              <td>
                                {benefitLabels[String(benefit.tipo)] ??
                                  display(benefit.tipo)}
                              </td>
                              <td>
                                {benefit.tipo === "TRANSPORTE"
                                  ? "Por condução"
                                  : display(config.fornecedor)}
                              </td>
                              <td>{money(row.valorFinal)}</td>
                              <td>
                                <Button
                                  variant="outline"
                                  disabled={closing.status === "FECHADA"}
                                  onClick={() => setAdjusting(row)}
                                >
                                  Registrar ajuste
                                </Button>
                              </td>
                            </tr>
                          );
                        },
                      )}
                    </tbody>
                  </table>
                </div>
                {!((closing.lancamentos as Row[] | undefined) ?? []).length && (
                  <p>Nenhum lançamento nesta unidade e competência.</p>
                )}
              </section>
            </>
          )}
        </RefreshingContent>
      )}
      <FormDialog
        open={Boolean(adjusting)}
        onOpenChange={(open) => {
          if (!open && !adjustmentSaving) closeAdjustment();
        }}
        title="Registrar ajuste da competência"
        description="A correção fica vinculada ao lançamento selecionado."
      >
        {adjusting && (
          <form onSubmit={(event) => void submitAdjustment(event)}>
            <p>
              {display(
                ((adjusting.beneficioVinculo as Row).vinculo as Row).pessoa,
              )}{" "}
              ·{" "}
              {benefitLabels[String((adjusting.beneficioVinculo as Row).tipo)]}
            </p>
            <div className="form-grid">
              <label>
                <span>Tipo *</span>
                <select
                  value={adjustmentType}
                  onChange={(event) => setAdjustmentType(event.target.value)}
                >
                  <option value="CREDITO">Crédito</option>
                  <option value="DEBITO">Débito</option>
                </select>
              </label>
              <label>
                <span>Valor *</span>
                <CurrencyInput
                  value={adjustmentValue}
                  onValueChange={setAdjustmentValue}
                  required
                />
              </label>
              <label className="wide">
                <span>Motivo *</span>
                <textarea
                  required
                  value={adjustmentReason}
                  onChange={(event) => setAdjustmentReason(event.target.value)}
                />
              </label>
            </div>
            {(adjusting.beneficioVinculo as Row).tipo === "TRANSPORTE" && (
              <fieldset className="transport-adjustment-items">
                <legend>Distribuição entre conduções *</legend>
                {((adjusting.transporteItens as Row[] | undefined) ?? []).map(
                  (item) => (
                    <label key={String(item.id)}>
                      <span>
                        {conductionLabels[String(item.tipoConducao)] ??
                          display(item.tipoConducao)}{" "}
                        · {display(item.fornecedor)}
                      </span>
                      <CurrencyInput
                        ariaLabel={`Valor para ${conductionLabels[String(item.tipoConducao)] ?? display(item.tipoConducao)} de ${display(item.fornecedor)}`}
                        value={distribution[String(item.id)] ?? ""}
                        onValueChange={(value) =>
                          setDistribution((current) => ({
                            ...current,
                            [String(item.id)]: value,
                          }))
                        }
                      />
                    </label>
                  ),
                )}
              </fieldset>
            )}
            {adjustmentError && (
              <small className="field-error" role="alert">
                {adjustmentError}
              </small>
            )}
            <div className="form-actions dialog-actions">
              <Button
                type="button"
                variant="outline"
                disabled={adjustmentSaving}
                onClick={closeAdjustment}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={adjustmentSaving}>
                {adjustmentSaving ? "Salvando…" : "Salvar ajuste"}
              </Button>
            </div>
          </form>
        )}
      </FormDialog>
      <FormDialog
        open={reopening}
        onOpenChange={setReopening}
        title="Reabrir competência"
        description="Informe o motivo para manter a rastreabilidade desta operação."
      >
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const motivo = reason.trim();
            if (!motivo) {
              setReasonError("Informe o motivo da reabertura.");
              return;
            }
            setReasonError("");
            void action("reabrir", { motivo })
              .then(() => {
                setReopening(false);
                setReason("");
              })
              .catch((cause) => setReasonError((cause as Error).message));
          }}
        >
          <label>
            <span>Motivo *</span>
            <textarea
              autoFocus
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-invalid={Boolean(reasonError)}
            />
          </label>
          {reasonError && (
            <small className="field-error" role="alert">
              {reasonError}
            </small>
          )}
          <div className="form-actions dialog-actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => setReopening(false)}
            >
              Cancelar
            </Button>
            <Button type="submit">Reabrir competência</Button>
          </div>
        </form>
      </FormDialog>
    </div>
  );
}
