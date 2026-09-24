import { BenefitRegistryPage } from "./features/benefits/BenefitRegistryPage";
import { BenefitSummaryPage } from "./features/benefits/BenefitSummaryPage";
import React, { useEffect, useRef, useState, type FormEvent } from "react";
import dualiBrand from "./assets/duali-brand.png";
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
  BenefitLaunchesPage,
  RegistryDetail,
} from "./Operational";
import { PendingsPage } from "./features/pendings/PendingsPage";
import { BenefitClosingPage } from "./features/benefits/BenefitClosingPage";
import { BenefitAcquisitionPage } from "./features/benefits/BenefitAcquisitionPage";
import { MonthlyOrderPage } from "./features/benefits/MonthlyOrderPage";
import { Toaster } from "sonner";
import { AppShell } from "./AppShell";
import { requestNavigation } from "./navigationGuard";
import "./style.css";
import "./styles/foundations/index.css";
import "./styles/shell/index.css";
import "./styles/components/index.css";
import "./styles/pages/people.css";
import "./styles/pages/person-create.css";
import "./styles/pages/benefits.css";
import "./styles/pages/vacations.css";
import { PersonCreatePage } from "./features/people/create/PersonCreatePage";
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
    requestNavigation(next, () => {
      routerNavigate(next);
      window.scrollTo({ top: 0 });
    });
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
    [senha, setSenha] = useState("");
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
    if (path === "/app/estagiarios" && !window.location.search) {
      const query = new URLSearchParams(window.location.search);
      query.set("tipo", "ESTAGIO");
      navigate(`/app/pessoas?${query}`);
    }
  }, [currentRoute]);

  useEffect(() => {
    if (auth.status === "unavailable") retryButton.current?.focus();
  }, [auth.status]);

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
            <img src={dualiBrand} alt="Duali Gestão de Pessoas" />
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
  return (
    <AppShell
      path={path}
      userName={String(user.nome)}
      navigate={navigate}
      logout={() => void logout()}
    >
      <Notice text={message} error />
      <RouteContent path={path} navigate={navigate} />
      <Toaster richColors position="top-right" />
    </AppShell>
  );
}
function RouteContent({
  path,
  navigate,
}: {
  path: string;
  navigate: (path: string) => void;
}) {
  if (path === "/app/pessoas/nova")
    return <PersonCreatePage navigate={navigate} />;
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
  if (path === "/app/beneficios")
    return <BenefitSummaryPage navigate={navigate} />;
  if (path === "/app/beneficios/lancamentos")
    return <BenefitLaunchesPage navigate={navigate} />;
  if (path === "/app/beneficios/fechamento")
    return <BenefitClosingPage navigate={navigate} />;
  if (
    path === "/app/beneficios/aquisicao" ||
    path === "/app/beneficios/lote" ||
    (path === "/app/beneficios/lancamentos" &&
      new URLSearchParams(location.search).has("novo"))
  )
    return <MonthlyOrderPage navigate={navigate} />;
  if (path === "/app/beneficios/competencias")
    return <BenefitAcquisitionPage navigate={navigate} />;
  if (path === "/app/importacoes") return <Imports />;
  if (path === "/app/relatorios") return <Reporting />;
  if (path === "/app/admin/auditoria") return <Audit />;
  if (path === "/app/cadastros/configuracoes-beneficios")
    return <BenefitRegistryPage />;
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
