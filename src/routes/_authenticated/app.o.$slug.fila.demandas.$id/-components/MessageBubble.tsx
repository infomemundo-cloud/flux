import { useEffect, useState, type ReactNode } from "react";
import {
  CheckCircle2,
  Download,
  FileText,
  Image as ImageIcon,
  Lock,
  MessageCircle,
  Play,
  Reply,
  Video,
  X,
} from "lucide-react";

/** Snapshot da mensagem citada (reply estilo WhatsApp). */
export type QuotedRef = { author?: string; content?: string; kind?: string };

/**
 * Mídia anexada ao evento. `url` é a URL ASSINADA (bucket privado) gerada no
 * getDemanda; `thumbUrl` é a URL assinada do thumbnail de vídeo (jpeg que o
 * WhatsApp manda no payload, persistido no ingest); `seconds`/`bytes` vêm do
 * metadata gravado no ingest; `failedReason` vem de metadata.media_failed.
 */
export type BubbleMedia = {
  mediaKind: string | null;
  mimeType: string | null;
  url: string | null;
  fileName: string | null;
  failedReason: string | null;
  seconds: number | null;
  bytes: number | null;
  thumbUrl: string | null;
};

function formatDuration(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.round(totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

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
    <div className="mt-2 flex w-full max-w-[320px] items-center gap-2 rounded-xl border border-dashed border-border/70 bg-secondary/40 px-3 py-2 text-[11px] text-muted-foreground">
      <ImageIcon className="h-4 w-4 shrink-0 opacity-70" />
      <span className="min-w-0 flex-1 truncate">
        {label}
        {reason ? ` (${reason})` : ""}
      </span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="shrink-0 rounded-lg bg-card px-1.5 py-0.5 text-[10px] font-semibold text-foreground ring-1 ring-border/60 transition hover:ring-primary/40"
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
 * Redesign: bolhas rounded-2xl sem bordas duras — a separação vem do fundo
 * tintado + ring sutil + sombra flutuante. Mídia no padrão WhatsApp Web:
 * imagem = thumbnail clicável (lightbox); vídeo = card de preview (thumb +
 * play sobreposto + chips de duração/tamanho) que abre o viewer na mesma aba;
 * áudio = player nativo; documento = card de download. Qualquer falha de URL
 * cai no fallback claro. Zero inline style: só classes utilitárias Tailwind.
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
  const [thumbBroken, setThumbBroken] = useState(false);

  useEffect(() => {
    setImgBroken(false);
    setThumbBroken(false);
  }, [media?.url, media?.thumbUrl]);

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

  const infoChips =
    media && (media.seconds != null || media.bytes != null)
      ? [
          media.seconds != null ? formatDuration(media.seconds) : null,
          media.bytes != null ? formatBytes(media.bytes) : null,
        ]
          .filter(Boolean)
          .join(" · ")
      : null;

  /**
   * Identidade ESTÁVEL do objeto no Storage: o caminho da URL assinada (tudo
   * antes do "?"). A URL completa muda a cada refetch de 8s (token novo de 1h)
   * — usá-la como key recriava o player em loop e travava o modal. O caminho
   * só muda se o arquivo mudar: remount acontece apenas quando deve.
   */
  const mediaStableKey = media?.url ? media.url.split("?")[0] : null;

  return (
    <li className={`group relative flex gap-2.5 pt-2 ${isClient ? "" : "sm:pl-8"}`}>
      {onReply && (
        <button
          type="button"
          onClick={onReply}
          title="Responder esta mensagem"
          aria-label="Responder esta mensagem"
          className="absolute right-1.5 top-1/2 z-10 hidden h-6 w-6 -translate-y-1/2 place-items-center rounded-lg bg-card text-muted-foreground shadow-[var(--shadow-card)] ring-1 ring-border/50 transition hover:text-foreground hover:ring-primary/40 group-hover:grid"
        >
          <Reply className="h-3 w-3" strokeWidth={2.2} />
        </button>
      )}
      {avatar}
      <div
        className={`min-w-0 flex-1 px-4 py-3 ${
          isClient
            ? "rounded-2xl rounded-tl-md bg-card shadow-[var(--shadow-card)] ring-1 ring-border/50"
            : isOutgoing
              ? "rounded-2xl rounded-tr-md bg-primary/10 ring-1 ring-primary/15"
              : "rounded-2xl rounded-tl-md border border-dashed border-border/60 bg-secondary/40"
        }`}
      >
        <div className="flex flex-wrap items-center gap-x-1.5 text-xs">
          <span className="font-semibold text-foreground">{author}</span>
          {authorRole && (
            <span className={`rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${rolePillClass}`}>
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
            className={`mt-2 rounded-lg border-l-2 bg-secondary/70 px-2.5 py-1.5 ${
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
                  className="block w-full max-w-[220px] overflow-hidden rounded-xl bg-secondary/40 ring-1 ring-border/50 transition hover:ring-primary/40"
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
                <div className="w-full max-w-[320px] overflow-hidden rounded-xl bg-secondary/40 ring-1 ring-border/50">
                  {/* Card de preview estilo WhatsApp: thumb + play sobreposto.
                      Nenhum <video> é montado na bolha — zero spinner/peso. */}
                  <button
                    type="button"
                    onClick={() => setLightbox(true)}
                    title="Reproduzir vídeo"
                    className="group/play relative block aspect-video w-full"
                  >
                    {media.thumbUrl && !thumbBroken ? (
                      <img
                        src={media.thumbUrl}
                        alt=""
                        loading="lazy"
                        className="absolute inset-0 h-full w-full object-cover"
                        onError={() => setThumbBroken(true)}
                      />
                    ) : (
                      <span className="absolute inset-0 grid place-items-center bg-gradient-to-br from-secondary to-secondary/50">
                        <Video className="h-8 w-8 text-muted-foreground/50" />
                      </span>
                    )}
                    <span className="absolute inset-0 grid place-items-center">
                      <span className="grid h-12 w-12 place-items-center rounded-full bg-black/55 text-white backdrop-blur-sm transition group-hover/play:scale-105 group-hover/play:bg-black/70">
                        <Play className="h-5 w-5 translate-x-0.5" fill="currentColor" />
                      </span>
                    </span>
                    {infoChips && (
                      <span className="absolute bottom-1.5 right-1.5 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur-sm">
                        {infoChips}
                      </span>
                    )}
                  </button>
                  <div className="flex items-center justify-between gap-2 border-t border-border/50 px-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
                      {media.fileName ?? "Vídeo"}
                    </span>
                    <a
                      href={media.url}
                      download={media.fileName ?? undefined}
                      target="_blank"
                      rel="noreferrer"
                      title="Baixar vídeo"
                      className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                    >
                      <Download className="h-3.5 w-3.5" />
                    </a>
                  </div>
                </div>
              )}
              {!isImage && !isAudio && !isVideo && (
                <a
                  href={media.url}
                  download={media.fileName ?? undefined}
                  target="_blank"
                  rel="noreferrer"
                  className="flex w-full max-w-[320px] items-center gap-2 rounded-xl bg-secondary/40 px-3 py-2 text-xs font-medium text-foreground ring-1 ring-border/50 transition hover:bg-secondary/70 hover:ring-primary/40"
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
            className="absolute right-4 top-4 grid h-9 w-9 place-items-center rounded-xl bg-white/10 text-white transition hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          {isVideo ? (
            /* Viewer na mesma aba (padrão WhatsApp Web):
               - key = caminho estável do objeto (NUNCA a URL assinada volátil,
                 que muda a cada refetch de 8s e recriava o player em loop)
               - <source type> = decisão de codec sem sniffing
               - poster = frame imediato antes do primeiro buffer
               - preload="metadata" + autoPlay: autoplay puxa o stream; o
                 metadata evita pré-carga onde autoplay não está disponível */
            <video
              key={mediaStableKey ?? media.url}
              controls
              autoPlay
              playsInline
              preload="metadata"
              poster={media.thumbUrl ?? undefined}
              className="w-full max-h-[85vh] rounded-xl shadow-lg object-contain bg-black"
              onClick={(e) => e.stopPropagation()}
            >
              <source src={media.url} type={media.mimeType ?? "video/mp4"} />
              Seu navegador não suporta a exibição deste vídeo.
            </video>
          ) : (
            <img
              key={mediaStableKey ?? media.url}
              src={media.url}
              alt={media.fileName ?? "Imagem da conversa"}
              className="max-h-full max-w-full rounded-xl shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </li>
  );
}