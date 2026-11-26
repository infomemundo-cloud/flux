// src/hooks/use-feature-flags.ts
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { evaluateFeatureFlags } from "@/lib/feature-flag.functions";

/**
 * Hook client para avaliar feature flags no contexto do usuário.
 * Cache de 5min (staleTime) + memo server-side de 60s = propagação até ~5min.
 * Retorna `flags` como Record<string, boolean> e `isLoading`.
 * Uso: const { flags } = useFeatureFlags(orgId); if (flags.product_feedback) ...
 */
export function useFeatureFlags(orgId: string | null | undefined) {
  const evalFn = useServerFn(evaluateFeatureFlags);
  const { data, isLoading } = useQuery({
    queryKey: ["feature-flags", orgId],
    queryFn: () => evalFn({ data: { orgId: orgId! } }),
    enabled: !!orgId,
    staleTime: 5 * 60 * 1000, // 5min
    refetchOnWindowFocus: false,
  });
  return { flags: data ?? {}, isLoading };
}
