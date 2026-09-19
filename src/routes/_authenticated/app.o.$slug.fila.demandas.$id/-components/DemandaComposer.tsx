import type { RefObject } from "react";
import { Lock, MessageCircle, Paperclip, Sticker, Send, Reply, X } from "lucide-react";
import { toast } from "sonner";
import { EmojiPicker } from "./EmojiPicker";
import type { ReplyTarget } from "./DemandaHistory";

/**
 * Área 3 do detalhe: composer de resposta/comentário.
 * Toggle WhatsApp/Interno, banner de citação (reply), textarea que cresce,
 * picker de emojis próprio (inserção no cursor) e placeholders de anexo/
 * figurinha (mídia de envio chega no Passo E2, após o gate do sendMedia).
 * Puramente apresentacional: estado (comment/viaWhatsapp/replyTo) e o envio
 * (onSend) moram no route.
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
  isPending,
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
  isPending: boolean;
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const effectiveViaWhatsapp = hasWhatsapp && viaWhatsapp;

  const iconBtn =
    "grid place-items-center h-8 w-8 rounded-lg text-muted-foreground/60 hover:bg-secondary hover:text-foreground transition";

  /** Insere o emoji na posição do cursor e restaura caret + altura da textarea. */
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
              if (comment.trim() && !isPending) onSend();
            }
          }}
          placeholder={
            effectiveViaWhatsapp
              ? "Escreva a resposta que será enviada ao cliente..."
              : "Comentário interno (não vai pro cliente)..."
          }
          className="w-full resize-none bg-transparent px-3.5 pt-3 pb-1 text-sm placeholder:text-muted-foreground outline-none scrollbar-thin"
        />
        <div className="flex items-center justify-between px-2 pb-2">
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              onClick={() => toast("Anexar arquivo chega em breve")}
              title="Anexar arquivo (em breve)"
              className={iconBtn}
            >
              <Paperclip className="h-4 w-4" />
            </button>
            <EmojiPicker onPick={insertEmoji} triggerClass={iconBtn} />
            <button
              type="button"
              onClick={() => toast("Figurinhas chegam em breve")}
              title="Figurinha (em breve)"
              className={iconBtn}
            >
              <Sticker className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={() => {
              if (comment.trim() && !isPending) onSend();
            }}
            disabled={isPending || !comment.trim()}
            title={effectiveViaWhatsapp ? "Enviar no WhatsApp" : "Salvar comentário interno"}
            className={`grid place-items-center h-8 w-8 rounded-lg text-white transition disabled:opacity-40 ${
              effectiveViaWhatsapp ? "bg-[#25D366] hover:brightness-105" : "bg-primary hover:opacity-90"
            }`}
          >
            <Send className="h-4 w-4" strokeWidth={2.3} />
          </button>
        </div>
      </div>
    </div>
  );
}