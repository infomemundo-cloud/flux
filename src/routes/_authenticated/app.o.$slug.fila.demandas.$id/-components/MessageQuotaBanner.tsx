import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Gauge } from "lucide-react";
import { getAccountAccess } from "@/lib/billing/account-access";
import { getMessageQuota } from "@/lib/billing/quota";

/**
 * DT-09 Parte 2 / D1 — Banner escalonado de cota de mensagens (80/95/100%).
 *
 * HIERARQUIA (zero conflito com AccountAccessBanner): só renderiza com
 * access_level === "full" — org suspensa/em carência já tem o banner
 * global próprio; cota é alerta de conta SAUDÁVEL.
 *
 * COPY alinhada à política D1: no estouro, só o RECEBIMENTO de demandas
 * novas é bloqueado; envio e histórico seguem intactos — o banner diz
 * exatamente isso (sem prometer travamento total que não existe).
 *
 * SEM POLLING (§2.1): staleTime 60s alinhado ao memo do servidor; o
 * refresh vem de invalidateQueries pós-envio (route.tsx) e de remount.
 */
export function MessageQuotaBanner({ orgId, slug }: { orgId: string | null; slug: string }) {
  const accessFn = useServerFn(getAccountAccess);
  const quotaFn = useServerFn(getMessageQuota);

  const { data: access } = useQuery({
    queryKey: ["account-access", orgId],
    queryFn: () => accessFn({ data: { orgId: orgId! } }),
    enabled: !!orgId,
  });

  const { data: quota } = useQuery({
    queryKey: ["message-quota", orgId],
    queryFn: () => quotaFn({ data: { orgId: orgId! } }),
    enabled: !!orgId && access?.access_level === "full",
    // Memo do servidor é 60s/org (diretriz v2.4): o banner segue o mesmo
    // ritmo sem polling — refresca por invalidação pós-envio e remount.
    staleTime: 60_000,
  });

  if (!quota?.enforced || quota.percentage < 80) return null;

  const full = quota.percentage >= 100;
  const critical = !full && quota.percentage >= 95;
  const fmt = (n: number) => n.toLocaleString("pt-BR");

  return (
    <div
      className={`mb-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] leading-relaxed ${
        full
          ? "border-destructive/30 bg-destructive/10 text-destructive"
          : critical
            ? "border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400"
            : "border-amber-500/25 bg-amber-500/5 text-amber-600/90 dark:text-amber-400/90"
      }`}
    >
      {full ? (
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      ) : (
        <Gauge className="mt-0.5 h-3.5 w-3.5 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        {full ? (
          <>
            <span className="font-semibold">
              Limite de {fmt(quota.limit ?? 0)} mensagens do plano atingido ({fmt(quota.current)}).
            </span>{" "}
            O recebimento de mensagens no WhatsApp pausa até o próximo ciclo; envio e histórico continuam liberados.
          </>
        ) : (
          <>
            <span className="font-semibold">{quota.percentage}% da cota de mensagens usada</span>{" "}
            ({fmt(quota.current)} de {fmt(quota.limit ?? 0)}). No limite, o recebimento de mensagens no WhatsApp pausa até o próximo ciclo.

          </>
        )}{" "}
        <button
          type="button"
          onClick={() => {
            // Mesmo padrão do CTA de upgrade em equipe.tsx (TeamCapacityIndicator).
            window.location.href = `/app/o/${slug}/configuracoes?tab=financeiro`;
          }}
          className="font-semibold underline underline-offset-2 hover:opacity-80"
        >
          Ver planos
        </button>
      </div>
    </div>
  );
}
