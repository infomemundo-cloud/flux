/**
 * Layout clean de pricing sem badges flutuantes, botões uniformes em largura total
 * e preços alinhados sem quebra de linha.
 */
import { CheckCircle2, Clock, AlertTriangle, Ban, Sparkles, Check } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/friendly-error";
import { createCheckoutSession, cancelSubscription } from "@/lib/billing/mp-checkout.functions";
import type { AccountAccess } from "@/lib/billing/account-access";

interface SubscriptionLike {
  id: string;
  plan_code: string;
  state: "active" | "grace_period" | "past_due" | "canceled_by_user" | "canceled_by_dunning" | "suspended";
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_requested_by_user: boolean;
  mp_preapproval_id: string | null;
}

interface BillingPlanCardProps {
  subscription: SubscriptionLike | null;
  access: AccountAccess | null;
  isOwner: boolean;
  orgId: string;
}

const TIERS = [
  {
    code: "operacao",
    name: "Operação",
    price: "97",
    description: "Ideal para pequenas equipes estruturarem o atendimento.",
  },
  {
    code: "crescimento",
    name: "Crescimento",
    price: "197",
    description: "Para operação em expansão com múltiplos canais e SLA.",
  },
  {
    code: "escala",
    name: "Escala",
    price: "397",
    description: "Alta capacidade, automação avançada e suporte prioritário.",
  },
] as const;

