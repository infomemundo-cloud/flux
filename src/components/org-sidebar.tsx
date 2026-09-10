import { Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Bell,
  Inbox,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Users,
} from "lucide-react";
import { ThemeCycleButton, UserMenu } from "@/components/user-menu";

export const ORG_NAV_ITEMS = [
  { segment: "fila", label: "Fila", icon: Inbox },
  { segment: "alertas", label: "Alertas SLA", icon: AlertTriangle },
  { segment: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { segment: "equipe", label: "Equipe", icon: Users },
  { segment: "configuracoes", label: "Configurações", icon: Settings },
] as const;

type OrgSidebarProps = {
  slug: string;
  activePath: string;
  collapsed: boolean;
  onToggle: () => void;
  newCount: number;
  user: { name: string; email: string | null } | null;
  roleLabel: string;
  onSignOut: () => void;
};

export function OrgSidebar({
  slug,
  activePath,
  collapsed,
  onToggle,
  newCount,
  user,
  roleLabel,
  onSignOut,
}: OrgSidebarProps) {
  return (
    <aside
      className={`hidden sm:flex h-screen flex-col justify-between overflow-hidden sticky top-0 left-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border/60 transition-all ${
        collapsed ? "w-[68px] items-center px-0" : "w-[256px] px-0"
      }`}
    >
      {/* TOPO: Ações superiores */}
      <div className="w-full shrink-0 pt-3 pb-2 flex flex-col items-center justify-center gap-2">
        {collapsed ? (
          <>
            <button
              onClick={onToggle}
              aria-label="Expandir menu"
              title="Expandir menu"
              className="flex items-center justify-center h-8 w-8 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
            <ThemeCycleButton />
          </>
        ) : (
          <div className="w-full px-7 pb-1 text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/45">
            Operação
          </div>
        )}
      </div>

      {/* NAVEGAÇÃO */}
      <nav className="w-full flex-1 overflow-y-auto space-y-1 px-2 py-1">
        {ORG_NAV_ITEMS.map((n) => {
          const targetPath = `/app/o/${slug}/${n.segment}`;
          const active = activePath.startsWith(targetPath);
          const Icon = n.icon;
          return (
            <Link
              key={n.segment}
              to={targetPath}
              preload="intent"
              title={n.label}
              className={`group relative flex items-center gap-2.5 py-2.5 rounded-lg text-[13px] font-medium transition-colors w-full ${
                collapsed ? "justify-center px-0" : "px-3"
              } ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-r-full bg-sidebar-primary" />
              )}
              <Icon
                className={`h-[18px] w-[18px] shrink-0 ${
                  active
                    ? "text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/65 group-hover:text-sidebar-foreground"
                }`}
                strokeWidth={1.9}
              />
              {!collapsed && n.label}
              {n.label === "Fila" && newCount > 0 && !collapsed && (
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
                  <Bell className="h-3 w-3" /> {newCount}
                </span>
              )}
              {n.label === "Fila" && newCount > 0 && collapsed && (
                <span className="absolute top-1.5 right-3 h-2 w-2 rounded-full bg-sidebar-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* RODAPÉ */}
      <div className="w-full mt-auto shrink-0 border-t border-sidebar-border bg-sidebar p-2 flex flex-col items-center">
        <div
          className={`w-full flex items-center ${
            collapsed ? "justify-center" : "justify-between gap-1"
          }`}
        >
          <div className="flex items-center justify-center w-full min-w-0">
            <UserMenu
              name={user?.name ?? "Usuário"}
              email={user?.email}
              role={roleLabel}
              collapsed={collapsed}
              settingsTo={`/app/o/${slug}/configuracoes`}
              onSignOut={onSignOut}
            />
          </div>

          {!collapsed && (
            <div className="flex items-center gap-0.5">
              <ThemeCycleButton />
              <button
                onClick={onToggle}
                aria-label="Recolher menu"
                title="Recolher menu"
                className="flex items-center justify-center h-8 w-8 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground transition-colors"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
