import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrgBySlug } from "@/lib/orgs.functions";
import { getSlaAlertCount } from "@/lib/demandas/demandas-analytics.functions";

/**
 * Contagem leve de demandas paradas (Alertas SLA) pro badge da sidebar e do nav
 * mobile.
 *
 * A REGRA mora no banco e é aplicada pelo SERVIDOR: chamamos getSlaAlertCount,
 * que executa head: true (zero payload, sem join em contacts) respeitando
 * organizations.sla_max_inactivity_hours.
 *
 * Invalidação reativa via Realtime no use-org-realtime.ts ao receber UPDATE em demandas
 * (zero polling passivo, conformidade v3.0 §2.1).
 */
export function useSlaAlertCount(slug: string | undefined): number {
  const orgFn = useServerFn(getOrgBySlug);
  const countFn = useServerFn(getSlaAlertCount);

  // Serve da RAM via layout da org (zero network requests)
  const { data: org } = useQuery({
    queryKey: ["org", slug],
    queryFn: () => orgFn({ data: { slug: slug! } }),
    enabled: !!slug,
  });

  const slaOn = org?.sla_enabled ?? true;

  const { data: res } = useQuery({
    queryKey: ["sla-alert-count", org?.id],
    queryFn: () => countFn({ data: { orgId: org!.id } }),
    enabled: !!org?.id && slaOn,
    // SEM refetchInterval (§2.1): invalidado via Realtime no use-org-realtime.ts
  });

  return slaOn ? (res?.count ?? 0) : 0;
}