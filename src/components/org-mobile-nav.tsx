/**
 * OrgMobileNav — barra de navegação inferior para mobile (sm:hidden).
 * ARQUITETURA APP-LIKE (camada 4 do lockup mobile):
 * • z-50 + backdrop-blur-md: sempre no topo das camadas, vidro fosco.
 * • 4 abas de operação (Fila, Alertas, Dashboard, Equipe) — o perfil e as
 *   Configurações SUBIRAM para o MobileAppHeader (camada 1), então a
 *   bottom nav fica leve e fluida, sem 5ª coluna apertada.
 * • Badges: Fila = mensagens novas (newCount, pill primary); Alertas =
 *   demandas paradas (slaCount, pill destructive). Zero = não renderiza.
 * • active:scale-95 transition-transform: feedback tátil de app nativo.
 */
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Inbox, LayoutDashboard, Users } from "lucide-react";
import { useSlaAlertCount } from "@/lib/demandas/use-sla-alert-count";

// Itens fixos da bottom nav — 4 de alta recorrência.
const BOTTOM_NAV_ITEMS = [
  { segment: "fila", label: "Fila", icon: Inbox },
  { segment: "alertas", label: "Alertas", icon: AlertTriangle },
  { segment: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { segment: "equipe", label: "Equipe", icon: Users },
] as const;

type OrgMobileNavProps = {
  slug: string;
  activePath: string;
  newCount: number;
};

export function OrgMobileNav({ slug, activePath, newCount }: OrgMobileNavProps) {
  const slaCount = useSlaAlertCount(slug);
  return (
    <nav
      aria-label="Navegação principal"
      className={
        // Posicionamento e camadas
        "sm:hidden fixed bottom-0 inset-x-0 z-50 " +
        // Glassmorphism: fundo translúcido + blur + borda superior sutil
        "bg-sidebar/85 backdrop-blur-md border-t border-sidebar-border/60 " +
        // Safe-area iOS embaixo + respiro
        "pb-[env(safe-area-inset-bottom,0px)] " +
        // Layout: 4 colunas iguais
        "grid grid-cols-4 gap-0.5 px-1 py-1"
      }
    >
      {BOTTOM_NAV_ITEMS.map(({ segment, label, icon: Icon }) => {
        const to = `/app/o/${slug}/${segment}`;
        const active = activePath.startsWith(to);
        const isAlertas = segment === "alertas";
        const isFila = segment === "fila";
        return (
          <Link
            key={segment}
            to={to}
            preload="intent"
            className={
              // Layout do item
              "flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl" +
              // Micro-interação de toque nativa
              " transition-all duration-150 active:scale-95" +
              // Estado ativo vs inativo
              (active
                ? " bg-sidebar-accent text-sidebar-accent-foreground"
                : " text-sidebar-foreground/55 hover:text-sidebar-foreground hover:bg-sidebar-accent/40")
            }
          >
            {/* Ícone com badges operacionais */}
            <span className="relative">
              <Icon
                className={`h-[20px] w-[20px] transition-transform duration-150 ${active ? "scale-110" : ""}`}
                strokeWidth={active ? 2.2 : 1.8}
              />
              {isFila && newCount > 0 && (
                <span
                  aria-label={`${newCount} mensagens novas`}
                  className="absolute -right-2 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-sidebar-primary px-1 text-[9px] font-bold tabular-nums text-sidebar-primary-foreground shadow-sm"
                >
                  {newCount > 99 ? "99+" : newCount}
                </span>
              )}
              {isAlertas && slaCount > 0 && (
                <span
                  aria-label={`${slaCount} demandas paradas`}
                  className="absolute -right-2 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold tabular-nums text-destructive-foreground shadow-sm"
                >
                  {slaCount > 99 ? "99+" : slaCount}
                </span>
              )}
            </span>
            <span className="text-[9px] font-medium truncate max-w-full leading-none">
              {label}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
