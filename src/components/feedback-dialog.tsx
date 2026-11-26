// src/components/feedback-dialog.tsx
import { useState, useEffect, useRef } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Star, Heart, MessageSquare, X } from "lucide-react";
import { submitFeedback } from "@/lib/feedback/feedback.functions";
import { friendlyError } from "@/lib/friendly-error";
import { cn } from "@/lib/utils";

type Surface = "menu" | "nudge";

interface FeedbackDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orgId: string;
  surface?: Surface;
}

const DRAFT_KEY = "feedback-draft";

/** Chips dinâmicos baseados na nota (1-2 = dor, 3 = neutro, 4-5 = valor). */
function getChipsForRating(rating: number): string[] {
  if (rating <= 2) return ["Lento", "Confuso", "Faltou recurso", "Bug", "Difícil de usar"];
  if (rating === 3) return ["Ok, mas pode melhorar", "Faltou algo", "Regular"];
  return ["Fácil de usar", "Economizou tempo", "Boa integração", "Atendimento rápido", "Indicaria"];
}

const PMF_OPTIONS = [
  { value: "very_disappointed", label: "Muito decepcionado", icon: "😞" },
  { value: "somewhat_disappointed", label: "Um pouco decepcionado", icon: "😐" },
  { value: "not_disappointed", label: "Não decepcionado", icon: "😊" },
] as const;

