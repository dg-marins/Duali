import { useEffect, useState } from "react";
import { api, display, type Row } from "../../api";
import { Notice } from "../../components";
import { Button } from "../../components/ui/button";
import { LoadingSkeleton, RefreshingContent } from "../../ui";
type Navigate = (path: string) => void;
export function PendingsPage({ navigate }: { navigate: Navigate }) {
  const [items, setItems] = useState<Row[]>([]),
    [summary, setSummary] = useState<Row>({}),
    [loading, setLoading] = useState(true),
    [hasLoaded, setHasLoaded] = useState(false),
    [error, setError] = useState("");
  const [module, setModule] = useState(""),
    [severity, setSeverity] = useState("");
  useEffect(() => {
    let active = true;
    setLoading(true);
    const query = new URLSearchParams({
      ...(module ? { modulo: module } : {}),
      ...(severity ? { severidade: severity } : {}),
      pageSize: "100",
    });
    Promise.all([
      api<{ items: Row[] }>(`pendencias?${query}`),
      api<Row>("pendencias/resumo"),
    ])
      .then(([list, totals]) => {
        if (active) {
          setItems(list.items);
          setSummary(totals);
          setError("");
        }
      })
      .catch((reason) => {
        if (active) setError((reason as Error).message);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
          setHasLoaded(true);
        }
      });
    return () => {
      active = false;
    };
  }, [module, severity]);
  return (
    <div className="page-stack">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Central operacional</p>
          <h1>Pendências</h1>
          <p>
            Dados que precisam de correção, conferência ou uma decisão humana.
          </p>
        </div>
      </section>
      <Notice text={error} error />
      {loading && !hasLoaded ? (
        <LoadingSkeleton variant="metrics" label="Carregando pendências…" />
      ) : (
        <RefreshingContent refreshing={loading}>
          <section className="stats-grid">
            {(
              [
                ["Críticas", "criticas"],
                ["Atenção", "atencao"],
                ["Dados para revisão", "revisao"],
                ["Dependências", "dependencias"],
              ] as const
            ).map(([label, key]) => (
              <article className="stat-card" key={key}>
                <span>{label}</span>
                <strong>{String(summary[key] ?? 0)}</strong>
              </article>
            ))}
          </section>
        </RefreshingContent>
      )}
      <section className="panel filter-panel">
        <div className="filter-grid">
          <label>
            <span>Módulo</span>
            <select value={module} onChange={(e) => setModule(e.target.value)}>
              <option value="">Todos</option>
              <option>IMPORTACAO</option>
              <option>VINCULO</option>
              <option>ESTAGIO</option>
              <option>DESCANSO</option>
              <option>BENEFICIO</option>
            </select>
          </label>
          <label>
            <span>Severidade</span>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value)}
            >
              <option value="">Todas</option>
              <option>CRITICA</option>
              <option>ATENCAO</option>
              <option>REVISAO</option>
            </select>
          </label>
        </div>
      </section>
      <section className="panel">
        {loading && !hasLoaded ? (
          <LoadingSkeleton label="Carregando pendências…" />
        ) : (
          <RefreshingContent refreshing={loading}>
            {!items.length ? (
              <p>Nenhuma pendência para estes filtros.</p>
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Pessoa</th>
                      <th>Tipo</th>
                      <th>Origem</th>
                      <th>Descrição</th>
                      <th>Severidade</th>
                      <th>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={String(item.id)}>
                        <td>{display(item.pessoa)}</td>
                        <td>
                          <span className="badge">{display(item.codigo)}</span>
                        </td>
                        <td>{display(item.origem)}</td>
                        <td>{display(item.descricao)}</td>
                        <td>{display(item.severidade)}</td>
                        <td>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => navigate(String(item.href))}
                          >
                            Revisar
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </RefreshingContent>
        )}
      </section>
    </div>
  );
}
