import { Dashboard, Reporting, Audit } from "./Reporting";
import { Imports } from "./Imports";
import { Ledger } from "./Ledger";
import React, { useEffect, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { api, setCsrf, type Row } from "./api";
import { screens } from "./resources";
import { Notice, Records } from "./components";
import "./style.css";
const menuGroups = [
  { title: "Geral", items: [["dashboard", "Visão geral"]] },
  {
    title: "Pessoas",
    items: [
      ["pessoas", "Pessoas"],
      ["vinculos", "Vínculos"],
      ["equipes", "Equipes"],
      ["unidades", "Unidades"],
    ],
  },
  {
    title: "Estágios",
    items: [
      ["estagios", "Estágios"],
      ["instituicoes", "Instituições"],
      ["documentos", "Documentos"],
      ["seguros", "Seguros"],
      ["seguro-movimentacoes", "Movimentações"],
    ],
  },
  {
    title: "Férias e descanso",
    items: [
      ["saldos", "Saldos e histórico"],
      ["direitos", "Direitos adquiridos"],
      ["periodos", "Férias e descanso"],
      ["consumos", "Consumos"],
      ["ajustes-descanso", "Ajustes"],
    ],
  },
  {
    title: "Benefícios",
    items: [
      ["beneficios-vinculo", "Benefícios do vínculo"],
      ["competencias", "Competências"],
      ["ajustes-beneficios", "Ajustes"],
      ["configuracoes-beneficios", "Configurações"],
      ["fornecedores", "Fornecedores"],
    ],
  },
  {
    title: "Operação",
    items: [
      ["importacoes", "Importações"],
      ["relatorios", "Relatórios"],
      ["auditoria", "Auditoria"],
    ],
  },
  { title: "Administração", items: [["usuarios", "Administradores"]] },
] as const;
function App() {
  const [user, setUser] = useState<Row | null>(null),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [screen, setScreen] = useState("dashboard"),
    [openGroup, setOpenGroup] = useState("Geral"),
    [email, setEmail] = useState(""),
    [senha, setSenha] = useState("");
  useEffect(() => {
    void api<{ usuario: Row; csrf: string }>("auth/me")
      .then((result) => {
        setUser(result.usuario);
        setCsrf(result.csrf);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);
  async function login(e: FormEvent) {
    e.preventDefault();
    setError("");
    try {
      const result = await api<{ usuario: Row; csrf: string }>(
        "auth/login",
        "POST",
        { email, senha },
      );
      setUser(result.usuario);
      setCsrf(result.csrf);
      setSenha("");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  if (loading) return <main role="status">Carregando Duali…</main>;
  if (!user)
    return (
      <div className="login">
        <section className="panel">
          <div className="brand">
            duali<span>GESTÃO DE PESSOAS</span>
          </div>
          <h1>Bem-vindo de volta</h1>
          <p>Entre para acompanhar sua operação.</p>
          <form onSubmit={(e) => void login(e)}>
            <Notice text={error} error />
            <label>
              E-mail
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="username"
              />
            </label>
            <label>
              Senha
              <input
                type="password"
                required
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete="current-password"
              />
            </label>
            <button>Entrar</button>
          </form>
        </section>
      </div>
    );
  const selected = screens.find((s) => s.path === screen) ?? screens[0]!;
  return (
    <div className="shell">
      <aside>
        <div className="brand">
          duali<span>GESTÃO DE PESSOAS</span>
        </div>
        <nav>
          {menuGroups.map((group) => {
            const expanded = openGroup === group.title;
            return (
              <section className="nav-group" key={group.title}>
                <button
                  className="nav-group-toggle"
                  aria-expanded={expanded}
                  aria-label={`${expanded ? "Recolher" : "Abrir"} grupo ${group.title}`}
                  onClick={() => setOpenGroup(expanded ? "" : group.title)}
                >
                  <span>{group.title}</span>
                  <span aria-hidden="true">{expanded ? "−" : "+"}</span>
                </button>
                {expanded && (
                  <div className="nav-items">
                    {group.items.map(([key, title]) => (
                      <button
                        key={key}
                        className={screen === key ? "active" : ""}
                        onClick={() => {
                          setScreen(key);
                          setOpenGroup(group.title);
                        }}
                      >
                        {title}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </nav>
        <div className="account">
          <strong>{String(user.nome)}</strong>
          <span>Administrador</span>
          <button
            className="secondary"
            onClick={() => {
              void api("auth/logout", "POST", {})
                .then(() => {
                  setUser(null);
                  setCsrf("");
                })
                .catch((e) => setError((e as Error).message));
            }}
          >
            Sair
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <span>
            Operação /{" "}
            {(
              {
                dashboard: "Visão geral",
                relatorios: "Relatórios",
                auditoria: "Auditoria",
                importacoes: "Importações",
                saldos: "Saldo e histórico",
              } as Record<string, string>
            )[screen] ?? selected.title}
          </span>
          <span>Duali · Gestão de Pessoas</span>
        </header>
        <Notice text={error} error />
        {screen === "dashboard" ? (
          <Dashboard />
        ) : screen === "relatorios" ? (
          <Reporting />
        ) : screen === "auditoria" ? (
          <Audit />
        ) : screen === "importacoes" ? (
          <Imports />
        ) : screen === "saldos" ? (
          <Ledger />
        ) : (
          <Records key={screen} screen={selected} />
        )}
      </main>
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
