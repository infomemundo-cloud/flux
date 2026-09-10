import { Link } from "@tanstack/react-router";
import { UserMenu } from "@/components/user-menu";
import { ORG_NAV_ITEMS } from "@/components/org-sidebar";

type OrgMobileNavProps = {
  slug: string;
  activePath: string;
  user: { name: string; email: string | null } | null;
  roleLabel: string;
  onSignOut: () => void;
};

export function OrgMobileNav({ slug, activePath, user, roleLabel, onSignOut }: OrgMobileNavProps) {
  return (
    <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-6 bg-sidebar text-sidebar-foreground border-t border-sidebar-border">
      {ORG_NAV_ITEMS.map((n) => {
        const targetPath = `/app/o/${slug}/${n.segment}`;
        const active = activePath.startsWith(targetPath);
        const Icon = n.icon;
        return (
          <Link
            key={n.segment}
            to={targetPath}
            preload="intent"
            className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium ${active ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/60"}`}
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
          settingsTo={`/app/o/${slug}/configuracoes`}
          onSignOut={onSignOut}
        />
      </div>
    </nav>
  );
}
