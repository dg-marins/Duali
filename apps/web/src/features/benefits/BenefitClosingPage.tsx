import { useEffect, useState } from "react";
import { toast } from "sonner";
import { api, display, type Row } from "../../api";
import { Notice } from "../../components";
import { Button } from "../../components/ui/button";
import { FormDialog, LoadingSkeleton, RefreshingContent } from "../../ui";
export function BenefitClosingPage({
  navigate,
}: {
  navigate: (path: string) => void;
}) {
  const [units, setUnits] = useState<Row[]>([]),
    [unitSearch, setUnitSearch] = useState(""),
    [unit, setUnit] = useState(""),
    [month, setMonth] = useState(new Date().toISOString().slice(0, 7)),
    [closing, setClosing] = useState<Row | null>(null),
    [unitsLoading, setUnitsLoading] = useState(true),
    [loading, setLoading] = useState(false),
    [hasLoaded, setHasLoaded] = useState(false),
    [error, setError] = useState(""),
    [reopening, setReopening] = useState(false),
    [reason, setReason] = useState(""),
    [reasonError, setReasonError] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setUnitsLoading(true);
      void api<{ items: Row[] }>(
        `unidades?pageSize=100&q=${encodeURIComponent(unitSearch)}`,
      )
        .then((r) => {
          setUnits(r.items);
          if (r.items[0] && !r.items.some((item) => item.id === unit))
            setUnit(String(r.items[0].id));
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
                  <strong>R$ {display((closing.totais as Row)?.total)}</strong>
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
                        <strong>R$ {display(v)}</strong>
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
            </>
          )}
        </RefreshingContent>
      )}
      <FormDialog open={reopening} onOpenChange={setReopening} title="Reabrir competência" description="Informe o motivo para manter a rastreabilidade desta operação.">
        <form onSubmit={(event) => {
          event.preventDefault();
          const motivo = reason.trim();
          if (!motivo) { setReasonError("Informe o motivo da reabertura."); return; }
          setReasonError("");
          void action("reabrir", { motivo }).then(() => { setReopening(false); setReason(""); }).catch((cause) => setReasonError((cause as Error).message));
        }}>
          <label><span>Motivo *</span><textarea autoFocus value={reason} onChange={(event) => setReason(event.target.value)} aria-invalid={Boolean(reasonError)} /></label>
          {reasonError && <small className="field-error" role="alert">{reasonError}</small>}
          <div className="form-actions dialog-actions"><Button type="button" variant="outline" onClick={() => setReopening(false)}>Cancelar</Button><Button type="submit">Reabrir competência</Button></div>
        </form>
      </FormDialog>
    </div>
  );
}
