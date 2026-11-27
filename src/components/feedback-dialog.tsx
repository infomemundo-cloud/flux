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
import { Star, MessageSquare, Check } from "lucide-react";
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

const RATING_LABELS: Record<number, string> = {
  1: "Muito ruim",
  2: "Abaixo do esperado",
  3: "Razoável",
  4: "Bom",
  5: "Excelente",
};

/** Chips dinâmicos baseados na nota (1-2 = dor, 3 = neutro, 4-5 = valor). */
function getChipsForRating(rating: number): string[] {
  if (rating <= 2) return ["Lento", "Confuso", "Faltou recurso", "Bug", "Difícil de usar"];
  if (rating === 3) return ["Ok, mas pode melhorar", "Faltou algo", "Regular"];
  return ["Fácil de usar", "Economizou tempo", "Boa integração", "Atendimento rápido", "Indicaria"];
}

const PMF_OPTIONS = [
  { value: "very_disappointed", label: "Muito decepcionado", tone: "text-destructive" },
  { value: "somewhat_disappointed", label: "Um pouco decepcionado", tone: "text-amber-600" },
  { value: "not_disappointed", label: "Não decepcionado", tone: "text-emerald-600" },
] as const;

export function FeedbackDialog({
  open,
  onOpenChange,
  orgId,
  surface = "menu",
}: FeedbackDialogProps) {
  const qc = useQueryClient();
  const submitFn = useServerFn(submitFeedback);

  const [rating, setRating] = useState<number | null>(null);
  const [hoveredRating, setHoveredRating] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState("");
  const [pmfScore, setPmfScore] = useState<string | null>(null);
  const [allowFollowup, setAllowFollowup] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const chips = rating ? getChipsForRating(rating) : [];
  const activeRatingDisplay = hoveredRating ?? rating;
  const isValid = rating !== null && pmfScore !== null;
  const currentRoute = typeof window !== "undefined" ? window.location.pathname : undefined;

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
    setHoveredRating(null);
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
      <DialogContent className="sm:max-w-[440px] max-h-[calc(100dvh-2rem)] overflow-y-auto scrollbar-thin p-5 gap-4">
        <DialogHeader className="space-y-1 text-left">
          <div className="flex items-center gap-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
              <MessageSquare className="h-4 w-4" />
            </span>
            <div>
              <DialogTitle className="text-base font-semibold tracking-tight">
                Enviar feedback
              </DialogTitle>
              <DialogDescription className="text-xs">
                Sua opinião orienta as próximas melhorias do Fluxo.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          {/* 1. Avaliação de 1 a 5 estrelas */}
          <div className="rounded-xl border border-border/80 bg-muted/30 p-3">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-medium text-foreground">
                Como você avalia sua experiência geral?
              </span>
              {activeRatingDisplay ? (
                <span className="text-[11px] font-medium text-primary tabular-nums">
                  {RATING_LABELS[activeRatingDisplay]} · {activeRatingDisplay}/5
                </span>
              ) : (
                <span className="text-[11px] text-muted-foreground">Obrigatório</span>
              )}
            </div>

            <div
              role="radiogroup"
              aria-label="Avaliação de 1 a 5 estrelas"
              onMouseLeave={() => setHoveredRating(null)}
              className="flex items-center justify-between gap-1"
            >
              {[1, 2, 3, 4, 5].map((value) => {
                const isSelected = rating === value;
                const isHighlighted =
                  activeRatingDisplay !== null && value <= activeRatingDisplay;

                return (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    aria-label={`${value} estrela${value > 1 ? "s" : ""}`}
                    onMouseEnter={() => setHoveredRating(value)}
                    onFocus={() => setHoveredRating(value)}
                    onClick={() => {
                      setRating(value);
                      setTags([]);
                    }}
                    className={cn(
                      "flex h-10 flex-1 items-center justify-center rounded-lg border transition",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      isHighlighted
                        ? "border-primary/40 bg-primary/10 text-primary"
                        : "border-transparent bg-background/70 text-muted-foreground hover:border-border hover:text-foreground"
                    )}
                  >
                    <Star
                      className="h-5 w-5"
                      fill={isHighlighted ? "currentColor" : "none"}
                      strokeWidth={2}
                    />
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Chips dinâmicos */}
          {rating && chips.length > 0 && (
            <div className="space-y-1.5 animate-in fade-in-0 slide-in-from-top-1.5 duration-150">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-foreground">O que mais se destaca?</span>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {tags.length}/3 opcional
                </span>
              </div>
              <ToggleGroup
                type="multiple"
                value={tags}
                onValueChange={(v) => setTags(v.slice(0, 3))}
                className="flex flex-wrap gap-1.5 justify-start"
              >
                {chips.map((chip) => (
                  <ToggleGroupItem
                    key={chip}
                    value={chip}
                    aria-label={chip}
                    className="h-7 px-2.5 text-xs rounded-full border border-border bg-background text-muted-foreground transition hover:text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary"
                  >
                    {chip}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </div>
          )}

          {/* 3. Pergunta PMF */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-foreground">
                Como você se sentiria se não pudesse mais usar o Fluxo?
              </span>
              <span className="text-[11px] text-muted-foreground shrink-0">Obrigatório</span>
            </div>

            <div className="grid grid-cols-1 gap-1.5">
              {PMF_OPTIONS.map((opt) => {
                const selected = pmfScore === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setPmfScore(opt.value)}
                    className={cn(
                      "flex items-center justify-between rounded-lg border px-3 py-2 text-left text-xs font-medium transition",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      selected
                        ? "border-primary bg-primary/5 text-foreground ring-1 ring-primary/25"
                        : "border-border/80 bg-background text-muted-foreground hover:border-border hover:text-foreground"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-2 w-2 rounded-full bg-current opacity-80",
                          opt.tone
                        )}
                      />
                      <span>{opt.label}</span>
                    </span>
                    {selected && <Check className="h-3.5 w-3.5 text-primary shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. Comentário livre */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor="feedback-comment" className="text-xs font-medium text-foreground">
                Quer detalhar algo?{" "}
                <span className="font-normal text-muted-foreground">(opcional)</span>
              </label>
              <span className="text-[11px] tabular-nums text-muted-foreground">
                {comment.length}/1000
              </span>
            </div>
            <textarea
              ref={textareaRef}
              id="feedback-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="Ex: senti falta de…, o fluxo X poderia ser…"
              className="w-full min-h-[68px] resize-y rounded-lg border border-border bg-background px-3 py-2 text-xs leading-relaxed text-foreground outline-none transition placeholder:text-muted-foreground/70 focus:border-primary/60 focus:ring-2 focus:ring-primary/15"
            />
          </div>

          {/* 5. Opt-in de follow-up */}
          <label className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-muted/20 p-2.5 cursor-pointer transition hover:bg-muted/40">
            <input
              type="checkbox"
              checked={allowFollowup}
              onChange={(e) => setAllowFollowup(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 shrink-0 rounded border-border accent-primary focus:ring-primary"
            />
            <span className="text-[11px] leading-snug text-muted-foreground">
              Autorizo a equipe do Fluxo a entrar em contato sobre este feedback para entender
              melhor minha experiência.
            </span>
          </label>
        </div>

        {/* Rodapé */}
        <div className="space-y-3 border-t border-border pt-3">
          <p className="text-[11px] leading-snug text-muted-foreground">
            Usamos seu retorno para evoluir o produto. Consulte nossa{" "}
            <a
              href="/privacidade"
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-foreground underline underline-offset-2 hover:text-primary"
            >
              Política de Privacidade
            </a>
            .
          </p>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => handleOpenChange(false)}
              disabled={mutation.isPending}
              className="h-9 rounded-lg border border-border bg-background px-3.5 text-xs font-medium text-foreground transition hover:bg-secondary disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={() => mutation.mutate()}
              disabled={!isValid || mutation.isPending}
              className="h-9 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {mutation.isPending ? "Enviando…" : "Enviar feedback"}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
