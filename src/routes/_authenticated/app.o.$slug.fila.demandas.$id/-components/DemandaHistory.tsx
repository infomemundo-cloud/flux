import { useEffect, useRef } from "react";
import { STATE_LABEL, formatRelative } from "@/components/demandas-ui";
import { ContactAvatar } from "@/components/contact-avatar";
import { GitBranch, Flag, AlertCircle, UserCheck, Circle } from "lucide-react";
import { SystemLine } from "./SystemLine";
import { MessageBubble, type BubbleMedia } from "./MessageBubble";
import { TeamAvatar } from "./TeamAvatar";

/**
 * Snapshot da mensagem sendo respondida (reply estilo WhatsApp).
 */
export type ReplyTarget = {
  event_id: string;
  author: string;
  content: string;
  kind: string;
  message_id: string | null;
  from_me: boolean;
  participant: string | null;
};

/**
 * Área 2 do detalhe: lista de eventos com rolagem própria e auto-scroll
 * pro final a cada mensagem nova (ou troca de demanda).
 * Puramente apresentacional: identidade dos atores e URLs assinadas de mídia
 * vêm prontas do route/getDemanda.
 */
export function DemandaHistory({
  demandaId,
  events,
  description,
  contactName,
  contactAvatarUrl,
  isGroupChat,
  nameOf,
  roleOf,
  isAIOf,
  onReply,
  onRetryMedia,
}: {
  demandaId: string;
  events: any[];
  description?: string | null;
  contactName: string;
  contactAvatarUrl: string | null;
  isGroupChat: boolean;
  nameOf: (uid?: string | null, fallback?: string) => string;
  roleOf: (uid?: string | null) => string | null;
  isAIOf: (uid?: string | null) => boolean;
  onReply: (target: ReplyTarget) => void;
  onRetryMedia?: () => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastEventId = events[events.length - 1]?.id;

  // Auto-scroll pro final quando chega mensagem nova ou troca a demanda.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [demandaId, lastEventId]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin p-4">
      {description && (
        <div className="mb-4 rounded-lg border border-dashed border-border bg-card/60 p-3 text-xs text-muted-foreground whitespace-pre-wrap">
          {description}
        </div>
      )}
      <ul className="space-y-1">
        {events.map((e: any) => {
          const isClient = e.kind === "message_in";
          const isOutgoing = e.kind === "message_out";
          const isComment = e.kind === "commented";
          const isChatMessage = isClient || isOutgoing || isComment;
          const when = formatRelative(e.created_at);

          if (!isChatMessage) {
            const fallbackByKind: Record<string, string> = {
              created: "Entrada externa",
              state_changed: "Automação",
              priority_changed: "Automação",
              assigned: "Atribuição automática",
            };
            const fallback = fallbackByKind[e.kind] ?? "Sistema";
            const who = <span className="font-semibold text-foreground/80">{nameOf(e.actor_id, fallback)}</span>;

            if (e.kind === "state_changed")
              return (
                <SystemLine key={e.id} icon={GitBranch} when={when}>
                  {who} mudou o estado de <b className="text-foreground/80">{STATE_LABEL[e.from_value] ?? e.from_value}</b> para{" "}
                  <b className="text-foreground/80">{STATE_LABEL[e.to_value] ?? e.to_value}</b>
                </SystemLine>
              );
            if (e.kind === "priority_changed")
              return (
                <SystemLine key={e.id} icon={Flag} when={when}>
                  {who} mudou a prioridade de <b className="text-foreground/80">{e.from_value}</b> para{" "}
                  <b className="text-foreground/80">{e.to_value}</b>
                </SystemLine>
              );
            if (e.kind === "created")
              return (
                <SystemLine key={e.id} icon={AlertCircle} when={when}>
                  {who} criou a demanda
                </SystemLine>
              );
            if (e.kind === "assigned")
              return (
                <SystemLine key={e.id} icon={UserCheck} when={when}>
                  {who} atribuiu para{" "}
                  <b className="text-foreground/80">{e.to_value ? nameOf(e.to_value, "usuário removido") : "sem responsável"}</b>
                </SystemLine>
              );
            return (
              <SystemLine key={e.id} icon={Circle} when={when}>
                {who} · {e.kind}
              </SystemLine>
            );
          }

          const author = isClient
            ? isGroupChat
              ? e.metadata?.participant_name ?? contactName
              : contactName
            : nameOf(e.actor_id, "Atendente");
          const authorRole = isClient ? "Cliente" : roleOf(e.actor_id);
          const isAI = isAIOf(e.actor_id);
          // Comentário interno ganha rótulo explícito: nunca confundir com
          // mensagem que foi (ou seria) enviada ao cliente.
          const messageLabel = isClient
            ? "mensagem recebida"
            : isOutgoing
            ? "resposta enviada"
            : "comentário interno";
          const quoted = e.metadata?.quoted as
            | undefined
            | { author?: string; content?: string; kind?: string };

          // Mídia: só monta o objeto se o evento tem linha de mídia OU falha
          // registrada; URL assinada é a única aceita (bucket privado).
          const failedReason: string | null = e.metadata?.media_failed ?? null;
          const media: BubbleMedia | null =
            e.media_url || failedReason
              ? {
                  mediaKind: e.metadata?.media_kind ?? null,
                  mimeType: e.media_type ?? null,
                  url: e.media_url ? (e.media_url_signed ?? null) : null,
                  fileName: e.file_name ?? null,
                  failedReason,
                }
              : null;

          return (
            <MessageBubble
              key={e.id}
              avatar={
                isClient ? (
                  <ContactAvatar url={contactAvatarUrl} name={author} size="sm" tone="client" />
                ) : (
                  <TeamAvatar name={author} isAI={isAI} size="sm" />
                )
              }
              author={author}
              authorRole={authorRole}
              rolePillClass={isClient ? "pill-green" : isAI ? "pill-violet" : "pill-brand"}
              isClient={isClient}
              isOutgoing={isOutgoing}
              isInternal={isComment}
              messageLabel={messageLabel}
              when={when}
              content={e.content}
              quoted={quoted}
              media={media}
              onReply={() =>
                onReply({
                  event_id: e.id,
                  author,
                  content: e.content ?? "",
                  kind: e.kind,
                  message_id: e.metadata?.message_id ?? null,
                  from_me: e.kind === "message_out",
                  participant: e.metadata?.participant_jid ?? null,
                })
              }
              onRetryMedia={onRetryMedia}
            />
          );
        })}
      </ul>
    </div>
  );
}