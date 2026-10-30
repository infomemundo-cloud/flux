import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  onNewDemanda?: (row: { id?: string; title?: string; protocol?: string }) => void;
};

export function useOrgRealtime({ orgId, onNewDemanda }: Options) {
  const qc = useQueryClient();
  
  // Referências para controlar o debounce e evitar disparos em rajada (Spikes/Gateway overflow)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!orgId) return;

    const debouncedInvalidate = (includeAggregates: boolean, delayMs = 1500) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      
      timeoutRef.current = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["demandas"] });
        if (includeAggregates) {
          qc.invalidateQueries({ queryKey: ["dashboard"] });
          qc.invalidateQueries({ queryKey: ["alertas"] });
        }
      }, delayMs);
    };

    const channel = supabase
      .channel(`org-live-${orgId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "demandas", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = (payload.new ?? {}) as { id?: string; title?: string; protocol?: string };
          debouncedInvalidate(true, 500);
          onNewDemanda?.(row ?? {});
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "demandas", filter: `org_id=eq.${orgId}` },
        () => {
          // Invalida contador de SLA e reposiciona o card no topo
          qc.invalidateQueries({ queryKey: ["sla-alert-count", orgId] });
          debouncedInvalidate(false, 1500);
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "demanda_events", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = (payload.new ?? {}) as { demanda_id?: string; kind?: string };
          const isSystem = !!(row.kind && SYSTEM_EVENT_KINDS.has(row.kind));

          if (isSystem) {
            if (row.demanda_id) {
              qc.invalidateQueries({ queryKey: ["demanda", row.demanda_id] });
            }
            debouncedInvalidate(true, 1000);
          } else {
            // Mensagens comuns (message_in/message_out):
            // Não invalida a query de detalhe (chat preserva append-only via demanda-live-${id})
            // e agrupa a atualização da fila com debounce de 5s para conversas ativas.
            debouncedInvalidate(false, 5000);
          }
        },
      )
      .subscribe();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [orgId, qc, onNewDemanda]);
}
