import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getOrgBySlug } from "@/lib/orgs.functions";
import { slaAlerts } from "@/lib/demandas/demandas-analytics.functions";

/**
 * Contagem de demandas paradas (Alertas SLA) pro badge da sidebar e do nav
 * mobile. Reusa a MESMA server fn da página /alertas com a janela default
 * (staleDays = 2): badge e página nunca divergem na REGRA; se o usuário
 * mudar o seletor de dias dentro da página, o badge permanece na janela
 * default (comportamento documentado — badge é sinal fixo, não espelho do
 * seletor).
 *
 * Duas queries, ambas dedupadas por cache:
 * - org pela key ["org", slug] (mesma key do layout/rotas → zero request extra);
 * - alertas pela key ["sla-alerts", orgId] com staleTime 60s e SEM
 *   refetchInterval: é sinal operacional, não ticker — sidebar e mobile nav
 *   chamam o mesmo hook e compartilham o mesmo cache (1 request só).
 */
export function useSlaAlertCount(slug: string | undefined): number {
  const orgFn = useServerFn(getOrgBySlug);
  const alertsFn = useServerFn(slaAlerts);

  const { data: org } = useQuery({
    queryKey: ["org", slug],
    queryFn: () => orgFn({ data: { slug: slug! } }),
    enabled: !!slug,
  });

  const { data: alerts } = useQuery({
    queryKey: ["sla-alerts", org?.id],
    queryFn: () => alertsFn({ data: { orgId: org!.id } }),
    enabled: !!org?.id,
    staleTime: 60_000,
  });

  return alerts?.length ?? 0;
}