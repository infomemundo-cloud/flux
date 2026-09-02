import { createFileRoute, Link, Outlet, useNavigate, useParams, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getOrgBySlug } from "@/lib/orgs.functions";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRealtime } from "@/hooks/use-org-realtime";
import { UserMenu, ThemeCycleButton } from "@/components/user-menu";
import { Inbox, LayoutDashboard, Settings, ChevronDown, AlertTriangle, Users, Bell, PanelLeftClose, PanelLeftOpen } from "lucide-react";

const ROLE_LABEL: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  gerente: "Gerente",
  operador: "Operador",
  agente_ia: "Agente de IA",
};

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
  const [collapsed, setCollapsed] = useState(false);
  const [user, setUser] = useState<{ name: string; email: string | null } | null>(null);

  useEffect(() => { if (location.pathname.endsWith("/fila")) setNewCount(0); }, [location.pathname]);

  useEffect(() => {
    const stored = localStorage.getItem("fluxo-sidebar-collapsed");
    if (stored === "1") setCollapsed(true);
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      const meta: any = u.user_metadata ?? {};
      setUser({ name: meta.full_name ?? meta.name ?? (u.email ? u.email.split("@")[0]! : "Usuário"), email: u.email ?? null });
    });
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((c) => {
      localStorage.setItem("fluxo-sidebar-collapsed", c ? "0" : "1");
      return !c;
    });
  }, []);

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
    <div
      className="min-h-screen grid grid-cols-[1fr] bg-surface text-foreground sm:grid-cols-[var(--rail)_1fr]"
      style={{ ["--rail" as any]: collapsed ? "68px" : "256px" }}
    >
      <aside className="hidden sm:flex bg-sidebar text-sidebar-foreground flex-col border-r border-sidebar-border/60">
        <div className={`pt-4 pb-3 ${collapsed ? "px-2" : "px-4"}`}>
          <div className={`flex items-center gap-2 ${collapsed ? "flex-col" : ""}`}>
            <Link to="/app" className="flex min-w-0 items-center gap-2.5" title="Fluxo">
              <span className="grid place-items-center h-8 w-8 shrink-0 rounded-lg bg-sidebar-primary text-sidebar-primary-foreground text-sm font-extrabold">
                F
              </span>
              {!collapsed && <span className="font-extrabold tracking-tight text-[15px]">Fluxo</span>}
            </Link>
            {collapsed && (
              <button
                onClick={toggleCollapsed}
                aria-label="Expandir menu"
                title="Expandir menu"
                className="grid place-items-center h-8 w-8 rounded-md text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
              >
                <PanelLeftOpen className="h-4 w-4" />
              </button>
            )}
          </div>

          <Link
            to="/app"
            title={org.name}
            className={`mt-4 flex items-center gap-2.5 rounded-xl border border-sidebar-border/80 bg-sidebar-accent/40 py-2 hover:bg-sidebar-accent transition ${collapsed ? "justify-center px-1" : "px-2.5"}`}
          >
            <span className="grid place-items-center h-7 w-7 shrink-0 rounded-md bg-sidebar-accent text-[11px] font-bold text-sidebar-accent-foreground">
              {initials}
            </span>
            {!collapsed && (
              <>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold truncate">{org.name}</span>
                  <span className="block text-[11px] text-sidebar-foreground/60">{ROLE_LABEL[org.role] ?? org.role}</span>
                </span>
                <ChevronDown className="h-3.5 w-3.5 shrink-0 text-sidebar-foreground/50" />
              </>
            )}
          </Link>
        </div>

        <nav className={`flex-1 space-y-0.5 ${collapsed ? "px-2" : "px-2"}`}>
          {!collapsed && (
            <div className="px-3 pb-1.5 text-[10px] font-bold uppercase tracking-widest text-sidebar-foreground/45">
              Operação
            </div>
          )}
          {nav.map((n) => {
            const active = location.pathname.startsWith(n.to);
            const Icon = n.icon;
            return (
              <a key={n.to} href={n.to} title={n.label}
                className={`group relative flex items-center gap-2.5 py-2 rounded-lg text-[13px] font-medium transition-colors ${collapsed ? "justify-center px-2" : "px-3"} ${active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground"}`}>
                {active && <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[3px] rounded-r-full bg-sidebar-primary" />}
                <Icon className={`h-[17px] w-[17px] shrink-0 ${active ? "text-sidebar-accent-foreground" : "text-sidebar-foreground/65 group-hover:text-sidebar-foreground"}`} strokeWidth={1.9} />
                {!collapsed && n.label}
                {n.label === "Fila" && newCount > 0 && !collapsed && (
                  <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-sidebar-primary text-sidebar-primary-foreground">
                    <Bell className="h-3 w-3" /> {newCount}
                  </span>
                )}
                {n.label === "Fila" && newCount > 0 && collapsed && (
                  <span className="absolute top-1 right-1 h-1.5 w-1.5 rounded-full bg-sidebar-primary" />
                )}
              </a>
            );
          })}
        </nav>

        <div className="mx-2 mb-3 mt-2 space-y-1.5">
          {!collapsed && (
            <button
              onClick={toggleCollapsed}
              aria-label="Recolher menu"
              title="Recolher menu"
              className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground"
            >
              <PanelLeftClose className="h-4 w-4" /> Recolher menu
            </button>
          )}
          <UserMenu
            name={user?.name ?? "Usuário"}
            email={user?.email}
            role={ROLE_LABEL[org.role] ?? org.role}
            collapsed={collapsed}
            settingsTo={`/app/o/${slug}/configuracoes`}
            onSignOut={signOut}
          />
        </div>
      </aside>

      <main className="min-w-0 overflow-auto bg-surface">
        <Outlet />

        <nav className="sm:hidden fixed bottom-0 inset-x-0 z-30 grid grid-cols-6 bg-sidebar text-sidebar-foreground border-t border-sidebar-border">
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
          <div className="flex items-center justify-center py-1.5">
            <UserMenu
              name={user?.name ?? "Usuário"}
              email={user?.email}
              role={ROLE_LABEL[org.role] ?? org.role}
              collapsed
              settingsTo={`/app/o/${slug}/configuracoes`}
              onSignOut={signOut}
            />
          </div>
        </nav>
      </main>
    </div>
  );
}