import { Link } from "@tanstack/react-router";
import { Bell } from "lucide-react";
import { FlxMark } from "@/components/flx-mark";
import { UserMenu } from "@/components/user-menu";

/**
 * MobileAppHeader — camada 1 do lockup mobile (barra azul de marca).
 * SINO = NOVAS DEMANDAS (newCount), o MESMO sinal do desktop (badge da
 * Fila + toast): toca → abre a Fila e zera o contador. O SLA NÃO mora
 * aqui (já vive na bottom nav / sidebar) — sino de cima é chegada de
 * trabalho novo, não alerta de parada.
 * Sticky no scroller do main; safe-area iOS no topo; some em sm+.
 */
export function MobileAppHeader({
  slug,
  orgName,
  newCount,
  user,
  roleLabel,
  isOwnerOrAdmin,
  onSignOut,
}: {
  slug: string;
  orgName: string;
  newCount: number;
  user: { name: string; email: string | null } | null;
  roleLabel: string;
  isOwnerOrAdmin: boolean;
  onSignOut: () => void;
}) {
  return (
    <header className="sm:hidden sticky top-0 z-40 border-b border-sidebar-border/40 bg-sidebar/95 backdrop-blur-md text-sidebar-foreground pt-[env(safe-area-inset-top,0px)]">
      <div className="flex h-12 items-center gap-2 px-3">
        {/* Marca + org (toca volta pra fila) */}
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

        {/* Sino = novas demandas (mesmo sinal do desktop); toca → Fila */}
        <Link
          to="/app/o/$slug/fila"
          params={{ slug }}
          title="Novas demandas"
          aria-label={`Novas demandas${newCount ? ` (${newCount})` : ""}`}
          className="relative grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white/80 transition hover:bg-white/10 hover:text-white active:scale-95"
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={2} />
          {newCount > 0 && (
            <span className="absolute -right-0.5 -top-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-white px-1 text-[9px] font-bold tabular-nums text-primary shadow-sm">
              {newCount > 9 ? "9+" : newCount}
            </span>
          )}
        </Link>

        {/* Perfil (redondo) — Configurações vive dentro do menu */}
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
