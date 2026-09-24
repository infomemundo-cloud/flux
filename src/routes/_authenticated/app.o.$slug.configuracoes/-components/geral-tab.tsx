import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { KeyRound, Users, Webhook } from "lucide-react";
import { listMembers } from "@/lib/orgs.functions";
import { listWebhookTokens } from "@/lib/demandas/webhook-tokens.functions";
import { SectionTitle, StatCard } from "@/components/section-ui";
import { OrgIdentitySection } from "./org-identity-section";
import { DangerZoneSection } from "./danger-zone-section";

/**
 * Aba Geral: identidade editável + visão rápida + Zona de Perigo.
 * A Zona de Perigo é renderizada SOMENTE pra role owner (isOwner vem do
 * route; o guard de owner também existe no servidor).
 */
export function GeralTab({
  orgId,
  orgSlug,
  orgName,
  orgLogoUrl,
  isOwner,
}: {
  orgId: string;
  orgSlug: string;
  orgName: string;
  orgLogoUrl: string | null;
  isOwner: boolean;
}) {
  const membersFn = useServerFn(listMembers);
  const tokensFn = useServerFn(listWebhookTokens);
  const { data: members } = useQuery({
    queryKey: ["members", orgId],
    queryFn: () => membersFn({ data: { orgId } }),
  });
  const { data: tokens } = useQuery({
    queryKey: ["tokens", orgId],
    queryFn: () => tokensFn({ data: { orgId } }),
  });
  return (
    <>
      <SectionTitle
        icon={Users}
        title="Visão rápida da organização"
        hint="Identidade editável e métricas básicas. Equipe segue em página própria."
      />
      <OrgIdentitySection
        orgId={orgId}
        orgSlug={orgSlug}
        orgName={orgName}
        orgLogoUrl={orgLogoUrl}
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard icon={Users} label="Total de membros" value={members?.length ?? "—"} />
        <StatCard icon={KeyRound} label="Tokens ativos" value={tokens?.length ?? "—"} tone="green" />
        <StatCard icon={Webhook} label="Canal de entrada" value="Webhook" tone="violet" />
      </div>
      <p className="text-xs text-muted-foreground">
        Pra convidar, aprovar ou trocar o papel de alguém, use a página <b>Equipe</b> no menu lateral.
      </p>
      {isOwner && (
        <DangerZoneSection orgId={orgId} orgName={orgName} orgSlug={orgSlug} />
      )}
    </>
  );
}