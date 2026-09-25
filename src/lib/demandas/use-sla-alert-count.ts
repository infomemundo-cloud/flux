import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrgBySlug } from "@/lib/orgs.functions";
import { slaAlerts } from "@/lib/demandas/demandas-analytics.functions";

/**
 * Contagem de demandas paradas (Alertas SLA) pro badge da sidebar e do nav
 * mobile.
 *
 * A REGRA mora no banco e é aplicada pelo SERVIDOR: chamamos slaAlerts SEM
 * staleDays, então o cutoff vem de organizations.sla_max_inactivity_hours —
 * badge e regra nunca divergem, e o front não duplica lógica.
 *
 * Decisão de produto: sla_enabled = false → monitoramento desligado =
 * badge some E nenhuma query é disparada (enabled: false), zero custo.
 *
 * Cache ["sla-alerts", orgId] com staleTime 60s: sidebar e mobile nav
 * compartilham a mesma entrada (1 request só).
 */
export function useSlaAlertCount(slug: string | undefined): number {
  const orgFn = useServerFn(getOrgBySlug);
  const alertsFn = useServerFn(slaAlerts);

  const { data: org } = useQuery({
    queryKey: ["org", slug],
    queryFn: () => orgFn({ data: { slug: slug! } }),
    enabled: !!slug,
  });

  const slaOn = org?.sla_enabled ?? true;

  const { data: alerts } = useQuery({
    queryKey: ["sla-alerts", org?.id],
    queryFn: () => alertsFn({ data: { orgId: org!.id } }),
    enabled: !!org?.id && slaOn,
    staleTime: 60_000,
  });

  return slaOn ? (alerts?.length ?? 0) : 0;
}