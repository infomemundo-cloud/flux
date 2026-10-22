import { createFileRoute, Navigate, useParams } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Settings2 } from "lucide-react";
import { getOrgBySlug } from "@/lib/orgs.functions";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FormSkeleton } from "@/components/skeletons";
import { GeralTab } from "./-components/geral-tab";
import { CanaisTab } from "./-components/canais-tab";
import { AtendimentoTab } from "./-components/atendimento-tab";
import { MacrosTab } from "./-components/macros-tab";
import { FinanceiroTab } from "./-components/financeiro-tab";

/**
 * Rota de Configurações do tenant — orquestrador puro (mesmo padrão do
 * detalhe da demanda): RBAC + shell de abas + composição. Cada aba vive em
 * `-components/` com responsabilidade única. Route id idêntico ao do arquivo
 * único anterior (`/_authenticated/app/o/$slug/configuracoes`) → zero impacto
 * em sidebar/mobile/user-menu/routeTree.
 */
export const Route = createFileRoute("/_authenticated/app/o/$slug/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações — Fluxo" },
      {
        name: "description",
        content:
          "Governança de negócio da organização: canais, atendimento, macros e financeiro no Fluxo.",
      },
    ],
  }),
  component: Config,
});

const TAB_TRIGGER_CLASS =
  // Reset completo das classes base do shadcn + estilo pílula flutuante
  // px-3 py-1.5 (menor que antes) → garante que a 3ª aba fique cortada na
  // viewport mobile padrão, entregando a affordance de scroll horizontal.
  // snap-start: cada pílula encaixa suavemente na borda esquerda ao deslizar.
  // active:scale-95: feedback tátil imediato como app nativo.
  "shrink-0 snap-start inline-flex items-center justify-center whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-medium cursor-pointer select-none outline-none transition-all duration-200 ease-in-out active:scale-95" +
  // Inativa: card sutil com borda fraca
  " bg-secondary/50 text-muted-foreground border border-border/50" +
  // Hover: leve elevação
  " hover:bg-secondary hover:text-foreground hover:shadow-sm hover:border-border" +
  // Ativa: destaque primário com sombra
  " data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-md data-[state=active]:border-primary/20 data-[state=active]:font-semibold";

function Config() {
  const { slug } = useParams({ from: "/_authenticated/app/o/$slug/configuracoes" });
  const orgFn = useServerFn(getOrgBySlug);
  const { data: org } = useQuery({
    queryKey: ["org", slug],
    queryFn: () => orgFn({ data: { slug } }),
  });

  // Página restrita: a UI esconde o link, e aqui a rota devolve pra Fila
  // se alguém colar a URL direto no navegador.
  const isOwnerOrAdmin = org?.role === "owner" || org?.role === "admin";
  const origin = typeof window !== "undefined" ? window.location.origin : "";

  if (!org) return <FormSkeleton sections={3} />;
  if (!isOwnerOrAdmin) return <Navigate to="/app/o/$slug/fila" params={{ slug }} />;

  return (
    <div className="max-w-4xl p-4 pb-24 sm:p-6 sm:pb-6">
      <h1 className="flex items-center gap-2 text-xl font-bold tracking-tight sm:text-2xl">
        <Settings2 className="h-5 w-5 text-primary" strokeWidth={2.2} /> Configurações
      </h1>
      <p className="text-xs text-muted-foreground sm:text-sm">
        Governança de negócio desta organização: canais, atendimento, macros e financeiro.
      </p>
      <Tabs defaultValue="geral" className="mt-6">
        {/*
         * Wrapper de scroll horizontal com affordance visual:
         * • -mx-4 sm:mx-0: sangra até as bordas da tela no mobile
         * • snap-x snap-mandatory: deslize preciso no toque (cada pílula encaixa)
         * • relative + fade degradê: indica visualmente que há mais abas à direita
         */}
        <div className="relative -mx-4 sm:mx-0">
          {/* Fade degradê à direita — pointer-events-none para não bloquear cliques */}
          <div
            aria-hidden
            className="pointer-events-none absolute right-0 top-0 bottom-0 w-10 z-10 bg-gradient-to-l from-background to-transparent sm:hidden"
          />
          <div className="overflow-x-auto scrollbar-none snap-x snap-mandatory">
            <TabsList
              className={
                // flex real (não inline-flex) para o scroll funcionar
                "flex flex-nowrap items-center gap-1.5 px-4 sm:px-0 py-1.5 w-max min-w-full" +
                // Zera o fundo/padding/altura do shadcn
                " h-auto bg-transparent p-0 justify-start rounded-none"
              }
            >
              <TabsTrigger value="geral" className={TAB_TRIGGER_CLASS}>
                Geral
              </TabsTrigger>
              <TabsTrigger value="canais" className={TAB_TRIGGER_CLASS}>
                Canais & Integrações
              </TabsTrigger>
              <TabsTrigger value="atendimento" className={TAB_TRIGGER_CLASS}>
                Atendimento
              </TabsTrigger>
              <TabsTrigger value="macros" className={TAB_TRIGGER_CLASS}>
                Macros
              </TabsTrigger>
              <TabsTrigger value="financeiro" className={TAB_TRIGGER_CLASS}>
                Financeiro
              </TabsTrigger>
            </TabsList>
          </div>
        </div>
        <TabsContent value="geral" className="mt-5 space-y-6">
          <GeralTab
            orgId={org.id}
            orgSlug={org.slug}
            orgName={org.name}
            orgLogoUrl={org.logo_url ?? null}
            isOwner={org.role === "owner"}
          />
        </TabsContent>
        <TabsContent value="canais" className="mt-5 space-y-6">
          <CanaisTab
            orgId={org.id}
            orgSlug={org.slug}
            origin={origin}
            allowGroupIngest={org.allow_group_ingest ?? false}
          />
        </TabsContent>
        <TabsContent value="atendimento" className="mt-5 space-y-6">
          <AtendimentoTab
            orgId={org.id}
            orgSlug={org.slug}
            slaEnabled={org.sla_enabled ?? true}
            slaMaxInactivityHours={org.sla_max_inactivity_hours ?? 24}
            autoAssignEnabled={org.auto_assign_enabled ?? false}
            autoAssignMode={(org.auto_assign_mode ?? "round_robin") as "round_robin" | "least_busy"}
          />
        </TabsContent>
        <TabsContent value="macros" className="mt-5">
          <MacrosTab orgId={org.id} />
        </TabsContent>
        <TabsContent value="financeiro" className="mt-5 space-y-6">
          <FinanceiroTab
            orgId={org.id}
            isOwner={org.role === "owner"}
        />
        </TabsContent>
      </Tabs>
    </div>
  );
}
