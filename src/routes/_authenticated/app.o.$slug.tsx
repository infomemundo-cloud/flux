import { createFileRoute, Link, Outlet, useNavigate, useParams, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrgBySlug } from "@/lib/orgs.functions";
import { supabase } from "@/integrations/supabase/client";
import { Inbox, LayoutDashboard, Settings, LogOut, ChevronDown } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/o/$slug")({
  component: OrgLayout,
});

function OrgLayout() {
  const { slug } = useParams({ from: "/_authenticated/app/o/$slug" });
  const location = useLocation();
  const navigate = useNavigate();
  const fn = useServerFn(getOrgBySlug);
  const { data: org, isLoading, error } = useQuery({
    queryKey: ["org", slug], queryFn: () => fn({ data: { slug } }), retry: false,
  });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando...</div>;
  if (error || !org) return <div className="p-6 text-sm text-destructive">Sem acesso a esta organização.</div>;

  const nav = [
    { to: `/app/o/${slug}/fila`, label: "Fila", icon: Inbox },
    { to: `/app/o/${slug}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
    { to: `/app/o/${slug}/configuracoes`, label: "Configurações", icon: Settings },
  ];

  return (
    <div className="min-h-screen grid grid-cols-[240px_1fr] bg-background text-foreground">
      <aside className="bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col">
        <div className="p-4 border-b border-sidebar-border">
          <Link to="/app" className="flex items-center gap-2 text-xs text-sidebar-foreground/60 hover:text-sidebar-foreground">
            <ChevronDown className="h-3 w-3 rotate-90" /> Trocar organização
          </Link>
          <div className="mt-2 font-semibold truncate">{org.name}</div>
          <div className="text-xs text-sidebar-foreground/60">{org.role}</div>
        </div>
        <nav className="p-2 flex-1">
          {nav.map((n) => {
            const active = location.pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <a key={n.to} href={n.to}
                className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "hover:bg-sidebar-accent/50"}`}>
                <Icon className="h-4 w-4" /> {n.label}
              </a>
            );
          })}
        </nav>
        <button onClick={signOut} className="m-2 flex items-center gap-2 px-3 py-2 rounded-md text-sm hover:bg-sidebar-accent/50">
          <LogOut className="h-4 w-4" /> Sair
        </button>
      </aside>
      <main className="overflow-auto"><Outlet /></main>
    </div>
  );
}