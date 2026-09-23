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
import type { LucideIcon } from "lucide-react";
import { ThemeCycleButton, UserMenu } from "@/components/user-menu";
import { useSlaAlertCount } from "@/lib/demandas/use-sla-alert-count";

// Fonte única da navegação da org — usada aqui e no OrgMobileNav.
// Adicionar uma rota nova (ex: módulo financeiro) é mexer só nesta lista.
// `adminOnly` esconde o item de quem não é owner/admin (flag vem do layout).
export type OrgNavItem = {
  segment: string;
  label: string;
  icon: LucideIcon;
  adminOnly?: boolean;
};

export const ORG_NAV_ITEMS: OrgNavItem[] = [
  { segment: "fila", label: "Fila", icon: Inbox },
  { segment: "alertas", label: "Alertas SLA", icon: AlertTriangle },
  { segment: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { segment: "equipe", label: "Equipe", icon: Users },
  { segment: "configuracoes", label: "Configurações", icon: Settings, adminOnly: true },
];

type OrgSidebarProps = {
  slug: string;
  activePath: string;
  collapsed: boolean;
  onToggle: () => void;
  newCount: number;
  user: { name: string; email: string | null } | null;
  roleLabel: string;
  isOwnerOrAdmin: boolean;
  onSignOut: () => void;
};

/**
 * Sidebar desktop da org — redesign "Umbler uTalk": itens com cantos
 * arredondados generosos (rounded-xl), hover/active em transparência suave
 * sobre a sidebar aveludada, badges em pílula e ícones com micro-scaling
 * no hover. Sem bordas duras: a separação vem do fundo e das sombras.
 * Badges operacionais: Fila (novas mensagens, primary) e Alertas SLA
 * (demandas paradas, destructive) — pill quando expandido, dot quando
 * recolhido; zero = não renderiza (interface limpa).
 */
export function OrgSidebar({
  slug,
  activePath,
  collapsed,
  onToggle,
  newCount,
  user,
  roleLabel,
  isOwnerOrAdmin,
  onSignOut,
}: OrgSidebarProps) {
  const slaCount = useSlaAlertCount(slug);
  const visibleItems = ORG_NAV_ITEMS.filter((n) => !n.adminOnly || isOwnerOrAdmin);
  return (
    <aside className="hidden sm:flex h-screen flex-col justify-between overflow-hidden sticky top-0 left-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border/40">
      {!collapsed && (
        <div className="shrink-0 pt-5 pb-2 px-4">
          <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/45">
            Operação
          </div>
        </div>
      )}
      <nav className="flex-1 overflow-y-auto space-y-1 px-3 py-1">
        {visibleItems.map((n) => {
          const to = `/app/o/${slug}/${n.segment}`;
          const active = activePath.startsWith(to);
          const Icon = n.icon;
          const isFila = n.segment === "fila";
          const isAlertas = n.segment === "alertas";
          return (
            <Link
              key={n.segment}
              to={to}
              preload="intent"
              title={
                isAlertas && slaCount > 0
                  ? `${n.label} (${slaCount} parada${slaCount > 1 ? "s" : ""})`
                  : n.label
              }
              className={`group relative flex items-center gap-3 rounded-xl py-2.5 text-[13px] font-medium transition-all duration-150 ${
                collapsed ? "justify-center px-2" : "px-3"
              } ${
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-sm"
                  : "text-sidebar-foreground/75 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              }`}
            >
              {active && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-r-full bg-sidebar-primary" />
              )}
              <Icon
                className={`h-[18px] w-[18px] shrink-0 transition-transform duration-150 group-hover:scale-105 ${
                  active
                    ? "text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/65 group-hover:text-sidebar-foreground"
                }`}
                strokeWidth={1.9}
              />
              {!collapsed && <span className="truncate">{n.label}</span>}
              {/* Badge da Fila: mensagens novas (primary) */}
              {isFila && newCount > 0 && !collapsed && (
                <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-sidebar-primary px-2 py-0.5 text-[10px] font-bold tabular-nums text-sidebar-primary-foreground">
                  <Bell className="h-3 w-3" /> {newCount}
                </span>
              )}
              {isFila && newCount > 0 && collapsed && (
                <span className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-sidebar-primary" />
              )}
              {/* Badge de Alertas SLA: demandas paradas (destructive) */}
              {isAlertas && slaCount > 0 && !collapsed && (
                <span
                  aria-label={`${slaCount} demandas paradas`}
                  className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold tabular-nums text-destructive-foreground shadow-sm transition-colors"
                >
                  {slaCount}
                </span>
              )}
              {isAlertas && slaCount > 0 && collapsed && (
                <span
                  aria-label={`${slaCount} demandas paradas`}
                  className="absolute top-1.5 right-1.5 h-1.5 w-1.5 rounded-full bg-destructive"
                />
              )}
            </Link>
          );
        })}
      </nav>
      {/* Footer: único lugar com o toggle de collapse — não existe mais um
          segundo botão no topo. Fica sempre ao lado do ThemeCycleButton. */}
      <div className="mt-auto shrink-0 border-t border-sidebar-border/60 bg-sidebar p-2.5">
        <div className={`flex items-center gap-1.5 ${collapsed ? "flex-col" : ""}`}>
          <div className="min-w-0 flex-1">
            <UserMenu
              name={user?.name ?? "Usuário"}
              email={user?.email}
              role={roleLabel}
              collapsed={collapsed}
              settingsTo={isOwnerOrAdmin ? `/app/o/${slug}/configuracoes` : undefined}
              onSignOut={onSignOut}
            />
          </div>
          <div className={`flex shrink-0 items-center ${collapsed ? "flex-col gap-1" : "gap-0.5"}`}>
            <ThemeCycleButton />
            <button
              onClick={onToggle}
              aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
              title={collapsed ? "Expandir menu" : "Recolher menu"}
              className="grid place-items-center h-8 w-8 rounded-xl text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}