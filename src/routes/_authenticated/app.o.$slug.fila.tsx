import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

type Options = {
  orgId?: string | null;
  onNewDemanda?: (row: { id?: string; title?: string; protocol?: string }) => void;
};

export function useOrgRealtime({ orgId, onNewDemanda }: Options) {
  const qc = useQueryClient();

  const onNewDemandaRef = useRef(onNewDemanda);
  useEffect(() => {
    onNewDemandaRef.current = onNewDemanda;
  }, [onNewDemanda]);

  useEffect(() => {
    // Garante execução exclusiva no navegador e cancela se orgId não estiver disponível
    if (typeof window === "undefined" || !orgId) return;

    const refreshLists = () => {
      qc.invalidateQueries({ queryKey: ["demandas"] });
      qc.invalidateQueries({ queryKey: ["dashboard"] });
      qc.invalidateQueries({ queryKey: ["alertas"] });
    };

    const refreshDemanda = (id?: string | null) => {
      if (id) qc.invalidateQueries({ queryKey: ["demanda", id] });
      else qc.invalidateQueries({ queryKey: ["demanda"] });
    };

    const channel = supabase
      .channel(`org-live-${orgId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "demandas", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { id?: string; title?: string; protocol?: string };
          refreshLists();
          refreshDemanda(row?.id);
          if (payload.eventType === "INSERT") {
            onNewDemandaRef.current?.(row ?? {});
          }
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "demanda_events", filter: `org_id=eq.${orgId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { demanda_id?: string };
          refreshDemanda(row?.demanda_id);
          refreshLists();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [orgId, qc]);
}
