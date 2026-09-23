import { useEffect, useState, type ReactNode } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import * as Tooltip from "@radix-ui/react-tooltip";
import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  ClipboardList,
  Database,
  FileChartColumn,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings2,
  ShieldCheck,
  Users,
  UserRoundCog,
  WalletCards,
  X,
} from "lucide-react";
import dualiMark from "./assets/duali-mark.png";

type NavigationItem = {
  route: string;
  label: string;
  icon: LucideIcon;
};

type NavigationGroup = {
  title: string;
  icon: LucideIcon;
  items: NavigationItem[];
};

const primary: NavigationItem[] = [
  { route: "/app", label: "Visão geral", icon: LayoutDashboard },
  { route: "/app/pendencias", label: "Pendências", icon: CircleAlert },
  { route: "/app/pessoas", label: "Pessoas", icon: Users },
];

const grouped: NavigationGroup[] = [
  {
    title: "Operação",
    icon: BriefcaseBusiness,
    items: [
      { route: "/app/ferias", label: "Férias", icon: CalendarDays },
      { route: "/app/beneficios", label: "Benefícios", icon: WalletCards },
    ],
  },
  {
    title: "Dados",
    icon: Database,
    items: [
      { route: "/app/importacoes", label: "Importações", icon: ClipboardList },
      { route: "/app/relatorios", label: "Relatórios", icon: FileChartColumn },
    ],
  },
  {
    title: "Cadastros",
    icon: Building2,
    items: [
      { route: "/app/cadastros/unidades", label: "Unidades", icon: Building2 },
      { route: "/app/cadastros/equipes", label: "Equipes", icon: Users },
      {
        route: "/app/cadastros/instituicoes",
        label: "Instituições",
        icon: GraduationCap,
      },
      {
        route: "/app/cadastros/fornecedores",
        label: "Fornecedores",
        icon: WalletCards,
      },
      {
        route: "/app/cadastros/configuracoes-beneficios",
        label: "Benefícios",
        icon: Settings2,
      },
    ],
  },
  {
    title: "Administração",
    icon: ShieldCheck,
    items: [
      { route: "/app/admin/usuarios", label: "Usuários", icon: UserRoundCog },
      { route: "/app/admin/auditoria", label: "Auditoria", icon: BarChart3 },
    ],
  },
];

function isCurrent(path: string, route: string) {
  return path === route || (route !== "/app" && path.startsWith(`${route}/`));
}

type SidebarItemProps = NavigationItem & {
  path: string;
  collapsed: boolean;
  onNavigate: (route: string) => void;
  nested?: boolean;
};

