import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquareHeart, X } from "lucide-react";
import {
  getFeedbackNudgeState,
  dismissFeedbackNudge,
} from "@/lib/feedback/feedback.functions";
import { getAccountAccess } from "@/lib/billing/account-access";
import { evaluateFeatureFlags } from "@/lib/feature-flag.functions";
import { FeedbackDialog } from "@/components/feedback-dialog";

/**
 * Nudge de feedback (9.3) — não-bloqueante, no FIM da hierarquia de superfícies
 * (access > quota > onboarding > nudge). Só renderiza com access full, sem
 * onboarding ativo (suppressed vindo da fila) e com marco de uso real atingido.
 * Máx. 1 vez por usuário: dismiss persistido; "respondido" deriva do banco.
 */
export function FeedbackNudgeBanner({
  orgId,
  suppressed = false,
}: {
  orgId: string | null;
  suppressed?: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const stateFn = useServerFn(getFeedbackNudgeState);
  const dismissFn = useServerFn(dismissFeedbackNudge);
  const accessFn = useServerFn(getAccountAccess);
  const evalFn = useServerFn(evaluateFeatureFlags);

  const { data: access } = useQuery({
    queryKey: ["account-access", orgId],
    queryFn: () => accessFn({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });
  const { data: flags } = useQuery({
    queryKey: ["feature-flags", orgId],
    queryFn: () => evalFn({ data: { orgId: orgId! } }),
    enabled: !!orgId,
    staleTime: 5 * 60_000,
  });
  const enabled = (flags?.flags ?? []).some(
    (f) => f.key === "product_feedback" && f.enabled,
  );
  const { data: nudge } = useQuery({
    queryKey: ["feedback-nudge", orgId],
    queryFn: () => stateFn({ data: { orgId: orgId! } }),
    enabled: !!orgId && enabled && !suppressed && access?.access_level === "full",
    staleTime: 60_000,
  });
  const dismiss = useMutation({
    mutationFn: () => dismissFn(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["feedback-nudge", orgId] }),
  });

  if (!orgId || suppressed || !enabled || access?.access_level !== "full") return null;
  if (!nudge || !nudge.eligible || nudge.dismissed || nudge.responded) return null;

  return (
    <>
      <div className="mx-2 mt-2 flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
        <MessageSquareHeart className="h-3.5 w-3.5 shrink-0 text-primary" />
        <p className="min-w-0 flex-1 text-[11px] leading-relaxed text-foreground/85">
          Você já usou o Flux de verdade — como está sendo a experiência?{" "}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="font-semibold text-primary underline underline-offset-2 hover:opacity-80"
          >
            Avaliar (15s)
          </button>
        </p>
        <button
          type="button"
          onClick={() => dismiss.mutate()}
          disabled={dismiss.isPending}
          aria-label="Dispensar convite de feedback"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      </div>
      <FeedbackDialog open={open} onOpenChange={setOpen} orgId={orgId} surface="nudge" />
    </>
  );
}
