import type { ReactNode } from "react";
import { CheckCircle2, MessageCircle, Reply } from "lucide-react";

/** Snapshot da mensagem citada (reply estilo WhatsApp). */
export type QuotedRef = { author?: string; content?: string; kind?: string };

/**
 * Reserva pro módulo de mídias: quando eventos message_in/message_out
 * trouxerem anexo, o route passa `media` e a bolha já sabe onde renderizar.
 * Hoje nunca é preenchido — comportamento atual permanece idêntico.
 */
export type MessageMedia = {
  kind: "image" | "audio" | "document";
  url?: string;
  name?: string;
};

/**
 * Uma bolha de mensagem (cliente recebida / saída WhatsApp / comentário interno).
 * Puramente apresentacional: o route decide avatar, textos e o callback de reply.
 */
export function MessageBubble({
  avatar,
  author,
  authorRole,
  rolePillClass,
  isClient,
  isOutgoing,
  messageLabel,
  when,
  content,
  quoted,
  media,
  onReply,
}: {
  avatar: ReactNode;
  author: string;
  authorRole: string | null;
  rolePillClass: string;
  isClient: boolean;
  isOutgoing: boolean;
  messageLabel: string;
  when: string;
  content?: string | null;
  quoted?: QuotedRef | null;
  media?: MessageMedia | null;
  onReply?: () => void;
}) {
  return (
    <li className={`group relative flex gap-2.5 pt-2 ${isClient ? "" : "sm:pl-8"}`}>
      {onReply && (
        <button
          type="button"
          onClick={onReply}
          title="Responder esta mensagem"
          aria-label="Responder esta mensagem"
          className="absolute right-1.5 top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 place-items-center rounded-md border border-border bg-card text-muted-foreground shadow-sm transition hover:border-primary/40 hover:text-foreground group-hover:grid"
        >
          <Reply className="h-3 w-3" strokeWidth={2.2} />
        </button>
      )}
      {avatar}
      <div
        className={`min-w-0 flex-1 rounded-xl px-3.5 py-2.5 ${
          isClient
            ? "border border-border border-l-[3px] border-l-[var(--pill-green-fg)] bg-card shadow-[var(--shadow-card)]"
            : isOutgoing
            ? "border border-primary/20 border-l-[3px] border-l-primary bg-primary/[0.04]"
            : "border border-primary/15 bg-primary/[0.02]"
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-1.5 text-xs">
          <span className="font-semibold text-foreground">{author}</span>
          {authorRole && (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${rolePillClass}`}>
              {authorRole}
            </span>
          )}
          <span className="text-muted-foreground inline-flex items-center gap-1">
            · {isOutgoing ? <CheckCircle2 className="h-3 w-3 text-primary" /> : <MessageCircle className="h-3 w-3" />}{" "}
            {messageLabel} · {when}
          </span>
        </div>
        {quoted && (
          <div
            className={`mt-1.5 rounded-md border-l-2 bg-secondary/70 px-2.5 py-1.5 ${
              quoted.kind === "message_in" ? "border-l-[var(--pill-green-fg)]" : "border-l-primary"
            }`}
          >
            <span className="text-[11px] font-semibold text-foreground/80">{quoted.author}</span>
            <span className="ml-1.5 line-clamp-2 text-[11px] text-muted-foreground">
              {quoted.content || "(sem texto)"}
            </span>
          </div>
        )}
        {media && (
          <div className="mt-1.5 rounded-md border border-border/60 bg-secondary/50 px-2.5 py-1.5 text-[11px] text-muted-foreground">
            {media.kind === "image" ? "Imagem" : media.kind === "audio" ? "Áudio" : "Documento"}
            {media.name ? ` · ${media.name}` : ""} (visualização chega com o módulo de mídias)
          </div>
        )}
        {content && (
          <div className="mt-1.5 whitespace-pre-wrap break-words text-sm text-foreground/90">{content}</div>
        )}
      </div>
    </li>
  );
}
