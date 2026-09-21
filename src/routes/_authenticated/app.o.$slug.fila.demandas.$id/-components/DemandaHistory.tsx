import { useEffect, useRef, type ReactNode } from "react";
import {
  CalendarClock,
  CheckCircle2,
  Flag,
  GitBranch,
  Inbox,
  MessageCircle,
  UserCog,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { formatRelative, STATE_LABEL } from "@/components/demandas-ui";
import { MessageBubble, type BubbleMedia, type QuotedRef } from "./MessageBubble";
import { SystemLine } from "./SystemLine";
import { TeamAvatar } from "./TeamAvatar";
import { ContactAvatar } from "@/components/contact-avatar";

/**
 * Alvo de reply (citação) calculado pelo DemandaHistory a partir do evento.
 * O snapshot completo (author/content/kind) é passado pro composer, que grava
 * no metadata do comentário ou envia como quoted na mensagem do WhatsApp.
 */
export type ReplyTarget = {
  event_id: string;
  author: string;
  content: string;
  kind: string;
  message_id?: string | null;
  from_me?: boolean;
  participant?: string | null;
};

type DemandaHistoryProps = {
  demandaId: string;
  events: any[];
  description: string | null;
  contactName: string;
  contactAvatarUrl: string | null;
  isGroupChat: boolean;
  nameOf: (uid?: string | null, fallback?: string) => string;
  roleOf: (uid?: string | null) => string | null;
  isAIOf: (uid?: string | null) => boolean;
  onReply: (target: ReplyTarget) => void;
  onRetryMedia: () => void;
};

/**
 * Ícone + texto de cada evento de sistema. O SystemLine é apresentacional
 * (recebe icon/children/when prontos), então a composição de linguagem
 * ("Fulano mudou o estado de X para Y") vive aqui, junto dos dados.
 */
function systemLineFor(
  e: any,
  nameOf: (uid?: string | null, fallback?: string) => string,
): { icon: LucideIcon; text: string } | null {
  const actor = nameOf(e.actor_id, "Sistema");
  const stateLabel = (v: any) => (v ? ((STATE_LABEL as Record<string, string>)[v] ?? v) : "—");
  switch (e.kind) {
    case "created":
      return { icon: Inbox, text: `Demanda criada por ${actor}` };
    case "state_changed":
      return {
        icon: GitBranch,
        text: `${actor} mudou o estado de ${stateLabel(e.from_value)} para ${stateLabel(e.to_value)}`,
      };
    case "assigned": {
      const from = e.from_value ? nameOf(e.from_value) : null;
      const to = e.to_value ? nameOf(e.to_value) : null;
      if (to && from) return { icon: UserCog, text: `Responsável alterado de ${from} para ${to}` };
      if (to) return { icon: UserCog, text: `Atribuída a ${to}` };
      return { icon: UserCog, text: `Responsável removido${from ? ` (${from})` : ""}` };
    }
    case "priority_changed":
      return {
        icon: Flag,
        text: `${actor} mudou a prioridade de ${e.from_value ?? "—"} para ${e.to_value ?? "—"}`,
      };
    case "due_updated":
      return { icon: CalendarClock, text: `${actor} atualizou o prazo` };
    case "closed":
      return { icon: CheckCircle2, text: `Demanda concluída${e.actor_id ? ` por ${actor}` : ""}` };
    default:
      return null;
  }
}

export function DemandaHistory({
  events,
  description,
  contactName,
  contactAvatarUrl,
  nameOf,
  roleOf,
  isAIOf,
  onReply,
  onRetryMedia,
}: DemandaHistoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const lastCountRef = useRef(0);

  // Auto-scroll só quando chega evento novo (não no primeiro load).
  useEffect(() => {
    if (events.length > lastCountRef.current && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
    lastCountRef.current = events.length;
  }, [events.length]);

  const avatarFor = (uid?: string | null, isClient?: boolean): ReactNode => {
    if (isClient) return <ContactAvatar url={contactAvatarUrl} name={contactName} size="sm" tone="client" />;
    return <TeamAvatar name={nameOf(uid)} isAI={isAIOf(uid)} />;
  };

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3 space-y-1">
      {description && (
        <div className="ml-10 rounded-lg border border-dashed border-border/60 bg-secondary/30 px-3 py-2 text-xs text-muted-foreground">
          {description}
        </div>
      )}
      {events.map((e: any) => {
        if (e.kind === "message_in" || e.kind === "message_out" || e.kind === "commented") {
          const isClient = e.kind === "message_in";
          const isInternal = e.kind === "commented";
          const isOutgoing = e.kind === "message_out";
          const quoted = e.metadata?.quoted as QuotedRef | null;
          const media: BubbleMedia | null = e.media_url
            ? {
                mediaKind: e.metadata?.media_kind ?? null,
                mimeType: e.media_type ?? null,
                url: e.media_url_signed ?? null,
                fileName: e.file_name ?? null,
                failedReason: e.metadata?.media_failed ?? null,
                seconds: e.metadata?.media_seconds ?? null,
                bytes: e.metadata?.media_bytes ?? null,
                thumbUrl: e.media_thumb_signed ?? null,
              }
            : null;

          return (
            <MessageBubble
              key={e.id}
              avatar={avatarFor(e.actor_id, isClient)}
              author={nameOf(e.actor_id, isClient ? contactName : "Sistema")}
              authorRole={roleOf(e.actor_id)}
              rolePillClass={isAIOf(e.actor_id) ? "pill-violet" : isClient ? "pill-green" : "pill-brand"}
              isClient={isClient}
              isOutgoing={isOutgoing}
              isInternal={isInternal}
              messageLabel={isClient ? "Cliente" : isInternal ? "Nota interna" : "Enviada"}
              when={formatRelative(e.created_at)}
              content={e.content}
              quoted={quoted}
              media={media}
              onReply={() =>
                onReply({
                  event_id: e.id,
                  author: nameOf(e.actor_id, isClient ? contactName : "Sistema"),
                  content: e.content ?? "[mídia]",
                  kind: e.kind,
                  message_id: e.metadata?.message_id,
                  from_me: isOutgoing,
                  participant: e.metadata?.participant_name ?? null,
                })
              }
              onRetryMedia={onRetryMedia}
            />
          );
        }
        const line = systemLineFor(e, nameOf);
        if (!line) return null;
        const Icon = line.icon;
        // Recuo próprio (pl-6) pra linha de sistema não ficar colada na
        // borda da coluna: o ícone alinha sob o conteúdo dos balões, não
        // sob o avatar — respiração visual longe da sidebar.
        return (
          <div key={e.id} className="pl-6 pr-2 py-0.5">
            <SystemLine icon={Icon} when={formatRelative(e.created_at)}>
              {line.text}
            </SystemLine>
          </div>
        );
      })}
      {events.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
            <MessageCircle className="h-5 w-5" strokeWidth={1.8} />
          </div>
          <div className="text-sm font-semibold text-foreground">Nenhuma mensagem ainda</div>
          <p className="text-xs text-muted-foreground max-w-[240px]">
            Envie uma mensagem ou espere o cliente entrar em contato.
          </p>
        </div>
      )}
    </div>
  );
}