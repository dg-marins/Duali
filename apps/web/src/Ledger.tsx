import { useState } from "react";
import { api, display, type Row } from "./api";
import { Lookup, Notice } from "./components";
export function Ledger() {
  const [id, setId] = useState(""),
    [data, setData] = useState<Row | null>(null),
    [error, setError] = useState("");
  async function load() {
    try {
      setError("");
      setData(await api("vinculos/" + id + "/saldo"));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  return (
    <>
      <h1>Saldo e histórico de descanso</h1>
      <p>Saldo reconstruído a partir de direitos, consumo e ajustes.</p>
      <section className="panel">
        <Lookup
          field={{ key: "vinculoId", label: "Vínculo", resource: "vinculos" }}
          value={id}
          onChange={(v) => {
            setId(String(v));
            setData(null);
          }}
        />
        <div className="form-actions">
          <button disabled={!id} onClick={() => void load()}>
            Consultar saldo
          </button>
          <button
            className="secondary"
            onClick={() => {
              void api("descansos/sincronizar", "POST", {})
                .then(() => {
                  if (id) void load();
                })
                .catch((e) => setError((e as Error).message));
            }}
          >
            Atualizar aquisições
          </button>
        </div>
      </section>
      <Notice text={error} error />
      {data && (
        <>
          <section className="panel">
            <h2>{String(data.pessoa)}</h2>
            <div className="metrics">
              {[
                "saldo",
                "adquiridos",
                "consumidos",
                "ajustes",
                "programados",
              ].map((key) => (
                <article key={key}>
                  <span>{key}</span>
                  <strong>{display(data[key])} dias</strong>
                </article>
              ))}
            </div>
            {(data.alertas as string[]).map((a) => (
              <Notice key={a} text={a} error />
            ))}
          </section>
          {[
            ["direitos", "Direitos"],
            ["periodos", "Períodos"],
            ["consumos", "Consumo"],
            ["ajustesHistorico", "Ajustes"],
          ].map(([key, title]) => (
            <section className="panel" key={key}>
              <h2>{title}</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Referência</th>
                      <th>Dias</th>
                      <th>Situação</th>
                      <th>Justificativa / origem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data[key!] as Row[]).map((row) => (
                      <tr key={String(row.id)}>
                        <td>
                          {display(
                            row.dataAquisicao ??
                              row.dataInicio ??
                              row.dataReferencia ??
                              row.criadoEm,
                          )}
                        </td>
                        <td>{display(row.quantidadeDias)}</td>
                        <td>
                          {display(
                            row.status ??
                              row.tipo ??
                              (row.pendente !== undefined
                                ? "Pendente: " + String(row.pendente)
                                : null),
                          )}
                        </td>
                        <td>
                          {display(row.motivo ?? row.observacoes ?? row.origem)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ))}
        </>
      )}
    </>
  );
}
