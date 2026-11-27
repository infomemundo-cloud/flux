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
 * Nudge de feedback — não-bloqueante, no fim da hierarquia de superfícies.
 * Só renderiza com acesso full, sem onboarding ativo e com marco de uso atingido.
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
    (f) => f.key === "product_feedback" && f.enabled
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
      <div className="mx-2 mt-2 flex items-center gap-2.5 rounded-lg border border-primary/20 bg-primary/[0.04] px-3 py-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-primary/10 text-primary">
          <MessageSquareHeart className="h-3.5 w-3.5" />
        </span>
        <p className="min-w-0 flex-1 text-xs leading-snug text-foreground/85">
          Você já usou o Fluxo na prática — como está a experiência?{" "}
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="font-semibold text-primary underline underline-offset-2 transition hover:opacity-80"
          >
            Avaliar (15s)
          </button>
        </p>
        <button
          type="button"
          onClick={() => dismiss.mutate()}
          disabled={dismiss.isPending}
          aria-label="Dispensar convite de feedback"
          className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:opacity-50"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <FeedbackDialog open={open} onOpenChange={setOpen} orgId={orgId} surface="nudge" />
    </>
  );
}
