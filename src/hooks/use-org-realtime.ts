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

    const debouncedInvalidate = (includeAggregates: boolean) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      
      timeoutRef.current = setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["demandas"] });
        if (includeAggregates) {
          qc.invalidateQueries({ queryKey: ["dashboard"] });
          qc.invalidateQueries({ queryKey: ["alertas"] });
        }
      }, 1500); // Agrupa todas as mensagens/eventos em uma única chamada a cada 1.5s
    };

    const channel = supabase
      .channel(`org-live-${orgId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "demandas", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = (payload.new ?? {}) as { id?: string; title?: string; protocol?: string };
          debouncedInvalidate(true);
          onNewDemanda?.(row ?? {});
        },
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "demanda_events", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = (payload.new ?? {}) as { demanda_id?: string; kind?: string };
          if (row.demanda_id) {
            // Invalidação pontual do detalhe pode ser imediata ou debounced
            qc.invalidateQueries({ queryKey: ["demanda", row.demanda_id] });
          }
          const isSystem = !!(row.kind && SYSTEM_EVENT_KINDS.has(row.kind));
          debouncedInvalidate(isSystem);
        },
      )
      .subscribe();

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      supabase.removeChannel(channel);
    };
  }, [orgId, qc, onNewDemanda]);
}
