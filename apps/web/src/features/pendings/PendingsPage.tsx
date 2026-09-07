import { useEffect, useState } from "react";
import { api, display, type Row } from "../../api";
import { Button } from "../../components/ui/button";
type Navigate = (path: string) => void;
export function PendingsPage({ navigate }: { navigate: Navigate }) {
  const [items, setItems] = useState<Row[]>([]),
    [summary, setSummary] = useState<Row>({}),
    [loading, setLoading] = useState(true);
  const [module, setModule] = useState(""),
    [severity, setSeverity] = useState("");
  useEffect(() => {
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
        setItems(list.items);
        setSummary(totals);
      })
      .finally(() => setLoading(false));
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
        {loading ? (
          <p role="status">Carregando…</p>
        ) : !items.length ? (
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
      </section>
    </div>
  );
}
