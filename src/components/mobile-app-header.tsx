import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { FlxMark } from "@/components/flx-mark";
import { UserMenu } from "@/components/user-menu";
import { useSlaAlertCount } from "@/lib/demandas/use-sla-alert-count";

/**
 * MobileAppHeader — camada 1 do lockup mobile (a barra azul de marca do
 * anúncio): marca + org à esquerda; sino de Alertas SLA (com badge) e
 * perfil à direita. O perfil/configurações SOBEM pra cá, e a bottom nav
 * fica só com as 4 abas de operação (mais leve e fluida).
 *
 * Sticky dentro do scroller do <main> (gruda no topo ao rolar);
 * safe-area iOS respeitada no topo; some em sm+ (desktop usa o sidebar).
 * Zero query nova: o badge reusa useSlaAlertCount (cache compartilhado
 * com sidebar e bottom nav).
 */
export function MobileAppHeader({
  slug,
  orgName,
  user,
  roleLabel,
  isOwnerOrAdmin,
  onSignOut,
}: {
  slug: string;
  orgName: string;
  user: { name: string; email: string | null } | null;
  roleLabel: string;
  isOwnerOrAdmin: boolean;
  onSignOut: () => void;
}) {
  const slaCount = useSlaAlertCount(slug);
  return (
    <header className="sm:hidden sticky top-0 z-40 border-b border-sidebar-border/40 bg-sidebar/95 backdrop-blur-md text-sidebar-foreground pt-[env(safe-area-inset-top,0px)]">
      <div className="flex h-12 items-center gap-2 px-3">
        {/* Marca + org (volta pra fila ao tocar) */}
        <Link
          to="/app/o/$slug/fila"
          params={{ slug }}
          className="flex min-w-0 flex-1 items-center gap-2"
        >
          <FlxMark tone="mono" className="h-6 w-auto shrink-0 text-white drop-shadow-sm" />
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-bold leading-4 text-white">
              {orgName}
            </span>
            <span className="block truncate text-[9px] font-medium uppercase tracking-wider text-white/55">
              flxapp.cloud
            </span>
          </span>
        </Link>

        {/* Sino → Alertas SLA, com badge de demandas paradas */}
        <Link
          to="/app/o/$slug/alertas"
          params={{ slug }}
          title="Alertas de SLA"
          aria-label={`Alertas de SLA${slaCount ? ` (${slaCount})` : ""}`}
          className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white/80 transition hover:bg-white/10 hover:text-white active:scale-95"
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={2} />
          {slaCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold tabular-nums text-destructive-foreground shadow-sm">
              {slaCount > 9 ? "9+" : slaCount}
            </span>
          )}
        </Link>

        {/* Perfil (redondo, estilo app) — Configurações vive dentro do menu */}
        <div className="w-9 shrink-0">
          <UserMenu
            name={user?.name ?? "Usuário"}
            email={user?.email}
            role={roleLabel}
            collapsed
            round
            showTooltip={false}
            settingsTo={isOwnerOrAdmin ? `/app/o/${slug}/configuracoes` : undefined}
            onSignOut={onSignOut}
          />
        </div>
      </div>
    </header>
  );
}
