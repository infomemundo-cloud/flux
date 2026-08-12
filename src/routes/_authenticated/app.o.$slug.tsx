import { createFileRoute, Link, Outlet, useNavigate, useParams, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getOrgBySlug } from "@/lib/orgs.functions";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRealtime } from "@/hooks/use-org-realtime";
import { Inbox, LayoutDashboard, Settings, LogOut, ChevronDown, AlertTriangle, Users, Bell } from "lucide-react";

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
  const [newCount, setNewCount] = useState(0);

  useEffect(() => { if (location.pathname.endsWith("/fila")) setNewCount(0); }, [location.pathname]);

  // Um canal por organização alimenta fila, detalhe, painel e alertas em tempo real.
  const onNewDemanda = useCallback(
    (d: { title?: string; protocol?: string }) => {
      setNewCount((c) => c + 1);
      toast.info("Nova demanda recebida", {
        description: `${d.protocol ? d.protocol + " · " : ""}${d.title ?? "Sem título"}`,
        action: { label: "Ver fila", onClick: () => navigate({ to: "/app/o/$slug/fila", params: { slug } }) },
      });
    },
    [navigate, slug],
  );
  useOrgRealtime({ orgId: org?.id, onNewDemanda });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  if (isLoading) return <div className="p-6 text-sm text-muted-foreground">Carregando...</div>;
  if (error || !org) return <div className="p-6 text-sm text-destructive">Sem acesso a esta organização.</div>;

  const nav = [
    { to: `/app/o/${slug}/fila`, label: "Fila", icon: Inbox },
    { to: `/app/o/${slug}/alertas`, label: "Alertas SLA", icon: AlertTriangle },
    { to: `/app/o/${slug}/dashboard`, label: "Dashboard", icon: LayoutDashboard },
    { to: `/app/o/${slug}/equipe`, label: "Equipe", icon: Users },
    { to: `/app/o/${slug}/configuracoes`, label: "Configurações", icon: Settings },
  ];

  const initials = org.name.slice(0, 2).toUpperCase();

  return (
    <div className="min-h-screen grid grid-cols-[1fr] sm:grid-cols-[256px_1fr] bg-surface text-foreground">
      <aside className="hidden sm:flex bg-sidebar text-sidebar-foreground flex-col">
        <div className="px-4 pt-5 pb-4">
          <Link to="/app" className="flex items-center gap-2.5 group">
            <span className="grid place-items-center h-8 w-8 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-sm font-extrabold shadow-[0_0_0_1px_oklch(1_0_0/0.08)]">
              F
            </span>
            <span className="font-extrabold tracking-tight text-[15px]">Fluxo</span>
          </Link>

          <Link
            to="/app"
            className="mt-5 flex items-center gap-2.5 rounded-xl border border-sidebar-border/80 bg-sidebar-accent/40 px-2.5 py-2 hover:bg-sidebar-accent transition"
          >
            <span className="grid place-items-center h-7 w-7 shrink-0 rounded-md bg-sidebar-accent text-[11px] font-bold text-sidebar-accent-foreground">
              {initials}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13px] font-semibold truncate">{org.name}</span>
              <span className="block text-[11px] capitalize text-sidebar-foreground/55">{org.role}</span>
            </span>
            <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50" />
          </Link>
        </div>

        <nav className="px-2 flex-1 space-y-0.5">
          <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/40">
            Operação
          </div>
          {nav.map((n) => {
            const active = location.pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <a key={n.to} href={n.to}
                className={`group relative flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/75 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"}`}>
                {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-r-full bg-sidebar-primary" />}
                <Icon className={`h-[17px] w-[17px] ${active ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/55 group-hover:text-sidebar-foreground"}`} strokeWidth={1.9} />
                {n.label}
                {n.label === "Fila" && newCount > 0 && (
                  <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
                    <Bell className="h-3 w-3" /> {newCount}
                  </span>
                )}
              </a>
            );
          })}
        </nav>

        <button onClick={signOut} className="mx-2 mb-3 flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground transition-colors">
          <LogOut className="h-[17px] w-[17px]" strokeWidth={1.9} /> Sair
        </button>
      </aside>

      <main className="min-w-0 overflow-auto bg-surface">
        <header className="sm:hidden sticky top-0 z-30 flex items-center gap-2.5 bg-sidebar text-sidebar-foreground px-4 py-3">
          <span className="grid place-items-center h-7 w-7 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-xs font-extrabold">F</span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">{org.name}</span>
          <button onClick={signOut} className="p-1.5 rounded-md hover:bg-sidebar-accent/60"><LogOut className="h-4 w-4" /></button>
        </header>

        <Outlet />

        <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-5 bg-sidebar text-sidebar-foreground border-t border-sidebar-border">
          {nav.map((n) => {
            const active = location.pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <a key={n.to} href={n.to} className={`flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium ${active ? "text-sidebar-primary-foreground" : "text-sidebar-foreground/60"}`}>
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.9} />
                <span className="truncate max-w-full px-1">{n.label}</span>
              </a>
            );
          })}
        </nav>
      </main>
    </div>
  );
}