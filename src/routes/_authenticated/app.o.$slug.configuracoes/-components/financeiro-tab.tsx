/**
 * Aba Financeiro refatorada com navegação por Sub-Abas (Tabs).
 * 
 * FASE 4.8 — Separação Clara de Contextos:
 * • "Planos & Assinatura": Foco comercial (Upgrade/Downgrade/Cancelamento).
 * • "Histórico de Pagamentos": Foco financeiro (Faturas passadas/futuras via invoices).
 * 
 * ARQUITETURA DE DADOS:
 * Mantém as queries globais (access, subscription, pendingSwitch) no escopo do componente pai.
 * Isso garante que trocar de aba não dispare re-fetch desnecessário dos dados de plano,
 * pois eles já estão cacheados pelo TanStack Query.
 */
import { CreditCard, Layers, ReceiptText } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { SectionTitle } from "@/components/section-ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAccountAccess } from "@/lib/billing/account-access";
import {
  getCurrentSubscription,
  getPendingTierSwitch,
} from "@/lib/billing/mp-checkout.functions";
import { BillingPlanCard } from "./billing-plan-card";
import { InvoicesPanel } from "./invoices-panel";

interface FinanceiroTabProps {
  orgId: string;
  isOwner: boolean;
}

export function FinanceiroTab({ orgId, isOwner }: FinanceiroTabProps) {
  const accessFn = useServerFn(getAccountAccess);
  const subscriptionFn = useServerFn(getCurrentSubscription);
  const pendingSwitchFn = useServerFn(getPendingTierSwitch);

  // --- QUERIES GLOBAIS (Dados de Plano/Assinatura) ---
  // Executam imediatamente ao montar a aba principal.
  
  const { data: access, isLoading: loadingAccess } = useQuery({
    queryKey: ["account-access", orgId],
    queryFn: () => accessFn({ data: { orgId } }),
    staleTime: 1000 * 60 * 5, // Cache 5 min
    retry: 0,
  });

  const { data: subscription, isLoading: loadingSub } = useQuery({
    queryKey: ["subscription", orgId],
    queryFn: () => subscriptionFn({ data: { orgId } }),
    staleTime: 1000 * 60 * 5, // Cache 5 min
    retry: 0,
  });

  const { data: pendingSwitch, isLoading: loadingPendingSwitch } = useQuery({
    queryKey: ["pending-tier-switch", orgId],
    queryFn: () => pendingSwitchFn({ data: { orgId } }),
    staleTime: 1000 * 15, // Cache curto (estado transitório)
    retry: 0,
  });

  const isLoadingPlans = loadingAccess || loadingSub || loadingPendingSwitch;

  return (
    <div className="space-y-6">
      <SectionTitle
        icon={CreditCard}
        title="Financeiro"
        hint="Gerencie o plano vigente, cobranças e faturas da sua organização."
      />

      <Tabs defaultValue="planos" className="w-full space-y-6">
        {/* NAVEGAÇÃO POR SUB-ABAS — scroll lateral no mobile */}
        <div className="-mx-4 sm:mx-0 overflow-x-auto scrollbar-none">
          <TabsList
            className={
              "flex flex-nowrap items-center gap-2 px-4 sm:px-0 py-1" +
              " w-max min-w-full h-auto bg-transparent p-0 justify-start rounded-none"
            }
          >
            <TabsTrigger
              value="planos"
              className={
                "shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full" +
                " px-4 py-2 text-xs font-medium cursor-pointer select-none outline-none" +
                " transition-all duration-200 ease-in-out" +
                " bg-secondary/50 text-muted-foreground border border-border/50" +
                " hover:bg-secondary hover:text-foreground hover:shadow-sm hover:border-border" +
                " data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" +
                " data-[state=active]:shadow-md data-[state=active]:border-primary/20 data-[state=active]:font-semibold"
              }
            >
              <Layers className="h-3.5 w-3.5 shrink-0" />
              Planos & Assinatura
            </TabsTrigger>

            <TabsTrigger
              value="faturas"
              className={
                "shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full" +
                " px-4 py-2 text-xs font-medium cursor-pointer select-none outline-none" +
                " transition-all duration-200 ease-in-out" +
                " bg-secondary/50 text-muted-foreground border border-border/50" +
                " hover:bg-secondary hover:text-foreground hover:shadow-sm hover:border-border" +
                " data-[state=active]:bg-primary data-[state=active]:text-primary-foreground" +
                " data-[state=active]:shadow-md data-[state=active]:border-primary/20 data-[state=active]:font-semibold"
              }
            >
              <ReceiptText className="h-3.5 w-3.5 shrink-0" />
              Histórico de Pagamentos
            </TabsTrigger>
          </TabsList>
        </div>

        {/* SUB-ABA 1: PLANOS & ASSINATURA */}
        <TabsContent value="planos" className="space-y-6 focus-visible:outline-none animate-in fade-in slide-in-from-bottom-2 duration-300">
          {isLoadingPlans ? (
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
        </TabsContent>

        {/* SUB-ABA 2: HISTÓRICO DE PAGAMENTOS E FATURAS */}
        <TabsContent value="faturas" className="focus-visible:outline-none animate-in fade-in slide-in-from-bottom-2 duration-300 delay-75">
          {/* O InvoicesPanel gerencia seu próprio estado de loading/data via hook useInvoices */}
          <InvoicesPanel orgId={orgId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Componente auxiliar para Skeleton Loading específico da área de planos
function CardSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
      {[...Array(3)].map((_, i) => (
        <div
          key={i}
          className="h-64 rounded-2xl bg-card border border-border animate-pulse p-6 shadow-card flex flex-col justify-between"
        >
          <div className="space-y-3">
            <div className="h-4 w-24 bg-muted rounded" />
            <div className="h-8 w-16 bg-muted rounded" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-full bg-muted rounded" />
            <div className="h-3 w-3/4 bg-muted rounded" />
            <div className="h-9 w-full bg-muted rounded-lg mt-4" />
          </div>
        </div>
      ))}
    </div>
  );
}