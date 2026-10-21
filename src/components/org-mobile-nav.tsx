/**
 * OrgMobileNav — Barra de navegação inferior para mobile (sm:hidden).
 *
 * ARQUITETURA APP-LIKE:
 * • z-50 + backdrop-blur-md: sempre no topo das camadas, com efeito de
 *   vidro fosco ao conteúdo passando por baixo.
 * • 4 itens principais (Fila, Alertas, Dashboard, Equipe) + UserMenu:
 *   layout 5 colunas fixas — Configurações fica dentro do UserMenu (settingsTo).
 * • active:scale-95 transition-transform: feedback tátil imediato como app nativo.
 * • Badge SLA em Alertas preservado com indicador de ponto quando count > 0.
 */
import { Link } from "@tanstack/react-router";
import { AlertTriangle, Inbox, LayoutDashboard, Users } from "lucide-react";
import { UserMenu } from "@/components/user-menu";
import { useSlaAlertCount } from "@/lib/demandas/use-sla-alert-count";

// Itens fixos da bottom nav — 4 de alta recorrência.
// Configurações (adminOnly, baixa frequência) fica no UserMenu.
const BOTTOM_NAV_ITEMS = [
  { segment: "fila",       label: "Fila",      icon: Inbox          },
  { segment: "alertas",    label: "Alertas",   icon: AlertTriangle  },
  { segment: "dashboard",  label: "Dashboard", icon: LayoutDashboard },
  { segment: "equipe",     label: "Equipe",    icon: Users           },
] as const;

type OrgMobileNavProps = {
  slug: string;
  activePath: string;
  user: { name: string; email: string | null } | null;
  roleLabel: string;
  isOwnerOrAdmin: boolean;
  onSignOut: () => void;
};

export function OrgMobileNav({
  slug,
  activePath,
  user,
  roleLabel,
  isOwnerOrAdmin,
  onSignOut,
}: OrgMobileNavProps) {
  const slaCount = useSlaAlertCount(slug);

  return (
    <nav
      aria-label="Navegação principal"
      className={
        // Posicionamento e camadas
        "sm:hidden fixed bottom-0 inset-x-0 z-50" +
        // Glassmorphism: fundo translúcido + blur + borda superior sutil
        " bg-sidebar/85 backdrop-blur-md border-t border-sidebar-border/60" +
        // Layout: 5 colunas iguais (4 links + user menu)
        " grid grid-cols-5 gap-0.5 px-1 py-1"
      }
    >
      {BOTTOM_NAV_ITEMS.map(({ segment, label, icon: Icon }) => {
        const to = `/app/o/${slug}/${segment}`;
        const active = activePath.startsWith(to);
        const isAlertas = segment === "alertas";

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
            {/* Ícone com badge de SLA em Alertas */}
            <span className="relative">
              <Icon
                className={`h-[20px] w-[20px] transition-transform duration-150 ${active ? "scale-110" : ""}`}
                strokeWidth={active ? 2.2 : 1.8}
              />
              {isAlertas && slaCount > 0 && (
                <span
                  aria-label={`${slaCount} demandas paradas`}
                  className={
                    "absolute -right-2 -top-1 inline-flex items-center justify-center" +
                    " h-4 min-w-4 rounded-full px-1" +
                    " bg-destructive text-destructive-foreground" +
                    " text-[9px] font-bold tabular-nums shadow-sm"
                  }
                >
                  {slaCount > 99 ? "99+" : slaCount}
                </span>
              )}
            </span>

            {/* Label — escala de fonte menor para caber em 5 colunas */}
            <span className="text-[9px] font-medium truncate max-w-full leading-none">
              {label}
            </span>
          </Link>
        );
      })}

      {/* UserMenu — 5ª coluna, acesso a Perfil + Configurações (via settingsTo) */}
      <div className="flex items-center justify-center py-1.5">
        <UserMenu
          name={user?.name ?? "Usuário"}
          email={user?.email}
          role={roleLabel}
          collapsed
          showTooltip={false}
          settingsTo={isOwnerOrAdmin ? `/app/o/${slug}/configuracoes` : undefined}
          onSignOut={onSignOut}
        />
      </div>
    </nav>
  );
}