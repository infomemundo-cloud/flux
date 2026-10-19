/**
 * Aba Financeiro refatorada mantendo alinhamento perfeito de grid e cards.
 * FASE 4.7 ITEM 1 (Troca de Tier):
 * • Carrega transição pendente de tier via getPendingTierSwitch.
 * • Passa pendingSwitch para BillingPlanCard.
 * • Mantém comportamento atual quando não há troca pendente.
 * 
 * FASE 4.8 (Histórico de Cobrança):
 * • Substitui placeholder InvoicesPanel por componente real conectado à API.
 */
import { CreditCard } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SectionTitle } from "@/components/section-ui";
import { getAccountAccess } from "@/lib/billing/account-access";
import {
  getCurrentSubscription,
  getPendingTierSwitch,
} from "@/lib/billing/mp-checkout.functions";
import { BillingPlanCard } from "./billing-plan-card";
// IMPORTAÇÃO DO NOVO COMPONENTE REAL
import { InvoicesPanel } from "./invoices-panel"; 

interface FinanceiroTabProps {
  orgId: string;
  isOwner: boolean;
}

export function FinanceiroTab({ orgId, isOwner }: FinanceiroTabProps) {
  // Inicialização das funções server-side
  const accessFn = useServerFn(getAccountAccess);
  const subscriptionFn = useServerFn(getCurrentSubscription);
  const pendingSwitchFn = useServerFn(getPendingTierSwitch);

  // Query para acesso da conta
  const { data: access, isLoading: loadingAccess } = useQuery({
    queryKey: ["account-access", orgId],
    queryFn: () => accessFn({ data: { orgId } }),
    staleTime: 1000 * 60 * 5, // Cache por 5 minutos
    retry: 0,
  });

  // Query para assinatura atual
  const { data: subscription, isLoading: loadingSub } = useQuery({
    queryKey: ["subscription", orgId],
    queryFn: () => subscriptionFn({ data: { orgId } }),
    staleTime: 1000 * 60 * 5, // Cache por 5 minutos
    retry: 0,
  });

  // Query para troca de tier pendente (Novo na Fase 4.7)
  // StaleTime menor (15s) pois é um estado transitório que pode mudar rapidamente
  const { data: pendingSwitch, isLoading: loadingPendingSwitch } = useQuery({
    queryKey: ["pending-tier-switch", orgId],
    queryFn: () => pendingSwitchFn({ data: { orgId } }),
    staleTime: 1000 * 15, 
    retry: 0,
  });

  // Estado combinado de carregamento
  const isLoading = loadingAccess || loadingSub || loadingPendingSwitch;

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
              pendingSwitch={pendingSwitch ?? null}
              isOwner={isOwner}
              orgId={orgId}
            />
          )}
        </div>

        {/* Coluna Secundária: Histórico de Faturas (4 colunas no desktop) */}
        <div className="lg:col-span-4">
          {/* AGORA RECEBE O PROP orgId PARA BUSCAR DADOS REAIS */}
          <InvoicesPanel orgId={orgId} />
        </div>
      </div>
    </div>
  );
}

// Componente auxiliar para Skeleton Loading dos cards de plano
function CardSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="h-64 rounded-2xl bg-slate-900/40 border border-slate-800 animate-pulse p-6"
        />
      ))}
    </div>
  );
}

// REMOVIDO: A antiga função local InvoicesPanel() foi excluída.
// Ela agora vive em ./invoices-panel.tsx com lógica real de fetch e renderização.
