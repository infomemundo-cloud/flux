import { useRef, useState, type ChangeEvent, type RefObject } from "react";
import { Lock, MessageCircle, Paperclip, Send, Reply, X, FileText, Loader2, Film, Music } from "lucide-react";
import { toast } from "sonner";
import { EmojiPicker } from "./EmojiPicker";
import type { ReplyTarget } from "./DemandaHistory";

/**
 * 3 MB — teto conservador pro envio (Vercel serverless tem body ~4,5 MB,
 * base64 infla ~4/3). Exibido no toast de erro quando estoura.
 */
const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

/** Tipos aceitos pelo seletor de arquivo — mesmos que tratamos no recebimento. */
const ACCEPT =
  "image/*,audio/*,video/*,application/pdf,application/msword," +
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document," +
  "application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet," +
  "text/plain,text/vcard";

export type PendingAttachment = {
  file: File;
  previewUrl: string | null; // URL.createObjectURL pra imagem; null pros demais
  kind: "image" | "audio" | "video" | "document";
};

function kindOf(file: File): PendingAttachment["kind"] {
  const t = file.type.toLowerCase();
  if (t.startsWith("image/")) return "image";
  if (t.startsWith("audio/")) return "audio";
  if (t.startsWith("video/")) return "video";
  return "document";
}

