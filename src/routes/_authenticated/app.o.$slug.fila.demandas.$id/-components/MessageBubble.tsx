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

/**
 * Áudio com src CONGELADO no mount. A URL assinada (token de 1h) muda a cada
 * refetch de 8s; atualizar o atributo src de um <audio> em reprodução faz o
 * navegador RECARREGAR a mídia — era o bug do áudio que cortava no meio e
 * piscava. O key={caminho estável} no call site garante remount apenas quando
 * o objeto do Storage muda; token novo nunca mais recarrega o player.
 */
function StableAudio({ src, className }: { src: string; className?: string }) {
  const [fixed] = useState(src);
  return (
    <audio
      controls
      preload="metadata"
      src={fixed}
      className={className}
      onLoadedMetadata={(e) => {
        // Áudio gravado no navegador (webm/mp4 sem duração no header) chega
        // com duration = Infinity e o player mostra só 0:00. O seek gigante
        // força o browser a calcular a duração real; volta pro zero em seguida.
        const el = e.currentTarget;
        if (el.duration === Infinity) {
          el.currentTime = 1e101;
          el.ontimeupdate = () => {
            el.ontimeupdate = null;
            el.currentTime = 0;
          };
        }
      }}
    />
  );
}

/**
 * Imagem com src CONGELADO no mount (mesmo princípio do StableAudio): evita
 * refetch + flicker a cada refetch de 8s e cache-miss por token novo.
 */
function StableImg({
  src,
  alt,
  className,
  loading,
  onError,
  onClick,
}: {
  src: string;
  alt?: string;
  className?: string;
  loading?: "lazy" | "eager";
  onError?: () => void;
  onClick?: (e: React.MouseEvent<HTMLImageElement>) => void;
}) {
  const [fixed] = useState(src);
  return (
    <img
      src={fixed}
      alt={alt}
      className={className}
      loading={loading}
      onError={onError}
      onClick={onClick}
    />
  );
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
 * Metadados limpos e padronizados: Nome + [Badge] + ícone · timestamp —
 * SEM palavras redundantes ("Enviada" saiu): o badge de PAPEL aparece quando
 * existe (PROPRIETÁRIO/OPERADOR...); quando não existe, entra o badge de TIPO
 * (CLIENTE / NOTA INTERNA / EQUIPE). Mídia no padrão WhatsApp Web com src
 * congelado (StableAudio/StableImg) — poll de 8s não recarrega nada.
 */
export function MessageBubble({
  avatar,
  author,
  authorRole,
  rolePillClass,
  isClient,
  isOutgoing,
  isInternal,
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

  /**
   * Identidade ESTÁVEL dos objetos no Storage: o caminho da URL assinada
   * (tudo antes do "?"). A URL completa muda a cada refetch de 8s (token novo
   * de 1h) — o caminho só muda se o arquivo mudar. Usado como key (remount só
   * quando deve) e como dependência do reset de "quebrada" (sem loop de retry
   * a cada poll).
   */
  const mediaStableKey = media?.url ? media.url.split("?")[0] : null;
  const thumbStableKey = media?.thumbUrl ? media.thumbUrl.split("?")[0] : null;

  useEffect(() => {
    setImgBroken(false);
    setThumbBroken(false);
  }, [mediaStableKey, thumbStableKey]);

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
        {/* Metadados: Nome + [Badge papel OU tipo] + ícone · timestamp */}
        <div className="flex flex-wrap items-center gap-x-1.5 text-xs">
          <span className="font-semibold text-foreground">{author}</span>
          {authorRole ? (
            <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${rolePillClass}`}>
              {authorRole}
            </span>
          ) : (
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${
                isClient ? "pill-green" : isInternal ? "pill-neutral" : "pill-brand"
              }`}
            >
              {isClient ? "Cliente" : isInternal ? "Nota interna" : "Equipe"}
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
            {when}
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
                  <StableImg
                    key={mediaStableKey ?? media.url}
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
              {isAudio && (
                <StableAudio
                  key={mediaStableKey ?? media.url}
                  src={media.url}
                  className="w-full max-w-[320px]"
                />
              )}
              {isVideo && (
                <div className="w-full max-w-[320px] overflow-hidden rounded-lg border border-border/60 bg-secondary/40">
                  {/* Card de preview estilo WhatsApp: thumb + play sobreposto.
                      Nenhum <video> é montado na bolha — zero spinner/peso. */}
                  <button
                    type="button"
                    onClick={() => setLightbox(true)}
                    title="Reproduzir vídeo"
                    className="group/play relative block aspect-video w-full"
                  >
                    {media.thumbUrl && !thumbBroken ? (
                      <StableImg
                        key={thumbStableKey ?? media.thumbUrl}
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
                      <span className="absolute bottom-1.5 right-1.5 rounded bg-black/60 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-white backdrop-blur-sm">
                        {infoChips}
                      </span>
                    )}
                  </button>
                  <div className="flex items-center justify-between gap-2 border-t border-border/60 px-2 py-1.5">
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
          {isVideo ? (
            /* Viewer na mesma aba (padrão WhatsApp Web):
               - key = caminho estável do objeto (NUNCA a URL assinada volátil)
               - <source> (não src direto no video): mudar atributo de <source>
                 NÃO recarrega o player sozinho — proteção extra contra o poll
               - poster = frame imediato antes do primeiro buffer */
            <video
              key={mediaStableKey ?? media.url}
              controls
              autoPlay
              playsInline
              preload="metadata"
              poster={media.thumbUrl ?? undefined}
              className="w-full max-h-[85vh] rounded-lg shadow-lg object-contain bg-black"
              onClick={(e) => e.stopPropagation()}
            >
              <source src={media.url} type={media.mimeType ?? "video/mp4"} />
              Seu navegador não suporta a exibição deste vídeo.
            </video>
          ) : (
            <StableImg
              key={mediaStableKey ?? media.url}
              src={media.url}
              alt={media.fileName ?? "Imagem da conversa"}
              className="max-h-full max-w-full rounded-lg shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </li>
  );
}