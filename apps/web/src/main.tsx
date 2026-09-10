import React, { useEffect, useRef, useState, type FormEvent } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, useLocation, useNavigate } from "react-router-dom";
import { ApiError, api, onUnauthorized, setCsrf, type Row } from "./api";
import { Notice, Records } from "./components";
import { screens } from "./resources";
import { Dashboard, Reporting, Audit } from "./Reporting";
import { Imports } from "./Imports";
import {
  PeoplePage,
  PersonEditor,
  PersonProfile,
  InternsPage,
  LeavePage,
  BenefitsPage,
  RegistryDetail,
} from "./Operational";
import { PendingsPage } from "./features/pendings/PendingsPage";
import { BenefitClosingPage } from "./features/benefits/BenefitClosingPage";
import { Toaster } from "sonner";
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Database,
  FileChartColumn,
  GraduationCap,
  LayoutDashboard,
  Menu,
  Settings2,
  ShieldCheck,
  Users,
  UserRoundCog,
  WalletCards,
  X,
} from "lucide-react";
import "./style.css";

const primary = [
  ["/app", "Visão geral", LayoutDashboard],
  ["/app/pendencias", "Pendências", CircleAlert],
  ["/app/pessoas", "Pessoas", Users],
] as const;
const grouped = [
  {
    title: "Operação",
    icon: BriefcaseBusiness,
    items: [
      ["/app/estagiarios", "Estagiários", GraduationCap],
      ["/app/ferias", "Férias e descanso", CalendarDays],
      ["/app/beneficios", "Benefícios", WalletCards],
    ],
  },
  {
    title: "Dados",
    icon: Database,
    items: [
      ["/app/importacoes", "Importações", ClipboardList],
      ["/app/relatorios", "Relatórios", FileChartColumn],
    ],
  },
  {
    title: "Cadastros",
    icon: Building2,
    items: [
      ["/app/cadastros/unidades", "Unidades", Building2],
      ["/app/cadastros/equipes", "Equipes", Users],
      ["/app/cadastros/instituicoes", "Instituições", GraduationCap],
      ["/app/cadastros/fornecedores", "Fornecedores / meios", WalletCards],
      [
        "/app/cadastros/configuracoes-beneficios",
        "Configurações de benefícios",
        Settings2,
      ],
    ],
  },
  {
    title: "Administração",
    icon: ShieldCheck,
    items: [
      ["/app/admin/usuarios", "Usuários", UserRoundCog],
      ["/app/admin/auditoria", "Auditoria", BarChart3],
    ],
  },
] as const;
const auxiliary: Record<string, string> = {
  "/app/cadastros/unidades": "unidades",
  "/app/cadastros/equipes": "equipes",
  "/app/cadastros/instituicoes": "instituicoes",
  "/app/cadastros/fornecedores": "fornecedores",
  "/app/cadastros/configuracoes-beneficios": "configuracoes-beneficios",
  "/app/admin/usuarios": "usuarios",
};
function useRoute() {
  const location = useLocation();
  const routerNavigate = useNavigate();
  const path =
    location.pathname === "/" || location.pathname === "/login"
      ? "/app"
      : location.pathname;
  const navigate = (next: string) => {
    routerNavigate(next);
    window.scrollTo({ top: 0 });
  };
  return {
    path,
    navigate,
    currentRoute: location.pathname + location.search,
  };
}

type AuthState =
  | { status: "loading" }
  | { status: "authenticated"; user: Row }
  | { status: "unauthenticated" }
  | { status: "unavailable"; message: string };

