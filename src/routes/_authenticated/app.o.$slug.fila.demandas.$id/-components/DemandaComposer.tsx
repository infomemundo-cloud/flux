import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Lock,
  MessageCircle,
  Mic,
  Paperclip,
  Plus,
  Search,
  Send,
  Slash,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  createQuickReply,
  deleteQuickReply,
  listQuickReplies,
  type QuickReply,
} from "@/lib/quick-replies.functions";

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
 * modernos gravam mp4; Firefox grava ogg; webm só como fallback legado.
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
  orgId: string | null;
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
 * que cresce, anexo funcional, gravação de áudio (MediaRecorder) e MACROS.
 *
 * Gravador (spec travada + stop explícito):
 * - Mic substitui o textarea pelo painel: dot vermelho pulsante + cronômetro;
 * - STOP (ícone quadrado) = interrompe a gravação e GERA O PREVIEW (player +
 *   duração + KB) antes do envio — não envia nada sozinho;
 * - Lixeira = descarta sem anexar;
 * - Permissão negada ou navegador sem suporte → toast discreto, composer
 *   intacto no modo texto.
 */
export function DemandaComposer({
  orgId,
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
  // ── Macros / respostas rápidas ──────────────────────────────────
  const qc = useQueryClient();
  const listMacrosFn = useServerFn(listQuickReplies);
  const createMacroFn = useServerFn(createQuickReply);
  const deleteMacroFn = useServerFn(deleteQuickReply);
  const [macroOpen, setMacroOpen] = useState(false);
  const [macroQuery, setMacroQuery] = useState("");
  const [macroCreating, setMacroCreating] = useState(false);
  const [macroLabel, setMacroLabel] = useState("");
  const [macroContent, setMacroContent] = useState("");

  const { data: macros } = useQuery({
    queryKey: ["quick-replies", orgId],
    queryFn: () => listMacrosFn({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });

  const createMacro = useMutation({
    mutationFn: (vars: { label: string; content: string }) =>
      createMacroFn({ data: { orgId: orgId!, ...vars } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quick-replies", orgId] });
      toast.success("Resposta rápida criada");
      setMacroCreating(false);
      setMacroLabel("");
      setMacroContent("");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const deleteMacro = useMutation({
    mutationFn: (id: string) => deleteMacroFn({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["quick-replies", orgId] });
      toast.success("Resposta rápida excluída");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const filteredMacros = useMemo(() => {
    const q = macroQuery.trim().toLowerCase();
    const list = macros ?? [];
    return q
      ? list.filter(
          (m) => m.label.toLowerCase().includes(q) || m.content.toLowerCase().includes(q),
        )
      : list;
  }, [macros, macroQuery]);

  /** Insere texto na posição do caret (fallback: fim do texto). */
  const insertAtCursor = (text: string) => {
    const el = textareaRef.current;
    if (!el) {
      onCommentChange(comment ? `${comment} ${text}` : text);
      return;
    }
    const start = el.selectionStart ?? comment.length;
    const end = el.selectionEnd ?? comment.length;
    const next = comment.slice(0, start) + text + comment.slice(end);
    onCommentChange(next);
    requestAnimationFrame(() => {
      el.focus();
      const pos = start + text.length;
      el.setSelectionRange(pos, pos);
    });
  };

  const pickMacro = (m: QuickReply) => {
    insertAtCursor(m.content);
    setMacroOpen(false);
    setMacroQuery("");
  };

  const openCreate = () => {
    setMacroCreating(true);
    setMacroLabel(macroQuery.trim());
    setMacroContent("");
  };

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
          toast.info("Seu navegador grava em WebM: o áudio será enviado como arquivo anexado.");
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

  /** STOP explícito: interrompe a gravação e gera o preview (não envia). */
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
            Gravando… pare pra revisar o preview ou cancele pra descartar.
          </span>
          <div className="ml-auto flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={cancelRecording}
              title="Cancelar e descartar gravação"
              aria-label="Cancelar e descartar gravação"
              className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
            >
              <Trash2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={finishRecording}
              title="Parar e gerar preview"
              aria-label="Parar e gerar preview"
              className="grid h-9 w-9 place-items-center rounded-lg bg-destructive text-destructive-foreground transition hover:brightness-110"
            >
              <Square className="h-4 w-4" fill="currentColor" />
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
                  // Gatilho de macros: "/" com textarea vazio abre o picker
                  // SEM inserir a barra no texto.
                  if (e.key === "/" && comment === "") {
                    e.preventDefault();
                    setMacroOpen(true);
                    return;
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSend();
                  }
                }}
                placeholder={
                  viaWhatsapp ? "Digite uma mensagem...  ( / abre macros )" : "Adicione uma nota interna..."
                }
                rows={1}
                className="w-full resize-none rounded-xl border border-border/60 bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div className="flex items-center gap-1">
              {/* Macros / respostas rápidas */}
              <Popover
                open={macroOpen}
                onOpenChange={(o) => {
                  setMacroOpen(o);
                  if (!o) {
                    setMacroQuery("");
                    setMacroCreating(false);
                  }
                }}
              >
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    title="Respostas rápidas (/)"
                    aria-label="Respostas rápidas"
                    className="grid h-10 w-10 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  >
                    <Slash className="h-4 w-4" />
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-72 rounded-xl p-1.5">
                  {macroCreating ? (
                    <div className="space-y-1.5">
                      <input
                        autoFocus
                        value={macroLabel}
                        onChange={(e) => setMacroLabel(e.target.value)}
                        placeholder="Nome da macro (ex.: boas-vindas)"
                        maxLength={60}
                        className="h-8 w-full rounded-md border border-border/60 bg-background px-2 text-[11px] outline-none transition focus:border-primary/50"
                      />
                      <textarea
                        value={macroContent}
                        onChange={(e) => setMacroContent(e.target.value)}
                        placeholder="Texto que será inserido no composer..."
                        rows={3}
                        maxLength={4000}
                        className="w-full resize-none rounded-md border border-border/60 bg-background p-2 text-[11px] outline-none transition focus:border-primary/50"
                      />
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => setMacroCreating(false)}
                          className="text-[10px] text-muted-foreground transition hover:text-foreground"
                        >
                          Voltar
                        </button>
                        <button
                          type="button"
                          disabled={
                            !macroLabel.trim() || !macroContent.trim() || createMacro.isPending
                          }
                          onClick={() =>
                            createMacro.mutate({
                              label: macroLabel.trim(),
                              content: macroContent.trim(),
                            })
                          }
                          className="h-7 rounded-md bg-primary px-2.5 text-[10px] font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
                        >
                          {createMacro.isPending ? "Salvando..." : "Salvar macro"}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="relative mb-1">
                        <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                        <input
                          autoFocus
                          value={macroQuery}
                          onChange={(e) => setMacroQuery(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && filteredMacros[0]) {
                              e.preventDefault();
                              pickMacro(filteredMacros[0]);
                            }
                          }}
                          placeholder="Buscar macro..."
                          className="h-8 w-full rounded-md border border-border/60 bg-background pl-7 pr-2 text-[11px] outline-none transition focus:border-primary/50"
                        />
                      </div>
                      <div className="max-h-48 overflow-y-auto scrollbar-thin">
                        {filteredMacros.map((m) => (
                          <div
                            key={m.id}
                            className="group/macro flex items-start gap-2 rounded-md px-2 py-1.5 transition hover:bg-secondary"
                          >
                            <button
                              type="button"
                              onClick={() => pickMacro(m)}
                              className="min-w-0 flex-1 text-left"
                            >
                              <div className="truncate text-[11px] font-semibold text-foreground">
                                {m.label}
                              </div>
                              <div className="line-clamp-2 text-[10px] text-muted-foreground">
                                {m.content}
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteMacro.mutate(m.id)}
                              title="Excluir macro"
                              aria-label="Excluir macro"
                              className="mt-0.5 hidden h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground/70 transition hover:bg-destructive/10 hover:text-destructive group-hover/macro:grid"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        ))}
                        {filteredMacros.length === 0 && (
                          <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                            Nenhuma macro encontrada.
                          </div>
                        )}
                      </div>
                      <div className="mt-1 border-t border-border/50 pt-1">
                        <button
                          type="button"
                          onClick={openCreate}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] font-medium text-primary transition hover:bg-secondary"
                        >
                          <Plus className="h-3 w-3 shrink-0" />
                          Criar resposta rápida
                          {macroQuery.trim() ? ` “${macroQuery.trim()}”` : ""}
                        </button>
                      </div>
                    </>
                  )}
                </PopoverContent>
              </Popover>
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