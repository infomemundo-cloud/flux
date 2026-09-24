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
        <div className="overflow-x-auto scrollbar-thin">
          <TabsList>
            <TabsTrigger value="geral">Geral</TabsTrigger>
            <TabsTrigger value="canais">Canais & Integrações</TabsTrigger>
            <TabsTrigger value="atendimento">Atendimento</TabsTrigger>
            <TabsTrigger value="macros">Macros</TabsTrigger>
            <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          </TabsList>
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
            allowGroupIngest={org.allow_group_ingest ?? true}
          />
        </TabsContent>
        <TabsContent value="atendimento" className="mt-5 space-y-6">
          <AtendimentoTab orgId={org.id} />
        </TabsContent>
        <TabsContent value="macros" className="mt-5">
          <MacrosTab orgId={org.id} />
        </TabsContent>
        <TabsContent value="financeiro" className="mt-5 space-y-6">
          <FinanceiroTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}