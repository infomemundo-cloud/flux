import { Link } from "@tanstack/react-router";
import { UserMenu } from "@/components/user-menu";
import { ORG_NAV_ITEMS } from "@/components/org-sidebar";

type OrgMobileNavProps = {
  slug: string;
  activePath: string;
  user: { name: string; email: string | null } | null;
  roleLabel: string;
  isOwnerOrAdmin: boolean;
  onSignOut: () => void;
};

export function OrgMobileNav({ slug, activePath, user, roleLabel, isOwnerOrAdmin, onSignOut }: OrgMobileNavProps) {
  const visibleItems = ORG_NAV_ITEMS.filter((n) => !n.adminOnly || isOwnerOrAdmin);
  // 5 itens + menu do usuário = 6 colunas (owner/admin); 4 itens + menu = 5 (demais).
  // Classes estáticas pra o Tailwind gerar as duas variantes.
  const columns = visibleItems.length + 1 >= 6 ? "grid-cols-6" : "grid-cols-5";
  return (
    <nav
      className={`sm:hidden fixed bottom-0 inset-x-0 z-30 grid gap-0.5 bg-sidebar text-sidebar-foreground border-t border-sidebar-border px-1 py-1.5 ${columns}`}
    >
      {visibleItems.map((n) => {
        const to = `/app/o/${slug}/${n.segment}`;
        const active = activePath.startsWith(to);
        const Icon = n.icon;
        return (
          <Link
            key={n.segment}
            to={to}
            preload="intent"
            className={`flex flex-col items-center gap-1 py-1.5 rounded-lg text-[10px] font-medium transition-colors ${
              active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/60"
            }`}
          >
            <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
            <span className="truncate max-w-full px-1">{n.label}</span>
          </Link>
        );
      })}
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