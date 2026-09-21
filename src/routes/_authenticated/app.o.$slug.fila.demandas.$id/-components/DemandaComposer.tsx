import { useState, type RefObject } from "react";
import { Button } from "@/components/ui/button";
import {
  Paperclip,
  Mic,
  MicOff,
  Square,
  Send,
  Lock,
  MessageCircle,
  Slash,
  X,
  Image as ImageIcon,
} from "lucide-react";
import { toast } from "sonner";

export type PendingAttachment = {
  file: File;
  previewUrl: string | null;
  kind: "image" | "audio" | "video" | "document";
};

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
 * Fase 1: composer com botões de macro (/) e gravação de áudio (placeholder).
 * Funcionalidade real entra na Fase 2.
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
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

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

  const handleStartRecording = () => {
    setIsRecording(true);
    setRecordingTime(0);
    const interval = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    (window as any).__recordingInterval = interval;
  };

  const handleStopRecording = (send: boolean) => {
    clearInterval((window as any).__recordingInterval);
    setIsRecording(false);
    if (send) {
      toast.info("Gravação de áudio será implementada na Fase 2");
    }
  };

  const handleMacroClick = () => {
    toast.info("Respostas rápididas serão implementadas na Fase 2");
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  return (
    <div className="shrink-0 border-t border-border/50 bg-card p-3">
      {/* Banner de reply */}
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

      {/* Preview do anexo */}
      {attachment && (
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
      )}

      {/* Estado de gravação */}
      {isRecording ? (
        <div className="flex items-center gap-3 rounded-xl bg-destructive/10 px-4 py-3">
          <div className="h-3 w-3 rounded-full bg-destructive animate-pulse" />
          <span className="font-mono text-sm font-bold text-destructive tabular-nums">
            {formatTime(recordingTime)}
          </span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => handleStopRecording(false)}
            className="h-9 w-9 text-muted-foreground hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </Button>
          <Button
            variant="default"
            size="icon"
            onClick={() => handleStopRecording(true)}
            className="h-9 w-9 bg-primary text-primary-foreground"
          >
            <Send className="h-4 w-4" />
          </Button>
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
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSend();
                  }
                }}
                placeholder={
                  viaWhatsapp
                    ? "Digite uma mensagem..."
                    : "Adicione uma nota interna..."
                }
                rows={1}
                className="w-full resize-none rounded-xl border border-border/60 bg-background px-4 py-2.5 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="icon"
                onClick={handleMacroClick}
                title="Respostas rápididas (/)"
                aria-label="Respostas rápididas"
                className="h-10 w-10 text-muted-foreground hover:text-foreground"
              >
                <Slash className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleAttach}
                title="Anexar arquivo"
                aria-label="Anexar arquivo"
                className="h-10 w-10 text-muted-foreground hover:text-foreground"
              >
                <Paperclip className="h-4 w-4" />
              </Button>
              {viaWhatsapp && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleStartRecording}
                  title="Gravar áudio"
                  aria-label="Gravar áudio"
                  className="h-10 w-10 text-muted-foreground hover:text-foreground"
                >
                  <Mic className="h-4 w-4" />
                </Button>
              )}
              <Button
                variant="default"
                size="icon"
                onClick={onSend}
                disabled={isPending || isUploading || (!comment.trim() && !attachment)}
                className="h-10 w-10 bg-primary text-primary-foreground hover:brightness-110 disabled:opacity-50"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}