function App() {
  const { path, navigate, currentRoute } = useRoute();
  const [auth, setAuth] = useState<AuthState>({ status: "loading" }),
    [message, setMessage] = useState(""),
    [email, setEmail] = useState(""),
    [senha, setSenha] = useState(""),
    [collapsed, setCollapsed] = useState(false),
    [drawer, setDrawer] = useState(false),
    [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set()),
    [flyoutGroup, setFlyoutGroup] = useState<string | null>(null);
  const returnRoute = useRef<string | null>(null);
  const retryButton = useRef<HTMLButtonElement | null>(null);
  useEffect(
    () =>
      onUnauthorized(() => {
        if (auth.status !== "authenticated") return;
        returnRoute.current = currentRoute.startsWith("/app")
          ? currentRoute
          : "/app";
        setCsrf("");
        setAuth({ status: "unauthenticated" });
        setMessage("Sua sessão expirou. Entre novamente.");
        navigate("/login");
      }),
    [auth.status, currentRoute, navigate],
  );

  function loadSession() {
    setAuth({ status: "loading" });
    setMessage("");
    void api<{ usuario: Row; csrf: string }>("auth/me", "GET", undefined, {
      notifyUnauthorized: false,
    })
      .then((result) => {
        setCsrf(result.csrf);
        setAuth({ status: "authenticated", user: result.usuario });
      })
      .catch((error: unknown) => {
        setCsrf("");
        if (error instanceof ApiError && error.status === 401)
          setAuth({ status: "unauthenticated" });
        else
          setAuth({
            status: "unavailable",
            message:
              error instanceof Error
                ? error.message
                : "Não foi possível verificar sua sessão.",
          });
      });
  }

  useEffect(loadSession, []);

  useEffect(() => {
    if (auth.status === "unavailable") retryButton.current?.focus();
  }, [auth.status]);
  useEffect(() => {
    if (!drawer) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDrawer(false);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [drawer]);
  useEffect(() => {
    const close = () => setFlyoutGroup(null);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  useEffect(() => {
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFlyoutGroup(null);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, []);

  async function login(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      const result = await api<{ usuario: Row; csrf: string }>(
        "auth/login",
        "POST",
        { email, senha },
        { notifyUnauthorized: false },
      );
      setCsrf(result.csrf);
      setAuth({ status: "authenticated", user: result.usuario });
      setSenha("");
      const destination = returnRoute.current ?? "/app";
      returnRoute.current = null;
      navigate(destination);
    } catch (e) {
      setMessage((e as Error).message);
    }
  }

  async function logout() {
    const request = api(
      "auth/logout",
      "POST",
      {},
      { notifyUnauthorized: false },
    );
    setCsrf("");
    setAuth({ status: "unauthenticated" });
    setMessage("");
    returnRoute.current = null;
    navigate("/login");
    try {
      await request;
    } catch {
      setMessage(
        "Você saiu desta tela, mas não foi possível encerrar a sessão no servidor.",
      );
    }
  }

  if (auth.status === "loading")
    return (
      <main role="status" className="center-state">
        Carregando Duali…
      </main>
    );
  if (auth.status === "unavailable")
    return (
      <main className="center-state">
        <section className="panel">
          <h1>Duali indisponível</h1>
          <Notice text={auth.message} error />
          <button ref={retryButton} onClick={loadSession}>
            Tentar novamente
          </button>
        </section>
      </main>
    );
  if (auth.status === "unauthenticated")
    return (
      <div className="login">
        <section className="panel">
          <div className="brand">
            duali<span>GESTÃO DE PESSOAS</span>
          </div>
          <h1>Bem-vindo de volta</h1>
          <p>Entre para acompanhar sua operação.</p>
          <form onSubmit={(e) => void login(e)}>
            <Notice text={message} error />
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
  const user = auth.user;
  const go = (next: string) => {
    navigate(next);
    setDrawer(false);
    setFlyoutGroup(null);
  };
  return (
    <div className={`shell ${collapsed ? "sidebar-collapsed" : ""}`}>
      {drawer && (
        <button
          className="drawer-backdrop"
          aria-label="Fechar menu"
          onClick={() => setDrawer(false)}
        />
      )}
      <aside className={drawer ? "drawer-open" : ""}>
        <div className="sidebar-head">
          <div className="brand">
            duali<span>GESTÃO DE PESSOAS</span>
          </div>
          <button
            className="icon-button collapse-button"
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            onClick={() => setCollapsed(!collapsed)}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
          <button
            className="icon-button drawer-close"
            aria-label="Fechar menu"
            onClick={() => setDrawer(false)}
          >
            <X size={19} />
          </button>
        </div>
        <nav>
          {primary.map(([route, label, Icon]) => (
            <button
              key={route}
              title={label}
              className={
                path === route || (route !== "/app" && path.startsWith(route))
                  ? "active"
                  : ""
              }
              onClick={() => go(route)}
            >
              <span className="nav-icon" aria-hidden="true">
                <Icon size={19} />
              </span>
              <span className="nav-label">{label}</span>
            </button>
          ))}
          <div className="nav-divider" />
          {grouped.map((group) => {
            const open = collapsed
              ? flyoutGroup === group.title
              : openGroups.has(group.title);
            return (
              <section className="nav-group" key={group.title}>
                <button
                  className="nav-group-toggle"
                  title={group.title}
                  aria-expanded={open}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (collapsed)
                      setFlyoutGroup(
                        flyoutGroup === group.title ? null : group.title,
                      );
                    else
                      setOpenGroups((current) => {
                        const next = new Set(current);
                        if (next.has(group.title)) next.delete(group.title);
                        else next.add(group.title);
                        return next;
                      });
                  }}
                >
                  <span className="nav-icon" aria-hidden="true">
                    <group.icon size={19} />
                  </span>
                  <span className="nav-label nav-group-title">
                    {group.title}
                  </span>
                  <span className="nav-label">{open ? "−" : "+"}</span>
                </button>
                {open && (
                  <div className="nav-items">
                    {group.items.map(([route, label, Icon]) => (
                      <button
                        key={route}
                        title={label}
                        className={path === route ? "active" : ""}
                        onClick={() => go(route)}
                      >
                        <span className="nav-icon" aria-hidden="true">
                          <Icon size={17} />
                        </span>
                        <span className="nav-label">{label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </section>
            );
          })}
        </nav>
        <div className="account">
          <div>
            <strong>{String(user.nome)}</strong>
            <span>Administrador</span>
          </div>
          <button className="secondary" onClick={() => void logout()}>
            Sair
          </button>
        </div>
      </aside>
      <main>
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            aria-label="Abrir menu"
            onClick={() => setDrawer(true)}
          >
            <Menu size={20} />
          </button>
          <span>{routeTitle(path)}</span>
          <div className="top-account">
            <span>{String(user.nome)}</span>
            <span className="online-dot" title="Sessão ativa" />
          </div>
        </header>
        <Notice text={message} error />
        <RouteContent path={path} navigate={navigate} />
        <Toaster richColors position="top-right" />
      </main>
    </div>
  );
}
function routeTitle(path: string) {
  if (/^\/app\/pessoas\//.test(path)) return "Pessoas / Perfil";
  return (
    [
      ...primary,
      ...grouped.flatMap((group) =>
        group.items.map(([route, label]) => [route, label, ""] as const),
      ),
    ].find(([route]) => route === path)?.[1] ?? "Duali"
  );
}
function RouteContent({
  path,
  navigate,
}: {
  path: string;
  navigate: (path: string) => void;
}) {
  if (path === "/app/pessoas/nova") return <PeoplePage navigate={navigate} />;
  const editPerson = path.match(/^\/app\/pessoas\/([0-9a-f-]+)\/editar$/i);
  if (editPerson)
    return <PersonEditor id={editPerson[1]!} navigate={navigate} />;
  const person = path.match(/^\/app\/pessoas\/([0-9a-f-]+)$/i);
  if (person)
    return (
      <PersonProfile key={person[1]} id={person[1]!} navigate={navigate} />
    );
  const registry = path.match(
    /^\/app\/cadastros\/(unidades|equipes|instituicoes|fornecedores)\/([0-9a-f-]+)$/i,
  );
  if (registry)
    return (
      <RegistryDetail
        key={`${registry[1]}-${registry[2]}`}
        resource={registry[1]!}
        id={registry[2]!}
        navigate={navigate}
      />
    );
  if (path === "/app") return <Dashboard navigate={navigate} />;
  if (path === "/app/pendencias") return <PendingsPage navigate={navigate} />;
  if (path === "/app/pessoas") return <PeoplePage navigate={navigate} />;
  if (path === "/app/estagiarios") return <InternsPage navigate={navigate} />;
  if (path === "/app/ferias") return <LeavePage navigate={navigate} />;
  if (path === "/app/beneficios") return <BenefitsPage navigate={navigate} />;
  if (path === "/app/beneficios/fechamento")
    return <BenefitClosingPage navigate={navigate} />;
  if (path === "/app/importacoes") return <Imports />;
  if (path === "/app/relatorios") return <Reporting />;
  if (path === "/app/admin/auditoria") return <Audit />;
  const resource = auxiliary[path],
    screen = screens.find((item) => item.path === resource);
  if (screen)
    return (
      <Records
        key={resource}
        screen={screen}
        {...(resource !== "usuarios" && resource !== "configuracoes-beneficios"
          ? {
              onOpen: (row: Row) =>
                navigate(`/app/cadastros/${resource}/${String(row.id)}`),
            }
          : {})}
      />
    );
  return (
    <section className="panel">
      <h1>Página não encontrada</h1>
      <button onClick={() => navigate("/app")}>Voltar à visão geral</button>
    </section>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