export function SidebarItem({
  route,
  label,
  icon: Icon,
  path,
  collapsed,
  onNavigate,
  nested = false,
}: SidebarItemProps) {
  const active = isCurrent(path, route);
  const button = (
    <button
      type="button"
      className={`app-sidebar-item${active ? " is-active" : ""}${nested ? " is-nested" : ""}`}
      aria-current={active ? "page" : undefined}
      aria-label={collapsed ? label : undefined}
      onClick={() => onNavigate(route)}
    >
      <Icon
        className="app-sidebar-icon"
        size={19}
        strokeWidth={1.8}
        aria-hidden="true"
      />
      <span className="app-sidebar-label">{label}</span>
    </button>
  );

  if (!collapsed) return button;
  return (
    <Tooltip.Root delayDuration={300}>
      <Tooltip.Trigger asChild>{button}</Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          className="app-shell-tooltip"
          side="right"
          sideOffset={10}
        >
          {label}
          <Tooltip.Arrow className="app-shell-tooltip-arrow" />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

type SidebarGroupProps = NavigationGroup & {
  index: number;
  path: string;
  collapsed: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: (route: string) => void;
};

export function SidebarGroup({
  title,
  icon: Icon,
  items,
  index,
  path,
  collapsed,
  open,
  onOpenChange,
  onNavigate,
}: SidebarGroupProps) {
  const regionId = `app-sidebar-group-${index}`;
  const hasCurrent = items.some((item) => isCurrent(path, item.route));

  if (collapsed) {
    return (
      <DropdownMenu.Root open={open} onOpenChange={onOpenChange} modal={false}>
        <Tooltip.Root delayDuration={300}>
          <Tooltip.Trigger asChild>
            <DropdownMenu.Trigger asChild>
              <button
                type="button"
                className={`app-sidebar-group-trigger is-collapsed${hasCurrent ? " has-current" : ""}`}
                aria-label={title}
              >
                <Icon
                  className="app-sidebar-icon"
                  size={19}
                  strokeWidth={1.8}
                  aria-hidden="true"
                />
              </button>
            </DropdownMenu.Trigger>
          </Tooltip.Trigger>
          <Tooltip.Portal>
            <Tooltip.Content
              className="app-shell-tooltip"
              side="right"
              sideOffset={10}
            >
              {title}
              <Tooltip.Arrow className="app-shell-tooltip-arrow" />
            </Tooltip.Content>
          </Tooltip.Portal>
        </Tooltip.Root>
        <DropdownMenu.Portal>
          <DropdownMenu.Content
            className="app-sidebar-flyout"
            side="right"
            align="start"
            sideOffset={12}
            collisionPadding={12}
          >
            <DropdownMenu.Label className="app-sidebar-flyout-title">
              {title}
            </DropdownMenu.Label>
            {items.map((item) => {
              const ItemIcon = item.icon;
              const active = isCurrent(path, item.route);
              return (
                <DropdownMenu.Item
                  key={item.route}
                  className={`app-sidebar-flyout-item${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  onSelect={() => onNavigate(item.route)}
                >
                  <ItemIcon size={18} strokeWidth={1.8} aria-hidden="true" />
                  <span>{item.label}</span>
                </DropdownMenu.Item>
              );
            })}
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    );
  }

  return (
    <section className={`app-sidebar-group${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="app-sidebar-group-trigger"
        aria-expanded={open}
        aria-controls={regionId}
        onClick={() => onOpenChange(!open)}
      >
        <Icon
          className="app-sidebar-icon"
          size={18}
          strokeWidth={1.8}
          aria-hidden="true"
        />
        <span className="app-sidebar-group-title">{title}</span>
        <ChevronDown
          className="app-sidebar-chevron"
          size={15}
          aria-hidden="true"
        />
      </button>
      <div
        id={regionId}
        className={`app-sidebar-group-region${open ? " is-open" : ""}`}
        aria-hidden={!open}
      >
        <div className="app-sidebar-group-items">
          {items.map((item) => (
            <SidebarItem
              key={item.route}
              {...item}
              path={path}
              collapsed={false}
              nested
              onNavigate={onNavigate}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

type SidebarProps = {
  path: string;
  userName: string;
  collapsed: boolean;
  mobile?: boolean;
  openGroups: Set<string>;
  flyoutGroup: string | null;
  onGroupChange: (title: string, open: boolean) => void;
  onFlyoutChange: (title: string | null) => void;
  onNavigate: (route: string) => void;
  onToggleCollapsed: () => void;
  onLogout: () => void;
  onCloseMobile?: () => void;
};

export function Sidebar({
  path,
  userName,
  collapsed,
  mobile = false,
  openGroups,
  flyoutGroup,
  onGroupChange,
  onFlyoutChange,
  onNavigate,
  onToggleCollapsed,
  onLogout,
  onCloseMobile,
}: SidebarProps) {
  const visuallyCollapsed = collapsed && !mobile;
  return (
    <div className="app-sidebar-layout">
      <div className="app-sidebar-head">
        <div className="app-sidebar-brand">
          <img src={dualiMark} alt="" aria-hidden="true" />
          {!visuallyCollapsed && <strong>Duali</strong>}
        </div>
        {!mobile && (
          <button
            type="button"
            className="app-shell-icon-button app-sidebar-collapse"
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            onClick={onToggleCollapsed}
          >
            {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
          </button>
        )}
        {mobile && (
          <Dialog.Close asChild>
            <button
              type="button"
              className="app-shell-icon-button app-drawer-close"
              aria-label="Fechar menu"
              onClick={onCloseMobile}
            >
              <X size={19} />
            </button>
          </Dialog.Close>
        )}
      </div>

      <nav className="app-sidebar-nav" aria-label="Navegação principal">
        {primary.map((item) => (
          <SidebarItem
            key={item.route}
            {...item}
            path={path}
            collapsed={visuallyCollapsed}
            onNavigate={onNavigate}
          />
        ))}
        <div className="app-sidebar-divider" aria-hidden="true" />
        {grouped.map((group, index) => (
          <SidebarGroup
            key={group.title}
            {...group}
            index={index}
            path={path}
            collapsed={visuallyCollapsed}
            open={
              visuallyCollapsed
                ? flyoutGroup === group.title
                : openGroups.has(group.title)
            }
            onOpenChange={(open) => {
              if (visuallyCollapsed) onFlyoutChange(open ? group.title : null);
              else onGroupChange(group.title, open);
            }}
            onNavigate={onNavigate}
          />
        ))}
      </nav>

      <div className="app-sidebar-account">
        {!visuallyCollapsed && (
          <div className="app-sidebar-account-copy">
            <strong>{userName}</strong>
            <span>Administrador</span>
          </div>
        )}
        {visuallyCollapsed ? (
          <Tooltip.Root delayDuration={300}>
            <Tooltip.Trigger asChild>
              <button
                type="button"
                className="app-sidebar-logout"
                aria-label="Sair"
                onClick={onLogout}
              >
                <LogOut size={18} strokeWidth={1.8} aria-hidden="true" />
              </button>
            </Tooltip.Trigger>
            <Tooltip.Portal>
              <Tooltip.Content
                className="app-shell-tooltip"
                side="right"
                sideOffset={10}
              >
                Sair
                <Tooltip.Arrow className="app-shell-tooltip-arrow" />
              </Tooltip.Content>
            </Tooltip.Portal>
          </Tooltip.Root>
        ) : (
          <button
            type="button"
            className="app-sidebar-logout"
            onClick={onLogout}
          >
            <LogOut size={17} strokeWidth={1.8} aria-hidden="true" />
            <span>Sair</span>
          </button>
        )}
      </div>
    </div>
  );
}

type TopbarProps = {
  userName: string;
};

export function Topbar({ userName }: TopbarProps) {
  return (
    <header className="app-topbar">
      <Dialog.Trigger asChild>
        <button
          type="button"
          className="app-shell-icon-button app-mobile-menu"
          aria-label="Abrir menu"
        >
          <Menu size={20} />
        </button>
      </Dialog.Trigger>
      <span className="app-topbar-context">
        <strong>Duali</strong>
        <span>Gestão de Pessoas</span>
      </span>
      <div className="app-topbar-account">
        <span>{userName}</span>
        <span className="app-online-dot" title="Sessão ativa" />
      </div>
    </header>
  );
}

type AppShellProps = {
  path: string;
  userName: string;
  navigate: (route: string) => void;
  logout: () => void;
  children: ReactNode;
};

export function AppShell({
  path,
  userName,
  navigate,
  logout,
  children,
}: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const [flyoutGroup, setFlyoutGroup] = useState<string | null>(null);

  useEffect(() => setFlyoutGroup(null), [path]);

  const go = (route: string) => {
    navigate(route);
    setDrawerOpen(false);
    setFlyoutGroup(null);
  };

  const changeGroup = (title: string, open: boolean) => {
    setOpenGroups((current) => {
      const next = new Set(current);
      if (open) next.add(title);
      else next.delete(title);
      return next;
    });
  };

  const sidebarProps = {
    path,
    userName,
    collapsed,
    openGroups,
    flyoutGroup,
    onGroupChange: changeGroup,
    onFlyoutChange: setFlyoutGroup,
    onNavigate: go,
    onToggleCollapsed: () => {
      setCollapsed((current) => !current);
      setFlyoutGroup(null);
    },
    onLogout: logout,
  };

  return (
    <Tooltip.Provider>
      <Dialog.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <div className={`shell app-shell${collapsed ? " is-collapsed" : ""}`}>
          <aside className="app-sidebar" aria-label="Menu lateral">
            <Sidebar {...sidebarProps} />
          </aside>
          <main className="app-shell-main">
            <Topbar userName={userName} />
            <div className="app-shell-content">{children}</div>
          </main>
        </div>
        <Dialog.Portal>
          <Dialog.Overlay className="app-drawer-backdrop" />
          <Dialog.Content className="app-drawer" aria-describedby={undefined}>
            <Dialog.Title className="app-shell-visually-hidden">
              Navegação principal
            </Dialog.Title>
            <Sidebar
              {...sidebarProps}
              mobile
              collapsed={false}
              flyoutGroup={null}
              onCloseMobile={() => setDrawerOpen(false)}
            />
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </Tooltip.Provider>
  );
}
