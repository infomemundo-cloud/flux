import { createFileRoute, Outlet, useNavigate, useParams, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { getOrgBySlug } from "@/lib/orgs.functions";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRealtime } from "@/hooks/use-org-realtime";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";
import { OrgSidebar } from "@/components/org-sidebar";
import { OrgMobileNav } from "@/components/org-mobile-nav";
import { PageFade, TopProgressBar, ListSkeleton } from "@/components/skeletons";

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
    queryKey: ["org", slug],
    queryFn: () => fn({ data: { slug } }),
    retry: false,
  });
  const [newCount, setNewCount] = useState(0);
  const { collapsed, toggle: toggleCollapsed } = useSidebarCollapsed();
  const [user, setUser] = useState<{ name: string; email: string | null } | null>(null);

  useEffect(() => {
    if (location.pathname.endsWith("/fila")) setNewCount(0);
  }, [location.pathname]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      const meta: any = u.user_metadata ?? {};
      setUser({
        name: meta.full_name ?? meta.name ?? (u.email ? u.email.split("@")[0]! : "Usuário"),
        email: u.email ?? null,
      });
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

  if (isLoading)
    return (
      <div className="min-h-screen grid grid-cols-[1fr] bg-surface sm:grid-cols-[256px_1fr]">
        <aside className="hidden sm:block h-screen sticky top-0 bg-sidebar border-r border-sidebar-border/60" />
        <main className="p-4 sm:p-8">
          <div className="h-7 w-52 shimmer rounded-md" />
          <div className="mt-2 h-3 w-72 shimmer rounded-md" />
          <div className="mt-6">
            <ListSkeleton rows={5} />
          </div>
        </main>
      </div>
    );
  if (error || !org) return <div className="p-6 text-sm text-destructive">Sem acesso a esta organização.</div>;

  const roleLabel = ROLE_LABEL[org.role] ?? org.role;

  return (
    <div
      className="min-h-screen grid grid-cols-[1fr] bg-surface text-foreground sm:grid-cols-[var(--rail)_1fr]"
      style={{ ["--rail" as any]: collapsed ? "68px" : "256px" }}
    >
      <OrgSidebar
        slug={slug}
        activePath={location.pathname}
        collapsed={collapsed}
        onToggle={toggleCollapsed}
        newCount={newCount}
        user={user}
        roleLabel={roleLabel}
        onSignOut={signOut}
      />

      <main className="min-w-0 overflow-auto bg-surface">
        <TopProgressBar />
        <PageFade key={location.pathname}>
          <Outlet />
        </PageFade>

        <OrgMobileNav
          slug={slug}
          activePath={location.pathname}
          user={user}
          roleLabel={roleLabel}
          onSignOut={signOut}
        />
      </main>
    </div>
  );
}
