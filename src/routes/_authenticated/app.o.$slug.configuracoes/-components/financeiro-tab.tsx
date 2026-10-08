/**
 * Aba Financeiro refatorada mantendo alinhamento perfeito de grid e cards.
 */
import { CreditCard, Receipt } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SectionTitle } from "@/components/section-ui";
import { getAccountAccess } from "@/lib/billing/account-access";
import { getCurrentSubscription } from "@/lib/billing/mp-checkout.functions";
import { BillingPlanCard } from "./billing-plan-card";

interface FinanceiroTabProps {
  orgId: string;
  isOwner: boolean;
}

export function FinanceiroTab({ orgId, isOwner }: FinanceiroTabProps) {
  const accessFn = useServerFn(getAccountAccess);
  const subscriptionFn = useServerFn(getCurrentSubscription);

  const { data: access, isLoading: loadingAccess } = useQuery({
    queryKey: ["account-access", orgId],
    queryFn: () => accessFn({ data: { orgId } }),
    staleTime: 1000 * 60 * 5,
    retry: 0,
  });

  const { data: subscription, isLoading: loadingSub } = useQuery({
    queryKey: ["subscription", orgId],
    queryFn: () => subscriptionFn({ data: { orgId } }),
    staleTime: 1000 * 60 * 5,
    retry: 0,
  });

  const isLoading = loadingAccess || loadingSub;

  return (
    <div className="space-y-6">
      <SectionTitle
        icon={CreditCard}
        title="Financeiro"
        hint="Plano vigente, cobrança e faturas desta organização."
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Coluna Principal: Planos (8 colunas no desktop) */}
        <div className="lg:col-span-8">
          {isLoading ? (
            <CardSkeleton />
          ) : (
            <BillingPlanCard
              subscription={subscription ?? null}
              access={access ?? null}
              isOwner={isOwner}
              orgId={orgId}
            />
          )}
        </div>

        {/* Coluna Secundária: Histórico de Faturas (4 colunas no desktop) */}
        <div className="lg:col-span-4">
          <InvoicesPanel />
        </div>
      </div>
    </div>
  );
}

function CardSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {[...Array(3)].map((_, i) => (
        <div key={i} className="h-64 rounded-2xl bg-slate-900/40 border border-slate-800 animate-pulse p-6" />
      ))}
    </div>
  );
}

function InvoicesPanel() {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-6 space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-800 text-slate-400">
          <Receipt className="h-4 w-4" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-foreground">Histórico de Cobrança</h3>
          <p className="text-[11px] text-muted-foreground">
            Faturas e comprovantes de pagamento.
          </p>
        </div>
      </div>

      <div className="pt-4 pb-2 flex flex-col items-center justify-center text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-slate-800/50 border border-slate-700/50">
          <Receipt className="h-5 w-5 text-slate-500" />
        </div>
        <p className="text-xs font-semibold text-foreground">
          Nenhuma cobrança registrada
        </p>
        <p className="text-[11px] text-muted-foreground mt-1 max-w-[210px] leading-relaxed">
          O histórico de faturas e notas fiscais aparecerá automaticamente após a primeira cobrança.
        </p>
      </div>
    </div>
  );
}