export function FeedbackDialog({ open, onOpenChange, orgId, surface = "menu" }: FeedbackDialogProps) {
  const qc = useQueryClient();
  const submitFn = useServerFn(submitFeedback);

  // Estado do formulário
  const [rating, setRating] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [pmfScore, setPmfScore] = useState<string | null>(null);
  const [allowFollowup, setAllowFollowup] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chips = rating ? getChipsForRating(rating) : [];
  const isValid = rating !== null && pmfScore !== null;
  const currentRoute = typeof window !== "undefined" ? window.location.pathname : undefined;

  // Restaura rascunho do sessionStorage ao abrir
  useEffect(() => {
    if (open) {
      const draft = sessionStorage.getItem(DRAFT_KEY);
      if (draft) {
        try {
          const parsed = JSON.parse(draft);
          setComment(parsed.comment ?? "");
        } catch {}
      }
    }
  }, [open]);

  // Salva rascunho do comentário em tempo real
  useEffect(() => {
    if (comment) {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ comment }));
    }
  }, [comment]);

  const mutation = useMutation({
    mutationFn: () =>
      submitFn({
        data: {
          orgId,
          rating: rating!,
          tags,
          comment: comment.trim() || undefined,
          pmfScore: pmfScore as any,
          allowFollowup,
          surface,
          currentRoute,
        },
      }),
    onSuccess: () => {
      toast.success("Obrigado! Seu feedback foi enviado.", {
        description: "Isso nos ajuda a melhorar o Fluxo para você.",
      });
      sessionStorage.removeItem(DRAFT_KEY);
      resetForm();
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["feedback-nudge-state"] });
    },
    onError: (e) => {
      const msg = e.message ?? "";
      if (msg.includes("RATE_LIMIT_EXCEEDED")) {
        toast.error("Você já enviou feedback recentemente.", {
          description: "Tente novamente amanhã. Agradecemos o engajamento!",
        });
      } else {
        toast.error(friendlyError(e));
      }
    },
  });

  function resetForm() {
    setRating(null);
    setTags([]);
    setComment("");
    setPmfScore(null);
    setAllowFollowup(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen && !mutation.isPending) {
      resetForm();
    }
    onOpenChange(nextOpen);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto scrollbar-thin">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <MessageSquare className="h-4 w-4 text-primary" />
            Enviar feedback
          </DialogTitle>
          <DialogDescription className="text-xs">
            Sua opinião ajuda a priorizar melhorias. Leva menos de 1 minuto.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* 1. Estrelas (radiogroup acessível) */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">
              Como você avalia sua experiência geral?
            </label>
            <div
              role="radiogroup"
              aria-label="Avaliação de 1 a 5 estrelas"
              className="flex items-center gap-1"
            >
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={rating === value}
                  aria-label={`${value} estrela${value > 1 ? "s" : ""}`}
                  onClick={() => {
                    setRating(value);
                    setTags([]); // reseta chips ao mudar nota
                  }}
                  className={cn(
                    "grid h-10 w-10 place-items-center rounded-lg transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    rating === value
                      ? "text-primary bg-primary/10"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  )}
                >
                  <Star
                    className="h-6 w-6"
                    fill={rating === value ? "currentColor" : "none"}
                    strokeWidth={2}
                  />
                </button>
              ))}
              {rating && (
                <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                  {rating}/5
                </span>
              )}
            </div>
          </div>

          {/* 2. Chips dinâmicos (aparece só se houver nota) */}
          {rating && chips.length > 0 && (
            <div className="space-y-2 animate-in fade-in-0 slide-in-from-top-2 duration-200">
              <label className="text-xs font-medium text-foreground">
                O que mais se destaca? <span className="text-muted-foreground">(opcional, até 3)</span>
              </label>
              <ToggleGroup
                type="multiple"
                value={tags}
                onValueChange={(v) => setTags(v.slice(0, 3))}
                className="flex flex-wrap gap-1.5"
              >
                {chips.map((chip) => (
                  <ToggleGroupItem
                    key={chip}
                    value={chip}
                    aria-label={chip}
                    className="h-8 px-3 text-xs rounded-full border border-border bg-secondary/50 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary"
                  >
                    {chip}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}

          {/* 3. Pergunta PMF */}
          <div className="space-y-2">
            <label className="text-xs font-medium text-foreground">
              Como você se sentiria se não pudesse mais usar o Fluxo?
            </label>
            <div className="grid grid-cols-1 gap-2">
              {PMF_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPmfScore(opt.value)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    pmfScore === opt.value
                      ? "border-primary bg-primary/5 ring-1 ring-primary/30"
                      : "border-border hover:border-primary/40 hover:bg-secondary/40"
                  )}
                >
                  <span className="text-lg shrink-0">{opt.icon}</span>
                  <span className="flex-1">{opt.label}</span>
                  {pmfScore === opt.value && (
                    <Heart className="h-4 w-4 text-primary shrink-0" fill="currentColor" />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* 4. Comentário livre (opcional) */}
          <div className="space-y-2">
            <label htmlFor="feedback-comment" className="text-xs font-medium text-foreground">
              Quer detalhar algo? <span className="text-muted-foreground">(opcional)</span>
            </label>
            <textarea
              ref={textareaRef}
              id="feedback-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
              rows={3}
              placeholder="Ex: senti falta de…, adoraria que…, o fluxo X poderia ser…"
              className="w-full resize-y rounded-lg border border-border bg-background p-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
            />
            <div className="flex justify-end text-[10px] tabular-nums text-muted-foreground/70">
              {comment.length}/1000
            </div>
          </div>

          {/* 5. Opt-in de follow-up */}
          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={allowFollowup}
              onChange={(e) => setAllowFollowup(e.target.checked)}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-border text-primary focus:ring-primary"
            />
            <span className="text-xs text-muted-foreground leading-relaxed">
              Posso entrar em contato sobre meu feedback para entender melhor sua experiência.
            </span>
          </label>
        </div>

        {/* Footer: transparência + ações */}
        <div className="flex flex-col gap-3 border-t border-border/50 pt-3">
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            Seu feedback é usado para priorizar melhorias no produto. Leia nossa{" "}
            <a
              href="/privacidade"
              target="_blank"
              rel="noopener noreferrer"
              className="underline hover:text-foreground"
            >
              política de privacidade
            </a>
            .
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              disabled={mutation.isPending}
              className="h-9 flex-1 rounded-lg border border-border px-3 text-xs font-semibold text-foreground transition hover:bg-secondary disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={!isValid || mutation.isPending}
              className="h-9 flex-1 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? "Enviando…" : "Enviar feedback"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