/**
 * Área 3 do detalhe: composer de resposta/comentário + anexo.
 * Toggle WhatsApp/Interno, banner de citação, textarea que cresce, picker de
 * emojis (inserção no cursor) e upload de 1 arquivo com preview local +
 * botão de remover. Upload real só acontece no clique em enviar.
 * Puramente apresentacional: envio (onSend) mora no route.
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
}: {
  hasWhatsapp: boolean;
  viaWhatsapp: boolean;
  onViaWhatsappChange: (v: boolean) => void;
  comment: string;
  onCommentChange: (v: string) => void;
  replyTo: ReplyTarget | null;
  onCancelReply: () => void;
  onSend: () => void;
  onAttach: (file: File) => void;
  attachment: PendingAttachment | null;
  onRemoveAttachment: () => void;
  isPending: boolean;
  isUploading: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const effectiveViaWhatsapp = hasWhatsapp && viaWhatsapp;
  const busy = isPending || isUploading;
  const canSend = (comment.trim() || !!attachment) && !busy;

  const iconBtn =
    "grid place-items-center h-8 w-8 rounded-lg text-muted-foreground/60 hover:bg-secondary hover:text-foreground transition";

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? comment.length;
    const end = el?.selectionEnd ?? comment.length;
    onCommentChange(comment.slice(0, start) + emoji + comment.slice(end));
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = start + emoji.length;
      el.focus();
      el.setSelectionRange(pos, pos);
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 160) + "px";
    });
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Sempre reseta o input pra permitir re-selecionar o mesmo arquivo
    // depois de remover — o onChange não dispara se o valor não mudar.
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_UPLOAD_BYTES) {
      toast.error(
        `Arquivo maior que o limite de ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB`,
      );
      return;
    }
    onAttach(file);
  };

  const AttachmentPreview = () => {
    if (!attachment) return null;
    const { file, previewUrl, kind } = attachment;
    return (
      <div className="mx-3.5 mt-3 flex items-center gap-2 rounded-lg border border-border/60 bg-secondary/40 p-2">
        <div className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-md bg-card">
          {kind === "image" && previewUrl ? (
            <img src={previewUrl} alt={file.name} className="h-full w-full object-cover" />
          ) : kind === "video" ? (
            <Film className="h-5 w-5 text-muted-foreground" />
          ) : kind === "audio" ? (
            <Music className="h-5 w-5 text-muted-foreground" />
          ) : (
            <FileText className="h-5 w-5 text-primary" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-medium text-foreground">{file.name}</div>
          <div className="text-[10px] text-muted-foreground">
            {kind === "image" ? "Imagem" : kind === "video" ? "Vídeo" : kind === "audio" ? "Áudio" : "Documento"}
            {" · "}
            {(file.size / 1024).toFixed(0)} KB
            {isUploading && <span className="ml-1 inline-flex items-center gap-0.5 text-primary">enviando <Loader2 className="h-2.5 w-2.5 animate-spin" /></span>}
          </div>
        </div>
        <button
          type="button"
          onClick={onRemoveAttachment}
          disabled={busy}
          title="Remover anexo"
          aria-label="Remover anexo"
          className="shrink-0 grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition hover:bg-card hover:text-foreground disabled:opacity-40"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  };

  return (
    <div className="shrink-0 border-t border-border bg-card p-3">
      {hasWhatsapp && (
        <div className="mb-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onViaWhatsappChange(true)}
            title="Responder no WhatsApp"
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
              effectiveViaWhatsapp
                ? "bg-[#25D366]/15 text-[#128C4A] ring-1 ring-[#25D366]/40"
                : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <MessageCircle className="h-3.5 w-3.5" strokeWidth={2.3} /> WhatsApp
          </button>
          <button
            type="button"
            onClick={() => onViaWhatsappChange(false)}
            title="Comentário interno — só sua equipe vê"
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
              !effectiveViaWhatsapp ? "bg-secondary text-foreground ring-1 ring-border" : "text-muted-foreground hover:bg-secondary"
            }`}
          >
            <Lock className="h-3.5 w-3.5" strokeWidth={2.3} /> Interno
          </button>
        </div>
      )}
      <div
        className={`rounded-xl border bg-background transition focus-within:ring-2 ${
          effectiveViaWhatsapp
            ? "border-[#25D366]/40 focus-within:border-[#25D366]/60 focus-within:ring-[#25D366]/15"
            : "border-border focus-within:border-primary/50 focus-within:ring-primary/10"
        }`}
      >
        {replyTo && (
          <div className="mx-3.5 mt-3 flex items-start gap-2 rounded-md border-l-2 border-l-[var(--pill-amber-fg)] bg-secondary/70 px-2.5 py-1.5">
            <Reply className="mt-0.5 h-3 w-3 shrink-0 text-[var(--pill-amber-fg)]" strokeWidth={2.2} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[11px] font-semibold text-[var(--pill-amber-fg)]">{replyTo.author}</div>
              <div className="truncate text-[11px] text-muted-foreground">{replyTo.content || "(sem texto)"}</div>
            </div>
            <button
              type="button"
              onClick={onCancelReply}
              title="Cancelar resposta"
              aria-label="Cancelar resposta"
              className="shrink-0 text-muted-foreground transition hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
        <AttachmentPreview />
        <textarea
          ref={textareaRef}
          rows={1}
          value={comment}
          onChange={(e) => {
            onCommentChange(e.target.value);
            const el = e.target;
            el.style.height = "auto";
            el.style.height = Math.min(el.scrollHeight, 160) + "px";
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape" && replyTo) {
              e.preventDefault();
              onCancelReply();
              return;
            }
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSend) onSend();
            }
          }}
          placeholder={
            effectiveViaWhatsapp
              ? attachment
                ? "Legenda do anexo (opcional)..."
                : "Escreva a resposta que será enviada ao cliente..."
              : "Comentário interno (não vai pro cliente)..."
          }
          disabled={isUploading}
          className="w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-sm placeholder:text-muted-foreground outline-none scrollbar-thin disabled:opacity-60"
        />
        <div className="flex items-center justify-between px-2 pb-2">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy || !!attachment}
              title={attachment ? "Remova o anexo atual antes de anexar outro" : "Anexar arquivo"}
              className={iconBtn + (attachment || busy ? " opacity-40 cursor-not-allowed" : "")}
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              onChange={handleFileChange}
              className="hidden"
            />
            <EmojiPicker onPick={insertEmoji} triggerClass={iconBtn} />
            <button
              type="button"
              onClick={() => toast("Figurinhas chegam em breve")}
              title="Figurinha (em breve)"
              className={iconBtn}
            >
              {/* Placeholder futuro: enum do sendMedia hoje não suporta sticker. */}
              <Paperclip className="h-4 w-4 rotate-45" />
            </button>
          </div>
          <button
            onClick={() => {
              if (canSend) onSend();
            }}
            disabled={!canSend}
            title={
              busy
                ? "Enviando..."
                : effectiveViaWhatsapp
                ? "Enviar no WhatsApp"
                : "Salvar comentário interno"
            }
            className={`grid place-items-center h-8 w-8 rounded-lg text-white transition disabled:opacity-40 ${
              effectiveViaWhatsapp ? "bg-[#25D366] hover:brightness-105" : "bg-primary hover:opacity-90"
            }`}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 animate-spin" strokeWidth={2.3} />
            ) : (
              <Send className="h-4 w-4" strokeWidth={2.3} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
}