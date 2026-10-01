import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Kinds de demanda_events que alteram KPIs/SLA (agregados precisam refetch). */
const SYSTEM_EVENT_KINDS = new Set([
  "created",
  "state_changed",
  "assigned",
  "priority_changed",
  "due_updated",
  "closed",
]);

type Options = {
  orgId?: string | null;
  /** Called for every new demanda inserted in this org. */
  onNewDemanda?: (row: { id?: string; title?: string; protocol?: string }) => void;
};

/**
 * Assina em tempo real SOMENTE os eventos que importam (INSERT):
 * - demandas INSERT → nova demanda: toast + fila + dashboard + alertas;
 * - demanda_events INSERT → nova mensagem/comentário/evento: invalida o
 *   detalhe daquela demanda + a fila (preview/ordem).
 * UPDATEs de demandas (campos de última mensagem e updated_at, escritos a
 * cada mensagem) NÃO são mais assinados: eram o maior volume de payload
 * Realtime por cliente conectado + invalidações em cascata — o INSERT do
 * evento já cobre a atualização da lista e do detalhe. Mudanças de
 * estado/atribuição/prazo também gravam evento, então nada fica sem sinal.
 * DELETE de demanda é coberto pela invalidação da própria mutation no route.
 * Ciclo de otimização de egress/logs (grace Supabase até 30/out): menos
 * mensagens Realtime = menos payload = menos refetch = menos log.
 */
export function useOrgRealtime({ orgId, onNewDemanda }: Options) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!orgId) return;
    const channel = supabase
      .channel(`org-live-${orgId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "demandas", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = (payload.new ?? {}) as { id?: string; title?: string; protocol?: string };
          qc.invalidateQueries({ queryKey: ["demandas"] });
          qc.invalidateQueries({ queryKey: ["dashboard"] });
          qc.invalidateQueries({ queryKey: ["alertas"] });
          onNewDemanda?.(row ?? {});
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "demanda_events", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = (payload.new ?? {}) as { demanda_id?: string; kind?: string };
          if (row.demanda_id) qc.invalidateQueries({ queryKey: ["demanda", row.demanda_id] });
          qc.invalidateQueries({ queryKey: ["demandas"] });
          // Agregados (dashboard/alertas) só em evento de sistema —
          // mensagem nova não muda KPI/SLA, não paga o refetch.
          if (row.kind && SYSTEM_EVENT_KINDS.has(row.kind)) {
            qc.invalidateQueries({ queryKey: ["dashboard"] });
            qc.invalidateQueries({ queryKey: ["alertas"] });
          }
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, qc, onNewDemanda]);
}