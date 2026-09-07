import { useEffect, useState, type FormEvent } from "react";
import { api, display, type Row } from "./api";
import { screens, type Field } from "./resources";
import { Lookup, Notice } from "./components";
import { MetricCard, PageHeader, StatusBadge } from "./ui";
type Rule = {
  coluna?: string;
  valor?: string | number | boolean | null;
  grupo?: string;
};
type Group = { nome: string; dominio: string; campos: Record<string, Rule> };
interface Batch {
  id: string;
  nomeArquivo: string;
  status?: string;
  abas: { nome: string; colunas: string[]; linhas: number; previa: Row[] }[];
  items?: Row[];
  total?: number;
  totalRegistros?: number;
  summary?: { status: string; acao: string; _count: number }[];
}
const domains = screens.filter((s) => s.path !== "usuarios");
const canReview = (status?: string) =>
  status === "REVISAO" || status === "PARCIAL";
const importProfiles = [
  ["AUTO", "Detectar automaticamente"],
  ["PESSOAS", "Pessoas e vínculos"],
  ["ESTAGIOS", "Estágios"],
  ["DESCANSOS", "Férias e descanso"],
  ["BENEFICIOS", "Benefícios"],
] as const;
function initialGroups(profile: string): Group[] {
  const domain =
    profile === "ESTAGIOS"
      ? "estagios"
      : profile === "DESCANSOS"
        ? "periodos"
        : profile === "BENEFICIOS"
          ? "competencias"
          : "pessoas";
  return [
    {
      nome:
        domains.find((screen) => screen.path === domain)?.title ?? "Pessoas",
      dominio: domain,
      campos: {},
    },
  ];
}
function Review({ item, onSaved }: { item: Row; onSaved: () => void }) {
  const screen = domains.find((s) => s.path === item.dominio)!;
  const [data, setData] = useState<Row>(item.dadosNormalizados as Row),
    [action, setAction] = useState("CRIAR"),
    [target, setTarget] = useState(""),
    [reason, setReason] = useState(""),
    [error, setError] = useState(""),
    [before, setBefore] = useState<Row | null>(null),
    [saving, setSaving] = useState(false);
  const candidates = item.candidatos as {
    id: string;
    nome: string;
    evidencia: string;
  }[];
  useEffect(() => {
    if (!target) {
      setBefore(null);
      return;
    }
    void api(screen.path + "/" + target)
      .then(setBefore)
      .catch(() => setBefore(null));
  }, [target, screen.path]);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await api("importacao-itens/" + String(item.id), "PUT", {
        dados: data,
        acao: action,
        ...(target ? { destinoId: target } : {}),
        motivo: reason,
      });
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  return (
    <form onSubmit={(e) => void submit(e)} className="panel">
      <h2>
        Revisar linha {String(item.numeroLinha)} · {screen.title}
      </h2>
      <Notice text={error} error />
      <p>{(item.mensagens as string[]).join(" · ")}</p>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Coluna original</th>
              <th>Valor preservado</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(item.dadosOriginais as Row).map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td>{display(v)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="form-grid">
        {screen.fields.map((field) => (
          <label key={field.key}>
            {field.label}
            {field.resource ? (
              <Lookup
                field={field}
                value={data[field.key]}
                onChange={(v) => setData({ ...data, [field.key]: v || null })}
              />
            ) : field.options ? (
              <select
                value={String(data[field.key] ?? "")}
                onChange={(e) =>
                  setData({ ...data, [field.key]: e.target.value })
                }
              >
                <option value="">Não informado</option>
                {field.options.map((v) => (
                  <option key={v}>{v}</option>
                ))}
              </select>
            ) : (
              <input
                type={
                  field.type === "textarea" ? "text" : (field.type ?? "text")
                }
                {...(field.type === "checkbox"
                  ? { checked: Boolean(data[field.key]) }
                  : { value: String(data[field.key] ?? "") })}
                onChange={(e) =>
                  setData({
                    ...data,
                    [field.key]:
                      field.type === "checkbox"
                        ? e.target.checked
                        : e.target.value === ""
                          ? null
                          : field.type === "number"
                            ? Number(e.target.value)
                            : e.target.value,
                  })
                }
              />
            )}
          </label>
        ))}
      </div>
      <div className="form-grid">
        <label>
          Decisão
          <select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="CRIAR">Criar novo registro</option>
            <option value="VINCULAR">Vincular ao existente sem alterar</option>
            <option value="ATUALIZAR">
              Atualizar existente com dados revisados
            </option>
            <option value="REJEITAR">Rejeitar linha</option>
          </select>
        </label>
        {["VINCULAR", "ATUALIZAR"].includes(action) && (
          <label>
            Destino
            {candidates.length > 0 && (
              <select
                aria-label="Candidatos de duplicidade"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              >
                <option value="">Selecionar candidato…</option>
                {candidates.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} · {c.evidencia}
                  </option>
                ))}
              </select>
            )}
            <Lookup
              field={{
                key: "target",
                label: "Registro de destino",
                resource: screen.path,
              }}
              value={target}
              onChange={(v) => setTarget(String(v))}
            />
          </label>
        )}
        <label className="wide">
          Motivo da revisão
          <textarea
            required
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
      </div>
      {before && action === "ATUALIZAR" && (
        <div className="table-scroll">
          <h3>Diferenças propostas</h3>
          <table>
            <thead>
              <tr>
                <th>Campo</th>
                <th>Antes</th>
                <th>Após revisão</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(data)
                .filter(
                  ([key, value]) => display(value) !== display(before[key]),
                )
                .map(([key, value]) => (
                  <tr key={key}>
                    <td>
                      {screen.fields.find((f) => f.key === key)?.label ?? key}
                    </td>
                    <td>{display(before[key])}</td>
                    <td>{display(value)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="form-actions">
        <button disabled={saving}>
          {saving ? "Salvando…" : "Salvar revisão"}
        </button>
      </div>
    </form>
  );
}
export function Imports() {
  const [batch, setBatch] = useState<Batch | null>(null),
    [situation, setSituation] = useState("TODOS"),
    [domainFilter, setDomainFilter] = useState(""),
    [history, setHistory] = useState<Row[]>([]),
    [profile, setProfile] = useState("AUTO"),
    [aba, setAba] = useState(""),
    [groups, setGroups] = useState<Group[]>(initialGroups("AUTO")),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [review, setReview] = useState<Row | null>(null),
    [page, setPage] = useState(1),
    [confirming, setConfirming] = useState(false);
  useEffect(() => {
    void api<{ items: Row[] }>("importacoes")
      .then((r) => setHistory(r.items))
      .catch((e) => setError((e as Error).message));
  }, []);
  async function load(id: string, nextPage = page) {
    const query = new URLSearchParams({ page: String(nextPage), situacao: situation, ...(domainFilter ? { dominio: domainFilter } : {}) });
    const result = await api<Batch>("importacoes/" + id + "?" + query);
    setBatch(result);
    setAba(result.abas[0]?.nome ?? "");
    setPage(nextPage);
  }
  useEffect(() => {
    if (batch?.id) void load(batch.id, 1);
  }, [situation, domainFilter]);
  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("arquivo", file);
      const result = await api<Batch>("importacoes", "POST", form);
      if (result.status && result.status !== "UPLOAD") await load(result.id, 1);
      else {
        setBatch(result);
        setAba(result.abas[0]?.nome ?? "");
      }
      setPage(1);
      setReview(null);
      setConfirming(false);
      setGroups(initialGroups(profile));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function rule(index: number, key: string, next: Rule | undefined) {
    setGroups(
      groups.map((g, i) => {
        if (i !== index) return g;
        const campos = { ...g.campos };
        if (next) campos[key] = next;
        else delete campos[key];
        return { ...g, campos };
      }),
    );
  }
  const sheet = batch?.abas.find((s) => s.nome === aba);
  function fixed(field: Field, value: string): Rule {
    return {
      valor:
        field.type === "checkbox"
          ? value === "true"
          : field.type === "number" && value !== ""
            ? Number(value)
            : value,
    };
  }
  return (
    <>
      <PageHeader
        title="Importações"
        description="Analise a planilha, publique os dados seguros e trate somente as pendências."
      />
      <ol className="stepper" aria-label="Etapas da importação">
        {[
          ["1", "Tipo"],
          ["2", "Arquivo"],
          ["3", "Análise"],
          ["4", "Revisão"],
        ].map(([number, label], index) => {
          const active = batch
            ? batch.status === "UPLOAD"
              ? 2
              : 3
            : profile
              ? 1
              : 0;
          return (
            <li className={index <= active ? "active" : ""} key={number}>
              <span>{number}</span>
              {label}
            </li>
          );
        })}
      </ol>
      <Notice text={error} error />
      <Notice text={notice} />
      <section className="panel">
        <div className="form-grid">
          <label>
            Tipo de importação
            <select
              value={profile}
              onChange={(event) => {
                setProfile(event.target.value);
                setGroups(initialGroups(event.target.value));
              }}
            >
              {importProfiles.map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Arquivo XLSX ou CSV UTF-8 (até 10 MB)
            <input
              type="file"
              accept=".xlsx,.csv"
              disabled={busy}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void upload(file);
              }}
            />
          </label>
        </div>
        <p className="helper-text">
          A Listagem de Estagiários Geral é reconhecida automaticamente,
          incluindo suas abas e históricos.
        </p>
        {busy && <p role="status">Processando…</p>}
        <label>
          Retomar importação
          <select
            value={batch?.id ?? ""}
            onChange={(e) => {
              if (e.target.value)
                void load(e.target.value, 1).catch((e) =>
                  setError((e as Error).message),
                );
            }}
          >
            <option value="">Selecione…</option>
            {history.map((row) => (
              <option key={String(row.id)} value={String(row.id)}>
                {String(row.nomeArquivo)} · {String(row.status)}
              </option>
            ))}
          </select>
        </label>
      </section>
      {batch && (!batch.status || batch.status === "UPLOAD") && (
        <section className="panel">
          <h2>Mapear {batch.nomeArquivo}</h2>
          <label>
            Aba
            <select value={aba} onChange={(e) => setAba(e.target.value)}>
              {batch.abas.map((s) => (
                <option key={s.nome}>{s.nome}</option>
              ))}
            </select>
          </label>
          <p>
            {sheet?.linhas} linhas. Adicione grupos para documentos numerados ou
            componentes mensais. Relacione filhos a grupos anteriores ou
            selecione um cadastro existente como valor fixo.
          </p>
          {groups.map((group, index) => (
            <section className="mapping-group" key={index}>
              <div className="form-grid">
                <label>
                  Nome do grupo
                  <input
                    value={group.nome}
                    onChange={(e) =>
                      setGroups(
                        groups.map((g, i) =>
                          i === index ? { ...g, nome: e.target.value } : g,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Domínio
                  <select
                    value={group.dominio}
                    onChange={(e) =>
                      setGroups(
                        groups.map((g, i) =>
                          i === index
                            ? { ...g, dominio: e.target.value, campos: {} }
                            : g,
                        ),
                      )
                    }
                  >
                    {domains.map((s) => (
                      <option key={s.path} value={s.path}>
                        {s.title}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              {domains
                .find((s) => s.path === group.dominio)!
                .fields.map((field) => {
                  const current = group.campos[field.key];
                  return (
                    <div className="mapping-row" key={field.key}>
                      <strong>
                        {field.label}
                        {field.required ? " *" : ""}
                      </strong>
                      <select
                        aria-label={"Origem " + group.nome + " " + field.label}
                        value={
                          current?.coluna
                            ? "coluna:" + current.coluna
                            : current?.grupo
                              ? "grupo:" + current.grupo
                              : current?.valor !== undefined
                                ? "fixo"
                                : ""
                        }
                        onChange={(e) => {
                          const v = e.target.value;
                          rule(
                            index,
                            field.key,
                            v.startsWith("coluna:")
                              ? { coluna: v.slice(7) }
                              : v.startsWith("grupo:")
                                ? { grupo: v.slice(6) }
                                : v === "fixo"
                                  ? { valor: "" }
                                  : undefined,
                          );
                        }}
                      >
                        <option value="">Não importar</option>
                        {sheet?.colunas.map((c) => (
                          <option key={c} value={"coluna:" + c}>
                            Coluna: {c}
                          </option>
                        ))}
                        <option value="fixo">Valor fixo</option>
                        {groups.slice(0, index).map((g) => (
                          <option key={g.nome} value={"grupo:" + g.nome}>
                            Registro do grupo: {g.nome}
                          </option>
                        ))}
                      </select>
                      {current?.valor !== undefined &&
                        (field.resource ? (
                          <Lookup
                            field={field}
                            value={current.valor}
                            onChange={(v) =>
                              rule(index, field.key, { valor: String(v) })
                            }
                          />
                        ) : field.options || field.type === "checkbox" ? (
                          <select
                            aria-label={"Valor fixo " + field.label}
                            value={String(current.valor)}
                            onChange={(e) =>
                              rule(
                                index,
                                field.key,
                                fixed(field, e.target.value),
                              )
                            }
                          >
                            <option value="">Selecione…</option>
                            {(field.options ?? ["true", "false"]).map((v) => (
                              <option key={v}>{v}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            aria-label={"Valor fixo " + field.label}
                            type={
                              field.type === "date"
                                ? "date"
                                : field.type === "number"
                                  ? "number"
                                  : "text"
                            }
                            value={String(current.valor ?? "")}
                            onChange={(e) =>
                              rule(
                                index,
                                field.key,
                                fixed(field, e.target.value),
                              )
                            }
                          />
                        ))}
                    </div>
                  );
                })}
              <button
                className="secondary compact"
                disabled={groups.length === 1}
                onClick={() => setGroups(groups.filter((_, i) => i !== index))}
              >
                Remover grupo
              </button>
            </section>
          ))}
          <div className="form-actions">
            <button
              className="secondary"
              onClick={() =>
                setGroups([
                  ...groups,
                  {
                    nome: "Grupo " + (groups.length + 1),
                    dominio: "documentos",
                    campos: {},
                  },
                ])
              }
            >
              Adicionar grupo
            </button>
            <button
              disabled={busy}
              onClick={() => {
                setBusy(true);
                setError("");
                void api("importacoes/" + batch.id + "/analisar", "POST", {
                  aba,
                  grupos: groups,
                })
                  .then(() => load(batch.id, 1))
                  .catch((e) => setError((e as Error).message))
                  .finally(() => setBusy(false));
              }}
            >
              Analisar e gerar prévia
            </button>
          </div>
        </section>
      )}
      {batch?.status && batch.status !== "UPLOAD" && (
        <>
          <section className="panel">
            <h2>
              {batch.nomeArquivo} · <StatusBadge value={batch.status} />
            </h2>
            <p>
              {batch.totalRegistros ?? batch.total} registros encontrados
              {batch.totalRegistros !== undefined &&
                batch.totalRegistros !== batch.total &&
                ` · ${batch.total} exigem revisão`}
            </p>
            <div className="metrics import-summary">
              {batch.summary?.map((s) => (
                <MetricCard
                  key={s.status + s.acao}
                  label={`${s.status} · ${s.acao}`}
                  value={s._count}
                  {...(/PENDENTE|AGUARDANDO/i.test(s.status)
                    ? { tone: "warning" }
                    : {})}
                />
              ))}
            </div>
            <div className="filter-grid">
              <label><span>Situação</span><select value={situation} onChange={(e) => setSituation(e.target.value)}><option>TODOS</option><option value="DUPLICIDADE">Possível duplicidade</option><option value="DATA">Data inválida</option><option value="REFERENCIA">Referência</option><option value="DEPENDENCIA">Dependência</option><option value="REJEITADOS">Rejeitados</option><option value="PRONTOS">Prontos</option></select></label>
              <label><span>Domínio</span><select value={domainFilter} onChange={(e) => setDomainFilter(e.target.value)}><option value="">Todos</option>{domains.map((d) => <option key={d.path} value={d.path}>{d.title}</option>)}</select></label>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Linha</th>
                    <th>Grupo</th>
                    <th>Classificação</th>
                    <th>Decisão</th>
                    <th>Mensagens</th>
                    <th>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.items?.map((item) => (
                    <tr key={String(item.id)}>
                      <td>{String(item.numeroLinha)}</td>
                      <td>{String(item.grupo)}</td>
                      <td>{String(item.status)}</td>
                      <td>{String(item.acao)}</td>
                      <td className="wrap">
                        {(item.mensagens as string[]).join(" · ")}
                      </td>
                      <td>
                        {canReview(batch.status) && (
                          <button
                            className="secondary compact"
                            onClick={() => setReview(item)}
                          >
                            Revisar linha {String(item.numeroLinha)}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="pagination">
              <button
                className="secondary"
                disabled={page === 1}
                onClick={() => void load(batch.id, page - 1)}
              >
                Anterior
              </button>
              <span>Página {page}</span>
              <button
                className="secondary"
                disabled={page * 25 >= (batch.total ?? 0)}
                onClick={() => void load(batch.id, page + 1)}
              >
                Próxima
              </button>
            </div>
            {canReview(batch.status) && (
              <div className="form-actions">
                <button onClick={() => setConfirming(true)}>
                  Tentar publicar itens disponíveis…
                </button>
              </div>
            )}
          </section>
          {review && canReview(batch.status) && (
            <Review
              key={String(review.id)}
              item={review}
              onSaved={() => {
                setReview(null);
                void load(batch.id);
                setNotice("Revisão salva.");
              }}
            />
          )}
          {confirming && canReview(batch.status) && (
            <section className="panel">
              <h2>Publicar itens disponíveis</h2>
              <p>
                O sistema publicará somente registros válidos cujas dependências
                estejam resolvidas. Pendências e valores originais continuarão
                preservados no staging.
              </p>
              <div className="form-actions">
                <button
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    setError("");
                    void api(
                      "importacoes/" + batch.id + "/publicar-validos",
                      "POST",
                      {},
                    )
                      .then(() => {
                        setConfirming(false);
                        setNotice("Itens disponíveis processados com sucesso.");
                        return load(batch.id);
                      })
                      .catch((e) => setError((e as Error).message))
                      .finally(() => setBusy(false));
                  }}
                >
                  Publicar agora
                </button>
                <button
                  className="secondary"
                  onClick={() => setConfirming(false)}
                >
                  Voltar
                </button>
              </div>
            </section>
          )}
        </>
      )}
    </>
  );
}
