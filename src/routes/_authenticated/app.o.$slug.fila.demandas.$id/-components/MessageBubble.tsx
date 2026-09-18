import { useEffect, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Download,
  FileText,
  Image as ImageIcon,
  Lock,
  MessageCircle,
  Reply,
  X,
} from "lucide-react";

/** Snapshot da mensagem citada (reply estilo WhatsApp). */
export type QuotedRef = { author?: string; content?: string; kind?: string };

/**
 * Mídia anexada ao evento. `url` é a URL ASSINADA (bucket privado) gerada no
 * getDemanda; `failedReason` vem de metadata.media_failed quando o pipeline
 * de ingestão não conseguiu persistir o arquivo (a mensagem NÃO some por isso).
 */
export type BubbleMedia = {
  mediaKind: string | null;
  mimeType: string | null;
  url: string | null;
  fileName: string | null;
  failedReason: string | null;
};

function MediaFallback({
  label,
  reason,
  onRetry,
}: {
  label: string;
  reason: string | null;
  onRetry?: () => void;
}) {
  return (
    <div className="mt-2 flex w-full max-w-[320px] items-center gap-2 rounded-lg border border-dashed border-border/80 bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground">
      <ImageIcon className="h-4 w-4 shrink-0 opacity-70" />
      <span className="min-w-0 flex-1 truncate">
        {label}
        {reason ? ` (${reason})` : ""}
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-md border border-border bg-card px-1.5 py-0.5 text-[10px] font-semibold text-foreground transition hover:border-primary/40"
        >
          Tentar de novo
        </button>
      )}
    </div>
  );
}

/**
 * Uma bolha de mensagem (cliente recebida / saída WhatsApp / comentário interno).
 * Puramente apresentacional: o route decide avatar, textos e callbacks.
 * Mídia: imagem vira thumbnail clicável (lightbox próprio), áudio/vídeo usam
 * players nativos, documento vira card de download; qualquer falha de URL cai
 * no fallback claro (mesmo princípio do onError do ContactAvatar).
 */
export function MessageBubble({
  avatar,
  author,
  authorRole,
  rolePillClass,
  isClient,
  isOutgoing,
  isInternal,
  messageLabel,
  when,
  content,
  quoted,
  media,
  onReply,
  onRetryMedia,
}: {
  avatar: ReactNode;
  author: string;
  authorRole: string | null;
  rolePillClass: string;
  isClient: boolean;
  isOutgoing: boolean;
  isInternal?: boolean;
  messageLabel: string;
  when: string;
  content?: string | null;
  quoted?: QuotedRef | null;
  media?: BubbleMedia | null;
  onReply?: () => void;
  onRetryMedia?: () => void;
}) {
  const [lightbox, setLightbox] = useState(false);
  const [imgBroken, setImgBroken] = useState(false);

  useEffect(() => setImgBroken(false), [media?.url]);
  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setLightbox(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox]);

  const isImage =
    !!media &&
    (media.mimeType?.startsWith("image/") ||
      media.mediaKind === "imageMessage" ||
      media.mediaKind === "stickerMessage");
  const isAudio = !!media && (media.mimeType?.startsWith("audio/") || media.mediaKind === "audioMessage");
  const isVideo = !!media && (media.mimeType?.startsWith("video/") || media.mediaKind === "videoMessage");

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
            : "border border-dashed border-border/80 border-l-[3px] border-l-[var(--pill-neutral-fg)] bg-secondary/40"
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
            ·{" "}
            {isOutgoing ? (
              <CheckCircle2 className="h-3 w-3 text-primary" />
            ) : isInternal ? (
              <Lock className="h-3 w-3" />
            ) : (
              <MessageCircle className="h-3 w-3" />
            )}{" "}
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
        {media &&
          (media.url ? (
            <div className="mt-2">
              {isImage && !imgBroken && (
                <button
                  type="button"
                  onClick={() => setLightbox(true)}
                  title="Ampliar imagem"
                  className="block w-full max-w-[220px] overflow-hidden rounded-lg border border-border/60 bg-secondary/40 transition hover:border-primary/40"
                >
                  <img
                    src={media.url}
                    alt={media.fileName ?? "Imagem da conversa"}
                    loading="lazy"
                    className="max-h-56 w-full object-cover"
                    onError={() => setImgBroken(true)}
                  />
                </button>
              )}
              {isImage && imgBroken && (
                <MediaFallback label="Imagem indisponível" reason={media.failedReason} onRetry={onRetryMedia} />
              )}
              {isAudio && <audio controls preload="metadata" src={media.url} className="w-full max-w-[320px]" />}
              {isVideo && (
                <video
                  controls
                  preload="metadata"
                  src={media.url}
                  className="max-h-64 w-full max-w-[320px] rounded-lg border border-border/60 bg-black"
                />
              )}
              {!isImage && !isAudio && !isVideo && (
                <a
                  href={media.url}
                  download={media.fileName ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full max-w-[320px] items-center gap-2 rounded-lg border border-border/60 bg-secondary/40 px-3 py-2 text-xs font-medium text-foreground transition hover:border-primary/40 hover:bg-secondary/70"
                >
                  <FileText className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate">{media.fileName ?? "Documento"}</span>
                  <Download className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                </a>
              )}
            </div>
          ) : (
            <MediaFallback label="Mídia indisponível" reason={media.failedReason} onRetry={onRetryMedia} />
          ))}
        {content && (
          <div className="mt-1.5 whitespace-pre-wrap break-words text-sm text-foreground/90">{content}</div>
        )}
      </div>
      {lightbox && media?.url && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-6"
          role="dialog"
          aria-modal="true"
          onClick={() => setLightbox(false)}
        >
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => setLightbox(false)}
            className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-lg bg-white/10 text-white transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={media.url}
            alt={media.fileName ?? "Imagem da conversa"}
            className="max-h-full max-w-full rounded-lg shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </li>
  );
}