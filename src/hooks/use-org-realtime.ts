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

  // Refs de controle do debounce — NO TOPO DO HOOK (Rules of Hooks)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fireAtRef = useRef<number>(0);

  useEffect(() => {
    if (!orgId) return;

    // Deadline mínimo: evento novo NUNCA adia um invalidate já agendado
    const debouncedInvalidate = (includeAggregates: boolean, delayMs = 1500) => {
      const planned = Date.now() + delayMs;
      if (timeoutRef.current && fireAtRef.current <= planned) return;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      fireAtRef.current = planned;
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        fireAtRef.current = 0;
        qc.invalidateQueries({ queryKey: ["demandas"] });
        if (includeAggregates) {
          qc.invalidateQueries({ queryKey: ["dashboard"] });
          qc.invalidateQueries({ queryKey: ["alertas"] });
          qc.invalidateQueries({ queryKey: ["sla-alerts"] });
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
          console.info("[org-live] frame INSERT demandas", row.protocol ?? row.id);
          debouncedInvalidate(true, 500);
          onNewDemanda?.(row ?? {});
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "demandas", filter: `org_id=eq.${orgId}` },
        () => {
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
          console.info("[org-live] frame INSERT demanda_events", row.kind);
          if (isSystem) {
            if (row.demanda_id) {
              qc.invalidateQueries({ queryKey: ["demanda", row.demanda_id] });
            }
            debouncedInvalidate(true, 1000);
          } else {
            // Mensagem nova: invalida fila IMEDIATAMENTE (barato: 1 server fn)
            qc.invalidateQueries({ queryKey: ["demandas"] });
            qc.invalidateQueries({ queryKey: ["sla-alert-count", orgId] });
            debouncedInvalidate(true, 5000);
          }
        },
      )
      .subscribe((status) => {
        console.info("[org-live] status", status, new Date().toISOString());
        
        // RECONCILE NO HANDSHAKE: quando o canal finalmente fica SUBSCRIBED,
        // invalida a fila para compensar frames perdidos DURANTE o handshake
        // (janela de ~1-2s onde o tenant estava reinicializando).
        if (status === "SUBSCRIBED") {
          console.info("[org-live] reconcile pós-handshake: invalidando fila");
          qc.invalidateQueries({ queryKey: ["demandas"] });
          qc.invalidateQueries({ queryKey: ["sla-alert-count", orgId] });
        }
        
        // Reconcile em falha (mesmo padrão do canal do detalhe)
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          console.warn("[org-live] canal falhou, reconcile forçado");
          qc.invalidateQueries({ queryKey: ["demandas"] });
        }
      });

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      fireAtRef.current = 0;
      supabase.removeChannel(channel);
    };
  }, [orgId, qc, onNewDemanda]);
}
