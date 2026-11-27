import { createFileRoute, Outlet, useNavigate, useParams, useLocation } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getOrgBySlug, getOnboardingState } from "@/lib/orgs.functions";
import { supabase } from "@/integrations/supabase/client";
import { useOrgRealtime, type IncomingMessageEvent } from "@/hooks/use-org-realtime";
import { useSidebarCollapsed } from "@/hooks/use-sidebar-collapsed";
import { OrgSidebar } from "@/components/org-sidebar";
import { OrgMobileNav } from "@/components/org-mobile-nav";
import { MobileAppHeader } from "@/components/mobile-app-header";
import { PageFade, TopProgressBar, ListSkeleton } from "@/components/skeletons";
import { OrgSidebarContext } from "@/lib/org-sidebar-context";

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
  const { collapsed, setCollapsed, toggle: toggleCollapsed, resetToPref } = useSidebarCollapsed();
  const [user, setUser] = useState<{ name: string; email: string | null } | null>(null);

  // Auto-open do wizard (D6 + Ciclo 1.5): só dispara enquanto a org NUNCA
  // foi conectada (everConnected=false). Depois da primeira conexão bem-
  // -sucedida, reconectar é ato de gestão em Configurações → Canais;
  // desconectar NÃO faz o wizard reabrir. sessionStorage evita flicker
  // em retorno manual do usuário que clicou "Conectar depois".
  const getState = useServerFn(getOnboardingState);
  const onboardingQ = useQuery({
    queryKey: ["onboarding-state", org?.id],
    queryFn: () => getState({ data: { orgId: org!.id } }),
    enabled: !!org && ["owner", "admin"].includes(org.role),
  });

  useEffect(() => {
    // GUARDA PÓS-CHECKOUT: não sequestrar durante fluxo de retorno do MP.
    // O usuário volta via redirect 302 do back_url e precisa ver a página
    // de sucesso sem ser arrancado para o wizard de onboarding.
    if (location.pathname.includes("/billing/success")) return;

    if (!org || !onboardingQ.data) return;
    if (!["owner", "admin"].includes(org.role)) return;
    const { connected, dismissed, status, everConnected } = onboardingQ.data;
    if (connected || dismissed) return;
    // Ciclo 1.5: já conectou pelo menos uma vez? Reconectar é ato de
    // gestão em Configurações → Canais; o wizard NÃO reabre.
    if (everConnected) return;
    // Conexão em andamento (QR gerado/escaneando): nunca arrancar do fluxo.
    if (status === "connecting") return;
    try {
    if (sessionStorage.getItem(`onboarding-auto:${org.slug}`) === "skipped") return;
    } catch {
    /* sessionStorage bloqueado: deixa passar */
    }
    navigate({ to: "/app/onboarding/$slug", params: { slug: org.slug } });
    }, [org, onboardingQ.data, navigate, location.pathname]);

  useEffect(() => {
    if (location.pathname.endsWith("/fila")) setNewCount(0);
  }, [location.pathname]);

  useEffect(() => {
    // Usa getSession (local storage) em vez de getUser (rede) para evitar
    // chamadas HTTP redundantes no mount do layout. Dados do perfil são
    // suficientes para exibição de nome/avatar no sidebar.
    supabase.auth.getSession().then(({ data: { session } }) => {
      const u = session?.user;
      if (!u) return;
      const meta: any = u.user_metadata ?? {};
      setUser({
        name: meta.full_name ?? meta.name ?? (u.email ? u.email.split("@")[0]! : "Usuário"),
        email: u.email ?? null,
      });
    });
  }, []);

  // Cooldown por demanda: conversa ativa não vira metralhadora de toasts.
  const lastMsgToastAtRef = useRef<Map<string, number>>(new Map());

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

  // ◆ NOTIFICAÇÃO "CHEGOU MENSAGEM" (demanda existente OU nova via mensagem) ◆
  // Suprime quando o usuário JÁ está olhando a conversa (padrão WhatsApp Web)
  // e aplica cooldown de 8s por demanda. window.location (não state de rota)
  // mantém o callback estável — o canal nem re-assina mais (refs no hook).
  const onNewMessage = useCallback(
    (msg: IncomingMessageEvent) => {
      const did = msg.demandaId;
      if (!did) return;
      if (window.location.pathname.includes(`/fila/demandas/${did}`)) return;
      const now = Date.now();
      const last = lastMsgToastAtRef.current.get(did) ?? 0;
      if (now - last < 8000) return;
      lastMsgToastAtRef.current.set(did, now);
      setNewCount((c) => c + 1);
      let text = msg.content?.trim();
      if (!text) {
        if (msg.mediaKind === "audioMessage") text = "🎤 Mensagem de áudio";
        else if (msg.mediaKind === "imageMessage") text = "📷 Foto";
        else if (msg.mediaKind === "videoMessage") text = "🎥 Vídeo";
        else if (msg.mediaKind === "documentMessage") text = `📄 ${msg.fileName || "Documento"}`;
        else if (msg.mediaKind === "stickerMessage") text = "🎭 Figurinha";
        else text = "Nova mensagem recebida";
      }
      // Grupo: remetente real + subject; 1:1: nome do contato.
      const sender =
        msg.participantName && msg.contactName && msg.participantName !== msg.contactName
          ? `${msg.participantName} · ${msg.contactName}`
          : msg.contactName || "Nova mensagem";
      toast.success(sender, {
        description: text.slice(0, 120),
        duration: 6000,
        action: {
          label: "Abrir conversa",
          onClick: () =>
            navigate({ to: "/app/o/$slug/fila/demandas/$id", params: { slug, id: did } }),
        },
      });
    },
    [navigate, slug],
  );

  useOrgRealtime({ orgId: org?.id, onNewDemanda, onNewMessage });

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  if (isLoading)
    return (
      <div className="min-h-screen grid grid-cols-[1fr] bg-surface sm:grid-cols-[68px_1fr]">
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
  const isOwnerOrAdmin = org.role === "owner" || org.role === "admin";
  const inDemandaDetail = location.pathname.includes("/fila/demandas/");

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
        isOwnerOrAdmin={isOwnerOrAdmin}
        onSignOut={signOut}
      />
      {/*
       * main: pb-20 sm:pb-0 cria a safe area inferior no mobile para que
       * conteúdo final (botões de envio, formulários) nunca fique soterrado
       * pela bottom nav fixa. Dentro da conversa (/fila/demandas/$id), o
       * header e a bottom nav mobile são ocultados (padrão WhatsApp 100dvh).
       * No desktop (sm+) o padding some.
       */}
       <main
         className={`min-w-0 overflow-auto scrollbar-thin bg-surface ${
           inDemandaDetail ? "pb-0" : "pb-20"
         } sm:pb-0`}
       >
          {/* Camada 1 do lockup mobile: barra de marca sticky (some em sm+ e na conversa) */}
          {!inDemandaDetail && (
            <MobileAppHeader
              slug={slug}
              orgName={org.name}
              newCount={newCount}
              user={user}
              roleLabel={roleLabel}
              isOwnerOrAdmin={isOwnerOrAdmin}
              onSignOut={signOut}
            />
          )}
          <TopProgressBar />
        <PageFade key={location.pathname}>
          <OrgSidebarContext.Provider value={{ collapsed, setCollapsed, resetToPref }}>
            <Outlet />
          </OrgSidebarContext.Provider>
        </PageFade>
      </main>

      {/* Bottom nav fora do main → não participa do scroll container (oculta na conversa no mobile) */}
      {!inDemandaDetail && (
        <OrgMobileNav slug={slug} activePath={location.pathname} newCount={newCount} />
      )}
    </div>
  );
}
