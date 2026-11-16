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

/** Payload de notificação de mensagem recebida (montado do frame Realtime). */
export type IncomingMessageEvent = {
  id: string;
  demandaId: string;
  content: string | null;
  contactName: string | null;
  participantName: string | null;
  mediaType: string | null;
  mediaKind: string | null;
  fileName: string | null;
};

type Options = {
  orgId?: string | null;
  onNewDemanda?: (row: { id?: string; title?: string; protocol?: string }) => void;
  onNewMessage?: (msg: IncomingMessageEvent) => void;
};

export function useOrgRealtime({ orgId, onNewDemanda, onNewMessage }: Options) {
  const qc = useQueryClient();

  // Refs de controle do debounce — NO TOPO DO HOOK (Rules of Hooks).
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fireAtRef = useRef<number>(0);

  // Callbacks via REF: o canal NÃO re-assina quando o layout re-renderiza.
  // (Antes, identidade de função mudava → removeChannel + reconexão →
  // brechas onde frames se perdiam.)
  const onNewDemandaRef = useRef(onNewDemanda);
  const onNewMessageRef = useRef(onNewMessage);
  useEffect(() => {
    onNewDemandaRef.current = onNewDemanda;
    onNewMessageRef.current = onNewMessage;
  }, [onNewDemanda, onNewMessage]);

  useEffect(() => {
    if (!orgId) return;

    // Deadline mínimo: evento novo NUNCA adia um invalidate já agendado
    // (sem isso, conversa movimentada reagenda o timer para sempre).
    const debouncedInvalidate = (includeAggregates: boolean, delayMs = 1500) => {
      const planned = Date.now() + delayMs;
      if (timeoutRef.current && fireAtRef.current <= planned) return; // já existe prazo mais cedo
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      fireAtRef.current = planned;
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        fireAtRef.current = 0;
        qc.invalidateQueries({ queryKey: ["demandas"] });
        if (includeAggregates) {
          qc.invalidateQueries({ queryKey: ["dashboard"] });
          qc.invalidateQueries({ queryKey: ["alertas"] });
          // Key REAL da página Alertas (["sla-alerts", orgId, janela]).
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
          const row = (payload.new ?? {}) as {
            id?: string;
            title?: string;
            protocol?: string;
            last_message_id?: string | null;
          };
          console.info("[org-live] frame INSERT demandas", row.protocol ?? row.id);
          debouncedInvalidate(true, 500);
          // Toast de "nova demanda" SÓ quando a demanda nasce SEM mensagem
          // anexada (criação manual/API seca). Demanda nascida de mensagem
          // (last_message_id presente) é notificada pelo message_in — mais
          // rico (nome + texto) e sem toast duplicado.
          if (!row.last_message_id) {
            onNewDemandaRef.current?.(row ?? {});
          }
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
          const row = (payload.new ?? {}) as {
            id?: string;
            demanda_id?: string;
            kind?: string;
            content?: string | null;
            media_type?: string | null;
            file_name?: string | null;
            metadata?: Record<string, any> | null;
          };
          const isSystem = !!(row.kind && SYSTEM_EVENT_KINDS.has(row.kind));
          console.info("[org-live] frame INSERT demanda_events", row.kind);
          if (isSystem) {
            if (row.demanda_id) {
              qc.invalidateQueries({ queryKey: ["demanda", row.demanda_id] });
            }
            debouncedInvalidate(true, 1000);
          } else {
            // Fila é BARATA (1 server fn, sem assinatura de mídia): atualiza no
            // frame. O refetch PESADO do detalhe continua proibido por mensagem
            // (chat é append-only via demanda-live-${id}).
            qc.invalidateQueries({ queryKey: ["demandas"] });
            qc.invalidateQueries({ queryKey: ["sla-alert-count", orgId] });
            debouncedInvalidate(true, 5000);
            // ◆ NOTIFICAÇÃO "CHEGOU MENSAGEM" ◆ só message_in; as proteções
            // anti-spam (visão atual + cooldown) vivem no callback do layout.
            if (row.kind === "message_in") {
              const meta = row.metadata ?? {};
              onNewMessageRef.current?.({
                id: row.id ?? "",
                demandaId: row.demanda_id ?? "",
                content: row.content ?? null,
                contactName: meta.contact_name ?? null,
                participantName: meta.participant_name ?? null,
                mediaType: row.media_type ?? null,
                mediaKind: meta.media_kind ?? null,
                fileName: row.file_name ?? null,
              });
            }
          }
        },
      )
      .subscribe((status) => {
        // Canal não é mais cego: status visível no console + reconcile em falha.
        console.info("[org-live] status", status, new Date().toISOString());
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          qc.invalidateQueries({ queryKey: ["demandas"] });
        }
      });

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      fireAtRef.current = 0;
      supabase.removeChannel(channel);
    };
  }, [orgId, qc]);
}
