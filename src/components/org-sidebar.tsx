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

// Fonte única da navegação da org — usada aqui e no OrgMobileNav.
// Adicionar uma rota nova (ex: módulo financeiro) é mexer só nesta lista.
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
    <aside className="hidden sm:flex h-screen flex-col justify-between overflow-hidden sticky top-0 left-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border/60">
      {!collapsed && (
        <div className="shrink-0 pt-4 pb-2 px-4">
          <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/45">
            Operação
          </div>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto space-y-0.5 px-2 py-1">
        {ORG_NAV_ITEMS.map((n) => {
          const to = `/app/o/${slug}/${n.segment}`;
          const active = activePath.startsWith(to);
          const Icon = n.icon;
          return (
            <Link
              key={n.segment}
              to={to}
              preload="intent"
              title={n.label}
              className={`group relative flex items-center gap-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${collapsed ? "justify-center px-2" : "px-3"} ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"}`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-r-full bg-sidebar-primary" />
              )}
              <Icon
                className={`h-[17px] w-[17px] shrink-0 ${active ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/65 group-hover:text-sidebar-foreground"}`}
                strokeWidth={1.9}
              />
              {!collapsed && n.label}
              {n.label === "Fila" && newCount > 0 && !collapsed && (
                <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
                  <Bell className="h-3 w-3" /> {newCount}
                </span>
              )}
              {n.label === "Fila" && newCount > 0 && collapsed && (
                <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-sidebar-primary" />
              )}
            </Link>
          );
        })}
      </nav>

      {/* Footer: único lugar com o toggle de collapse — não existe mais um
          segundo botão no topo. Fica sempre ao lado do ThemeCycleButton. */}
      <div className="mt-auto shrink-0 border-t border-sidebar-border bg-sidebar p-2">
        <div className={`flex items-center gap-1.5 ${collapsed ? "flex-col" : ""}`}>
          <div className="min-w-0 flex-1">
            <UserMenu
              name={user?.name ?? "Usuário"}
              email={user?.email}
              role={roleLabel}
              collapsed={collapsed}
              settingsTo={`/app/o/${slug}/configuracoes`}
              onSignOut={onSignOut}
            />
          </div>
          <div className={`flex shrink-0 items-center ${collapsed ? "flex-col gap-1" : "gap-0.5"}`}>
            <ThemeCycleButton />
            <button
              onClick={onToggle}
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
              title={collapsed ? "Expandir menu" : "Recolher menu"}
              className="grid place-items-center h-8 w-8 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}