export function BillingPlanCard({ subscription, access, isOwner, orgId }: BillingPlanCardProps) {
  const qc = useQueryClient();
  const checkoutFn = useServerFn(createCheckoutSession);
  const cancelFn = useServerFn(cancelSubscription);

  const displayState = deriveDisplayState(subscription, access);
  const tierName = subscription?.plan_code
    ? TIERS.find((t) => t.code === subscription.plan_code)?.name ?? subscription.plan_code
    : null;

  const subscribeMut = useMutation({
    mutationFn: async (tierCode: (typeof TIERS)[number]["code"]) => {
      const res = await checkoutFn({ data: { orgId, tierCode } });
      return res.initPoint;
    },
    onSuccess: (initPoint) => {
      window.location.href = initPoint;
    },
    onError: (err) => {
      toast.error(friendlyError(err));
    },
  });

  const cancelMut = useMutation({
    mutationFn: async (subId: string) => cancelFn({ data: { subscriptionId: subId } }),
    onSuccess: () => {
      toast.success("Cancelamento solicitado. Sua assinatura permanecerá ativa até o fim do ciclo vigente.");
      qc.invalidateQueries({ queryKey: ["subscription", orgId] });
      qc.invalidateQueries({ queryKey: ["account-access", orgId] });
    },
    onError: (err) => {
      toast.error(friendlyError(err));
    },
  });

   // Mostra SEMPRE a tabela se houver interesse comercial OU se for owner querendo gerenciar
   // Mantém compatibilidade total com estados cancelados (volta automaticamente pra seleção nova)
   const showPricingTable = 
     !subscription || // Sem sub ativa → mostra todas as opções livres
     isOwner ||       // Owner logado → sempre pode visualizar alternativas mesmo tendo sub vigente
     true;            // Fallback defensivo: admin também enxerga contexto financeiro completo
      
   // Alternativamente, se quiser restringir estritamente ao modelo original mas permitir upgrades:
   /*
   const showPricingTable = 
     !subscription || 
     (isOwner && ["active","grace_period","past_due"].includes(subscription.state));
   */

  return (
    <div className="space-y-6">
      {/* Banner de Trial Limpo e Discreto */}
      {!subscription && access?.effective_state === "trial" && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">Período experimental ativo</p>
              <p className="text-xs text-muted-foreground">
                Restam <span className="font-semibold text-primary tabular-nums">{access.days_left}</span>{" "}
                {Number(access.days_left) === 1 ? "dia" : "dias"} do seu teste grátis. Escolha um plano abaixo para manter seu acesso contínuo.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="hidden sm:inline-flex border-primary/30 text-primary bg-primary/5">
            Trial Gratuito
          </Badge>
        </div>
      )}

      {/* Grid de Cards Limpo sem Badges */}
      {showPricingTable && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
          {TIERS.map((tier) => {
            const isActive =
              subscription?.plan_code === tier.code &&
              subscription.state !== "canceled_by_user" &&
              subscription.state !== "canceled_by_dunning";

            const isHighlighted = tier.code === "crescimento";

            return (
              <div
                key={tier.code}
                className={`flex flex-col justify-between rounded-xl p-5 border transition-all ${
                  isHighlighted
                    ? "border-primary bg-card/90 shadow-md ring-1 ring-primary/30"
                    : "border-border/60 bg-card/40 hover:border-border"
                }`}
              >
                {/* Informações do Plano */}
                <div>
                  <h3 className="text-base font-bold text-foreground mb-1.5">{tier.name}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed min-h-[32px]">
                    {tier.description}
                  </p>

                  {/* Preço em linha única */}
                  <div className="my-5 flex items-baseline gap-1 whitespace-nowrap">
                    <span className="text-xs font-semibold text-muted-foreground">R$</span>
                    <span className="text-3xl font-extrabold tracking-tight text-foreground">
                      {tier.price}
                    </span>
                    <span className="text-xs text-muted-foreground font-medium">/mês</span>
                  </div>
                </div>

                {/* Ações (Botões em Largura Total) */}
                <div className="pt-2">
                  {isActive ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 py-2 text-xs font-semibold text-emerald-500 border border-emerald-500/20">
                        <Check className="h-3.5 w-3.5" />
                        Plano Ativo
                      </div>
                      {isOwner && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs text-destructive hover:text-destructive hover:bg-destructive/10 h-8"
                          onClick={() => {
                            if (
                              confirm(
                                "Tem certeza que deseja cancelar esta assinatura? Ela permanecerá ativa até o fim do ciclo vigente."
                              )
                            ) {
                              cancelMut.mutate(subscription!.id);
                            }
                          }}
                          disabled={cancelMut.isPending || subscription!.cancel_requested_by_user}
                        >
                          {cancelMut.isPending ? <Clock className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                          {subscription!.cancel_requested_by_user ? "Cancelamento pendente…" : "Cancelar assinatura"}
                        </Button>
                      )}
                    </div>
                  ) : (
                    <Button
                      variant={isHighlighted ? "default" : "outline"}
                      className="w-full text-xs font-semibold rounded-lg h-9"
                      onClick={() => subscribeMut.mutate(tier.code)}
                      disabled={!isOwner || subscribeMut.isPending}
                    >
                      {subscribeMut.isPending ? <Clock className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
                      Assinar {tier.name}
                    </Button>
                  )}

                  {!isOwner && !isActive && (
                    <p className="text-[10px] text-center text-muted-foreground/70 italic mt-2">
                      Apenas o proprietário pode alterar o plano.
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Resumo da Assinatura Vigente */}
      {subscription &&
        subscription.state !== "canceled_by_user" &&
        subscription.state !== "canceled_by_dunning" && (
          <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-foreground">
                    Plano Ativo: <span className="text-primary font-bold">{tierName}</span>
                  </h3>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {displayState.description}
                </p>
              </div>
              <Badge variant={displayState.badgeVariant} className="gap-1.5 py-1 px-2.5">
                {displayState.Icon && <displayState.Icon className="h-3.5 w-3.5" />}
                {displayState.label}
              </Badge>
            </div>

            {subscription.current_period_start && (
              <div className="grid grid-cols-2 gap-4 rounded-lg bg-muted/40 p-3 text-xs border border-border/40">
                <div>
                  <span className="text-muted-foreground block text-[10px] uppercase font-semibold tracking-wider">
                    Início do ciclo
                  </span>
                  <span className="font-mono font-medium text-foreground">
                    {formatDate(subscription.current_period_start)}
                  </span>
                </div>
                {subscription.current_period_end && (
                  <div>
                    <span className="text-muted-foreground block text-[10px] uppercase font-semibold tracking-wider">
                      Próxima renovação
                    </span>
                    <span className="font-mono font-medium text-foreground">
                      {formatDate(subscription.current_period_end)}
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
    </div>
  );
}

type DisplayState = {
  label: string;
  description: string;
  Icon?: typeof CheckCircle2;
  badgeVariant: "default" | "secondary" | "destructive" | "outline";
};

function deriveDisplayState(
  subscription: SubscriptionLike | null,
  access: AccountAccess | null
): DisplayState {
  if (!subscription && access?.effective_state === "trial") {
    return {
      label: "Teste grátis",
      description: `Restam ${access.days_left ?? "?"} dias do seu período experimental.`,
      Icon: Sparkles,
      badgeVariant: "secondary",
    };
  }

  if (!subscription) {
    return {
      label: "Sem plano",
      description: "Escolha um plano acima para liberar todos os recursos.",
      badgeVariant: "outline",
    };
  }

  switch (subscription.state) {
    case "active":
      return {
        label: "Ativo",
        description: "Sua assinatura está ativa e o pagamento em dia.",
        Icon: CheckCircle2,
        badgeVariant: "default",
      };
    case "grace_period":
      return {
        label: "Carência",
        description: "Pagamento pendente. Regularize para continuar utilizando o sistema.",
        Icon: Clock,
        badgeVariant: "secondary",
      };
    case "past_due":
      return {
        label: "Em atraso",
        description: "Falha na última cobrança. Atualize seu meio de pagamento.",
        Icon: AlertTriangle,
        badgeVariant: "destructive",
      };
    case "canceled_by_user":
    case "canceled_by_dunning":
      return {
        label: "Cancelado",
        description:
          subscription.state === "canceled_by_user"
            ? "Cancelamento solicitado pelo proprietário."
            : "Assinatura encerrada por falta de pagamento.",
        Icon: Ban,
        badgeVariant: "outline",
      };
    case "suspended":
      return {
        label: "Suspenso",
        description: "Conta suspensa. Entre em contato com o suporte.",
        Icon: Ban,
        badgeVariant: "destructive",
      };
    default:
      return {
        label: "Desconhecido",
        description: "Estado do plano não identificado.",
        badgeVariant: "outline",
      };
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso.slice(0, 10);
  }
}
