import { useEffect, useRef, useState, type RefObject } from "react";
import {
  Lock,
  MessageCircle,
  Mic,
  Paperclip,
  Send,
  Slash,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";

export type PendingAttachment = {
  file: File;
  previewUrl: string | null;
  kind: "image" | "audio" | "video" | "document";
};

function fmtRec(total: number): string {
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Preferência de container de gravação: o WhatsApp ACEITA audio/mp4 e
 * audio/ogg como mensagem de áudio, mas DESCARTA audio/webm na entrega
 * (o envio "dava certo" no Flux e nunca chegava no contato). Chrome/Safari
 * modernos gravam mp4; Firefox grava ogg; webm fica só como fallback legado.
 */
const RECORDER_MIME_PREFS = [
  "audio/mp4;codecs=mp4a.20",
  "audio/mp4",
  "audio/ogg;codecs=opus",
  "audio/webm;codecs=opus",
  "audio/webm",
];

function extForMime(mime: string): string {
  if (mime.includes("mp4")) return "m4a";
  if (mime.includes("ogg")) return "ogg";
  return "webm";
}

type DemandaComposerProps = {
  hasWhatsapp: boolean;
  viaWhatsapp: boolean;
  onViaWhatsappChange: (v: boolean) => void;
  comment: string;
  onCommentChange: (v: string) => void;
  replyTo: { author: string; content: string } | null;
  onCancelReply: () => void;
  onSend: () => void;
  onAttach: (file: File) => void;
  attachment: PendingAttachment | null;
  onRemoveAttachment: () => void;
  isPending: boolean;
  isUploading: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
};

/**
 * Área 3 do detalhe: toggle WhatsApp/Interno, banner de citação, textarea
 * que cresce, anexo funcional e GRAVAÇÃO DE ÁUDIO real (MediaRecorder).
 *
 * Gravador (spec travada):
 * - Mic substitui o textarea pelo painel: dot vermelho pulsante + cronômetro
 *   dinâmico + Cancelar (lixeira) + Concluir (avião);
 * - Concluir → blob vira File e entra como ANEXO preview (player simples +
 *   duração + KB + X), despachado junto com a legenda pelo botão principal;
 * - Permissão negada / navegador sem suporte → toast discreto, composer
 *   intacto no modo texto (nunca crasha).
 * O áudio gravado reusa 100% do pipeline de anexo existente (sendMediaMessage
 * → Evolution → Storage → evento message_out) — zero caminho novo de envio.
 */
export function DemandaComposer({
  hasWhatsapp,
  viaWhatsapp,
  onViaWhatsappChange,
  comment,
  onCommentChange,
  replyTo,
  onCancelReply,
  onSend,
  onAttach,
  attachment,
  onRemoveAttachment,
  isPending,
  isUploading,
  textareaRef,
}: DemandaComposerProps) {
  // ── Gravador ────────────────────────────────────────────────────
  const [recState, setRecState] = useState<"idle" | "recording">("idle");
  const [recSeconds, setRecSeconds] = useState(0);
  const [audioDur, setAudioDur] = useState<number | null>(null);
  const mediaRecRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const discardRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };
  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  // Unmount seguro: para timer, recorder e microfone sem deixar nada vivo.
  useEffect(() => {
    return () => {
      clearTimer();
      const rec = mediaRecRef.current;
      if (rec && rec.state !== "inactive") {
        rec.ondataavailable = null;
        rec.onstop = null;
        rec.stop();
      }
      stopTracks();
    };
  }, []);

  // Duração some junto com o anexo.
  useEffect(() => {
    if (!attachment) setAudioDur(null);
  }, [attachment]);

  const startRecording = async () => {
    if (recState === "recording") return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
      toast.error("Gravação de áudio não é suportada neste navegador.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = RECORDER_MIME_PREFS.find((m) => MediaRecorder.isTypeSupported(m)) ?? "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      chunksRef.current = [];
      discardRef.current = false;
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const elapsed = Math.floor((Date.now() - startedAtRef.current) / 1000);
        clearTimer();
        stopTracks();
        setRecState("idle");
        setRecSeconds(0);
        if (discardRef.current) {
          discardRef.current = false;
          chunksRef.current = [];
          return;
        }
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        chunksRef.current = [];
        if (blob.size === 0) {
          toast.error("Gravação vazia — nada foi anexado.");
          return;
        }
        const ext = extForMime(rec.mimeType || "");
        const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const file = new File([blob], `audio-${stamp}.${ext}`, {
          type: blob.type || `audio/${ext}`,
        });
        setAudioDur(elapsed);
        onAttach(file);
        if (ext === "webm") {
          toast.info(
            "Seu navegador grava em WebM: o áudio será enviado como arquivo anexado.",
          );
        } else {
          toast.success("Áudio anexado — revise e envie quando quiser.");
        }
      };
      mediaRecRef.current = rec;
      startedAtRef.current = Date.now();
      setRecSeconds(0);
      setRecState("recording");
      rec.start(250);
      timerRef.current = window.setInterval(() => {
        setRecSeconds(Math.floor((Date.now() - startedAtRef.current) / 1000));
      }, 500);
    } catch {
      // Permissão negada ou erro de dispositivo: composer intacto, sem crash.
      stopTracks();
      toast.error("Permissão de microfone negada. Verifique as configurações do seu navegador.");
    }
  };

  const cancelRecording = () => {
    const rec = mediaRecRef.current;
    if (rec && rec.state !== "inactive") {
      discardRef.current = true;
      rec.stop();
    } else {
      clearTimer();
      stopTracks();
      setRecState("idle");
      setRecSeconds(0);
    }
  };

  const finishRecording = () => {
    const rec = mediaRecRef.current;
    if (rec && rec.state === "recording") rec.stop();
  };

  // ── Anexo de arquivo (fluxo existente) ──────────────────────────
  const handleAttach = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*,audio/*,video/*,.pdf,.doc,.docx,.txt";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (file) onAttach(file);
    };
    input.click();
  };

  const handleMacro = () => {
    toast.info("Macros/respostas rápidas entram na próxima sub-fase.");
  };

  return (
    <div className="shrink-0 border-t border-border/50 bg-card p-3">
      {/* Banner de reply (citação) */}
      {replyTo && (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2">
          <div className="min-w-0 flex-1">
            <div className="text-[11px] font-semibold text-primary">Respondendo a {replyTo.author}</div>
            <div className="truncate text-[11px] text-muted-foreground">{replyTo.content}</div>
          </div>
          <button
            type="button"
            onClick={onCancelReply}
            className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Preview do anexo — áudio ganha card com player + duração + KB */}
      {attachment && attachment.kind === "audio" && attachment.previewUrl ? (
        <div className="mb-2 rounded-lg border border-border/60 bg-secondary/40 p-2.5">
          <div className="flex items-center gap-2">
            <Mic className="h-3.5 w-3.5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 truncate text-[11px] font-medium text-foreground">
              {attachment.file.name}
            </span>
            <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground">
              {(attachment.file.size / 1024).toFixed(0)} KB
              {audioDur != null ? ` · ${fmtRec(audioDur)}` : ""}
            </span>
            <button
              type="button"
              onClick={onRemoveAttachment}
              title="Remover áudio"
              aria-label="Remover áudio"
              className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          <audio
            controls
            preload="metadata"
            src={attachment.previewUrl}
            onLoadedMetadata={(e) => {
              const d = e.currentTarget.duration;
              if (Number.isFinite(d)) setAudioDur(Math.round(d));
            }}
            className="mt-1.5 h-9 w-full"
          />
        </div>
      ) : attachment ? (
        <div className="mb-2 flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/40 px-3 py-2">
          {attachment.kind === "image" && attachment.previewUrl ? (
            <img src={attachment.previewUrl} alt="" className="h-10 w-10 rounded-md object-cover" />
          ) : (
            <div className="grid h-10 w-10 place-items-center rounded-md bg-primary/10 text-primary">
              <Paperclip className="h-4 w-4" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium text-foreground">{attachment.file.name}</div>
            <div className="text-[10px] text-muted-foreground">
              {(attachment.file.size / 1024).toFixed(0)} KB
            </div>
          </div>
          <button
            type="button"
            onClick={onRemoveAttachment}
            className="grid h-6 w-6 place-items-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      ) : null}

      {/* Painel do gravador SUBSTITUI o textarea enquanto grava */}
      {recState === "recording" ? (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3">
          <span className="relative flex h-3 w-3 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive opacity-60" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-destructive" />
          </span>
          <span className="font-mono text-sm font-bold tabular-nums text-destructive">
            {fmtRec(recSeconds)}
          </span>
          <span className="hidden min-w-0 flex-1 truncate text-[11px] text-muted-foreground sm:block">
            Gravando… conclua pra anexar ou cancele pra descartar.
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={cancelRecording}
              title="Cancelar gravação"
              aria-label="Cancelar gravação"
              className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={finishRecording}
              title="Concluir gravação"
              aria-label="Concluir gravação"
              className="grid h-9 w-9 place-items-center rounded-lg bg-primary text-primary-foreground transition hover:brightness-110"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Toggle WhatsApp / Interno */}
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              onClick={() => onViaWhatsappChange(true)}
              disabled={!hasWhatsapp}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                viaWhatsapp
                  ? "bg-[var(--pill-green-bg)] text-[var(--pill-green-fg)]"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80 disabled:opacity-50"
              }`}
            >
              <MessageCircle className="h-3 w-3" />
              WhatsApp
            </button>
            <button
              type="button"
              onClick={() => onViaWhatsappChange(false)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                !viaWhatsapp
                  ? "bg-primary/10 text-primary"
                  : "bg-secondary text-muted-foreground hover:bg-secondary/80"
              }`}
            >
              <Lock className="h-3 w-3" />
              Nota interna
            </button>
          </div>

          {/* Textarea + ações */}
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <textarea
                ref={textareaRef}
                value={comment}
                onChange={(e) => onCommentChange(e.target.value)}
                onInput={(e) => {
                  const t = e.currentTarget;
                  t.style.height = "auto";
                  t.style.height = `${Math.min(t.scrollHeight, 160)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSend();
                  }
                }}
                placeholder={
                  viaWhatsapp ? "Digite uma mensagem..." : "Adicione uma nota interna..."
                }
                rows={1}
                className="w-full resize-none rounded-xl border border-border/60 bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={handleMacro}
                title="Respostas rápidas (/)"
                aria-label="Respostas rápidas"
                className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <Slash className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleAttach}
                title="Anexar arquivo"
                aria-label="Anexar arquivo"
                className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              {viaWhatsapp && (
                <button
                  type="button"
                  onClick={startRecording}
                  title="Gravar áudio"
                  aria-label="Gravar áudio"
                  className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  <Mic className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                onClick={onSend}
                disabled={isPending || isUploading || (!comment.trim() && !attachment)}
                className="grid h-10 w-10 place-items-center rounded-lg bg-primary text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}