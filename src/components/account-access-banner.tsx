import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { TriangleAlert, Clock, Ban } from "lucide-react";
import { getAccountAccess } from "@/lib/billing/account-access";

/**
 * Banner de acesso da conta (Fase 3.3) — faixa global no topo, no espírito do
 * banner de quota da Supabase. Só aparece quando o estado EFETIVO limita o uso:
 * trial quase acabando (<=2d), carência (grace) ou suspensão (blocked).
 * 'active' (grandfathered/pago) e trial folgado => null (zero ruído visual).
 *
 * Plug ideal: layout pai da org (todas as telas). Exemplo aplicado na fila.
 * O CTA aponta pra Configurações hoje; vira /billing na Fase 4 (DT-11).
 */
export function AccountAccessBanner({
  orgId,
  slug,
}: {
  orgId: string | null;
  slug: string;
}) {
  const fn = useServerFn(getAccountAccess);
  const { data } = useQuery({
    queryKey: ["account-access", orgId],
    enabled: !!orgId,
    retry: false,
    queryFn: () => fn({ data: { orgId: orgId! } }),
  });

  if (!data) return null;
  const { effective_state, days_left } = data;

  // Conta ativa/paga => nunca banner.
  if (effective_state === "active") return null;
  // Trial com folga (>2 dias) => não incomoda.
  if (effective_state === "trial" && (days_left ?? 99) > 2) return null;

  if (effective_state === "trial") {
    return (
      <Band tone="amber" icon={<Clock className="h-3.5 w-3.5 shrink-0" />}>
        Seu teste termina em <b>{days_left}</b> {days_left === 1 ? "dia" : "dias"}. Configure o
        pagamento para não interromper o atendimento.
        <Cta slug={slug} label="Configurar" />
      </Band>
    );
  }

  if (effective_state === "grace") {
    return (
      <Band tone="amber" icon={<TriangleAlert className="h-3.5 w-3.5 shrink-0" />}>
        <b>Período de carência</b>
        {days_left != null && days_left > 0 ? ` (${days_left} ${days_left === 1 ? "dia" : "dias"} restante${days_left === 1 ? "" : "s"})` : ""}
        . Você continua respondendo às demandas existentes, mas não recebe mensagens novas nem cria demandas.
        <Cta slug={slug} label="Renovar plano" />
      </Band>
    );
  }

  // suspended
  return (
    <Band tone="red" icon={<Ban className="h-3.5 w-3.5 shrink-0" />}>
      <b>Conta suspensa.</b> Regularize o pagamento para liberar envio, recebimento e criação de
      demandas. O histórico continua disponível para consulta.
      <Cta slug={slug} label="Regularizar" />
    </Band>
  );
}

function Band({
  tone,
  icon,
  children,
}: {
  tone: "amber" | "red";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const cls =
    tone === "amber"
      ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100"
      : "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100";
  return (
    <div className={`flex items-center gap-2 border-b px-4 py-2 text-xs leading-snug ${cls}`}>
      {icon}
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  );
}

function Cta({ slug, label }: { slug: string; label: string }) {
  return (
    <Link
      to="/app/o/$slug/configuracoes"
      params={{ slug }}
      className="shrink-0 font-semibold underline underline-offset-2 hover:opacity-80"
    >
      {label}
    </Link>
  );
}
