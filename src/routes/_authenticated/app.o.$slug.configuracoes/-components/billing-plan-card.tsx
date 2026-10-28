/**
 * Layout clean de pricing sem badges flutuantes, botões uniformes em largura total
 * e preços alinhados sem quebra de linha.
 *
 * CORREÇÃO DE BUG: Isola o estado de loading por card usando useState<string|null>.
 * Antes, uma única useMutation compartilhava isPending entre os 3 bots, causando
 * spinners sincrônicos indesejados. Agora, apenas o botão clicado gira.
 *
 * FASE 4.7 ITEM 1 (UX de Troca de Tier — padrão de mercado):
 * • Rótulo direcional derivado do preço (TIER_CONTRACTS.priceCents), nunca hardcoded:
 *   alvo mais caro → "Upgrade"; alvo mais barato → "Downgrade"; igual → "Plano Ativo".
 * • Downgrade tem fricção intencional: confirm enumerando features/limites perdidos
 *   (diff entre contratos) + aviso de cobrança imediata (nosso modelo substitui a
 *   cobrança atual neste ciclo; não agenda para o fim do período).
 * • CTA de downgrade é visualmente menos proeminente (variant outline).
 * • pendingSwitch continua bloqueando todas as ações concorrentes.
 */
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  Ban,
  Sparkles,
  Check,
} from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { friendlyError } from "@/lib/friendly-error";
import {
  createCheckoutSession,
  cancelSubscription,
  startTierSwitchCheckout,
} from "@/lib/billing/mp-checkout.functions";
import type { PendingTierSwitch } from "@/lib/billing/mp-checkout.functions";
import type { AccountAccess } from "@/lib/billing/account-access";
import { TIER_CONTRACTS } from "@/lib/billing/tier-contracts";
import { useState } from "react";

type SubscriptionState =
  | "active"
  | "grace_period"
  | "past_due"
  | "canceled_by_user"
  | "canceled_by_dunning"
  | "suspended"
  | "canceled_by_upgrade";

interface SubscriptionLike {
  id: string;
  plan_code: string;
  state: SubscriptionState;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_requested_by_user: boolean;
  mp_preapproval_id: string | null;
}

interface BillingPlanCardProps {
  subscription: SubscriptionLike | null;
  access: AccountAccess | null;
  pendingSwitch?: PendingTierSwitch | null;
  isOwner: boolean;
  orgId: string;
}

const TIERS = [
  {
    code: "operacao",
    name: "Operação",
    price: "97",
    description: TIER_CONTRACTS.operacao.marketingHighlights
      .slice(0, 2)
      .join(" • "),
  },
  {
    code: "crescimento",
    name: "Crescimento",
    price: "197",
    description: TIER_CONTRACTS.crescimento.marketingHighlights
      .slice(0, 2)
      .join(" • "),
  },
  {
    code: "escala",
    name: "Escala",
    price: "397",
    description: TIER_CONTRACTS.escala.marketingHighlights
      .slice(0, 2)
      .join(" • "),
  },
] as const;

type TierCode = (typeof TIERS)[number]["code"];

const LIVE_SUBSCRIPTION_STATES: readonly SubscriptionState[] = [
  "active",
  "grace_period",
  "past_due",
];

const HISTORICAL_SUBSCRIPTION_STATES: readonly SubscriptionState[] = [
  "canceled_by_user",
  "canceled_by_dunning",
  "canceled_by_upgrade",
];

function isLiveSubscription(
  subscription: SubscriptionLike | null,
): subscription is SubscriptionLike & {
  state: (typeof LIVE_SUBSCRIPTION_STATES)[number];
} {
  return Boolean(
    subscription &&
      (LIVE_SUBSCRIPTION_STATES as readonly SubscriptionState[]).includes(
        subscription.state,
      ),
  );
}

function isHistoricalSubscription(
  subscription: SubscriptionLike | null,
): boolean {
  return Boolean(
    subscription &&
      (HISTORICAL_SUBSCRIPTION_STATES as readonly SubscriptionState[]).includes(
        subscription.state,
      ),
  );
}

function findTierDefinition(code: string | null | undefined) {
  if (!code) return null;
  return TIERS.find((t) => t.code === (code as TierCode)) ?? null;
}

// ============================================================================
// FASE 4.7 ITEM 1 — DIREÇÃO DA TROCA (UPGRADE / DOWNGRADE)
// ============================================================================

type SwitchDirection = "upgrade" | "downgrade";

/**
 * Direção calculada pelo preço do contrato (fonte única de verdade).
 * Nunca derivada da posição do card no grid.
 * Fallback seguro: se algum contrato faltar, trata como upgrade
 * (comportamento anterior, não bloqueia a troca).
 */
function getSwitchDirection(
  currentTierCode: string,
  targetTierCode: string,
): SwitchDirection {
  const current = TIER_CONTRACTS[currentTierCode];
  const target = TIER_CONTRACTS[targetTierCode];

  if (!current || !target) return "upgrade";

  return target.priceCents > current.priceCents ? "upgrade" : "downgrade";
}

function formatLimit(value: number | null): string {
  if (value === null || value === Infinity) return "ilimitado";
  return String(value);
}

/**
 * Diff de perdas para o confirm de downgrade.
 * Compara flags booleanas e limites quantitativos entre os contratos.
 * Retorna lista legível do que a org perde ao descer de tier.
 */
function getDowngradeLosses(
  fromTierCode: string,
  toTierCode: string,
): string[] {
  const from = TIER_CONTRACTS[fromTierCode];
  const to = TIER_CONTRACTS[toTierCode];

  if (!from || !to) return [];

  const losses: string[] = [];

  if (from.aiAgentEnabled && !to.aiAgentEnabled) losses.push("Agente IA");
  if (from.customSlaRules && !to.customSlaRules)
    losses.push("Regras de SLA personalizadas");
  if (from.advancedAutoAssign && !to.advancedAutoAssign)
    losses.push("Auto-atribuição inteligente");
  if (from.advancedAnalytics && !to.advancedAnalytics)
    losses.push("Analytics avançado");
  if (from.prioritySupport && !to.prioritySupport)
    losses.push("Suporte prioritário");
  if (from.groupIngestEnabled && !to.groupIngestEnabled)
    losses.push("Automação de grupos do WhatsApp");

  if (to.maxTeamMembers < from.maxTeamMembers)
    losses.push(
      `Operadores: de ${formatLimit(from.maxTeamMembers)} para ${formatLimit(to.maxTeamMembers)}`,
    );

  if (to.maxWhatsappChannels < from.maxWhatsappChannels)
    losses.push(
      `Canais WhatsApp: de ${formatLimit(from.maxWhatsappChannels)} para ${formatLimit(to.maxWhatsappChannels)}`,
    );

  if (to.maxMessagesPerMonth < from.maxMessagesPerMonth) {
    losses.push(
      `Mensagens/mês: de ${formatLimit(from.maxMessagesPerMonth)} para ${formatLimit(to.maxMessagesPerMonth)}`,
    );
  }

  return losses;
}

export function BillingPlanCard({
  subscription,
  access,
  pendingSwitch,
  isOwner,
  orgId,
}: BillingPlanCardProps) {
  const qc = useQueryClient();
  const checkoutFn = useServerFn(createCheckoutSession);
  const cancelFn = useServerFn(cancelSubscription);
  const switchFn = useServerFn(startTierSwitchCheckout);

  const [loadingTierCode, setLoadingTierCode] = useState<string | null>(null);

  const displayState = deriveDisplayState(subscription, access);

  const tierName = subscription?.plan_code
    ? TIERS.find((t) => t.code === subscription.plan_code)?.name ??
      subscription.plan_code
    : null;

  const subscriptionIsHistorical = isHistoricalSubscription(subscription);
  const pendingSwitchActive = Boolean(pendingSwitch);

  const pendingTargetTier = pendingSwitch
    ? findTierDefinition(pendingSwitch.toTierCode)
    : null;

  const pendingFromTier = pendingSwitch?.fromTierCode
    ? findTierDefinition(pendingSwitch.fromTierCode)
    : null;

  const subscribeMut = useMutation({
    mutationFn: async (tierCode: TierCode) => {
      setLoadingTierCode(tierCode);
      try {
        const res = await checkoutFn({ data: { orgId, tierCode } });
        return res.initPoint;
      } finally {
        setLoadingTierCode(null);
      }
    },
    onSuccess: (initPoint) => {
      qc.invalidateQueries({ queryKey: ["account-access", orgId] });
      qc.invalidateQueries({ queryKey: ["subscription", orgId] });
      qc.invalidateQueries({ queryKey: ["pending-tier-switch", orgId] });
      window.location.href = initPoint;
    },
    onError: (err) => {
      toast.error(friendlyError(err));
    },
  });

  const switchMut = useMutation({
    mutationFn: async (targetTierCode: TierCode) => {
      setLoadingTierCode(targetTierCode);
      try {
        const res = await switchFn({
          data: { orgId, targetTierCode },
        });
        return res.initPoint;
      } finally {
        setLoadingTierCode(null);
      }
    },
    onSuccess: (initPoint) => {
      qc.invalidateQueries({ queryKey: ["account-access", orgId] });
      qc.invalidateQueries({ queryKey: ["subscription", orgId] });
      qc.invalidateQueries({ queryKey: ["pending-tier-switch", orgId] });
      window.location.href = initPoint;
    },
    onError: (err) => {
      toast.error(friendlyError(err));
    },
  });

  const cancelMut = useMutation({
    mutationFn: async (subId: string) =>
      cancelFn({ data: { subscriptionId: subId } }),
    onSuccess: () => {
      toast.success(
        "Cancelamento solicitado. Sua assinatura permanecerá ativa até o fim do ciclo vigente.",
      );
      qc.invalidateQueries({ queryKey: ["subscription", orgId] });
      qc.invalidateQueries({ queryKey: ["account-access", orgId] });
      qc.invalidateQueries({ queryKey: ["pending-tier-switch", orgId] });
    },
    onError: (err) => {
      toast.error(friendlyError(err));
    },
  });

  /**
   * Clique em troca com fricção direcional:
   * - upgrade: segue direto (conversão sem atrito);
   * - downgrade: confirm enumerando perdas + aviso de cobrança imediata.
   */
  const handleSwitchClick = (targetCode: TierCode) => {
    const currentCode = subscription?.plan_code;
    if (!currentCode) return;

    const direction = getSwitchDirection(currentCode, targetCode);

    if (direction === "downgrade") {
      const targetName = findTierDefinition(targetCode)?.name ?? targetCode;
      const losses = getDowngradeLosses(currentCode, targetCode);

      const lossList = losses.length
        ? losses.map((l) => `• ${l}`).join("\n")
        : "• Nenhum recurso adicional será perdido.";

      const message =
        `Mudar para ${targetName} (downgrade)\n\n` +
        `O que você perde ao mudar:\n${lossList}\n\n` +
        `A mudança é imediata: a cobrança atual é substituída agora e o novo valor passa a valer neste ciclo.\n\n` +
        `Confirmar downgrade?`;

      if (!confirm(message)) return;
    }

    switchMut.mutate(targetCode);
  };

  const showPricingTable =
    !subscription ||
    isOwner ||
    true;

  return (
    <div className="space-y-6">
      {/* Banner de Troca Pendente */}
      {pendingSwitch && (
        <div className="flex items-start justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Clock className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Troca de plano em andamento
              </p>
              <p className="text-xs text-muted-foreground">
                {pendingFromTier && pendingTargetTier
                  ? `Do ${pendingFromTier.name} para ${pendingTargetTier.name}. `
                  : ""}
                Aguardando aprovação no Mercado Pago. Novas alterações ficam
                bloqueadas até a confirmação ou expiração.
              </p>
              <p className="text-[11px] text-muted-foreground/80 mt-1">
                Expira em {formatDate(pendingSwitch.expiresAt)}.
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className="hidden sm:inline-flex border-primary/30 text-primary bg-primary/5"
          >
            Pendente
          </Badge>
        </div>
      )}

      {/* Banner de Trial */}
      {!subscription && access?.effective_state === "trial" && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-primary/20 bg-primary/5 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Período experimental ativo
              </p>
              <p className="text-xs text-muted-foreground">
                Restam{" "}
                <span className="font-semibold text-primary tabular-nums">
                  {access.days_left}
                </span>{" "}
                {Number(access.days_left) === 1 ? "dia" : "dias"} do seu teste
                grátis. Escolha um plano abaixo para manter seu acesso contínuo.
              </p>
            </div>
          </div>
          <Badge
            variant="outline"
            className="hidden sm:inline-flex border-primary/30 text-primary bg-primary/5"
          >
            Trial Gratuito
          </Badge>
        </div>
      )}

      {/* Grid de Cards Limpo e Alinhado */}
      {showPricingTable && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-stretch">
          {TIERS.map((tier) => {
            const activeSubscription =
              subscription &&
              subscription.plan_code === tier.code &&
              !subscriptionIsHistorical
                ? subscription
                : null;

            const canSwitch = Boolean(
              isOwner &&
                subscription &&
                isLiveSubscription(subscription) &&
                !subscriptionIsHistorical &&
                !pendingSwitchActive &&
                subscription.plan_code !== tier.code,
            );

            /**
             * Direção da troca para este card (só relevante quando canSwitch).
             * upgrade  → CTA proeminente, sem fricção;
             * downgrade → CTA outline + confirm com perdas.
             */
            const direction: SwitchDirection | null =
              canSwitch && subscription
                ? getSwitchDirection(subscription.plan_code, tier.code)
                : null;

            const isHighlighted = tier.code === "crescimento";
            const isThisCardLoading = loadingTierCode === tier.code;
            const isPendingTarget = pendingSwitch?.toTierCode === tier.code;

            const tierContract = TIER_CONTRACTS[tier.code];
            const highlights = tierContract?.marketingHighlights ?? [];

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
                  <h3 className="text-base font-bold text-foreground mb-1.5">
                    {tier.name}
                  </h3>
                  <p className="text-xs text-muted-foreground leading-relaxed min-h-[32px]">
                    {tier.description}
                  </p>

                  <ul className="mt-3 space-y-1.5">
                    {highlights.slice(0, 4).map((highlight, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-1.5 text-[11px] text-muted-foreground"
                      >
                        <Check className="h-3 w-3 text-primary shrink-0 mt-0.5" />
                        <span>{highlight}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="my-5 flex items-baseline gap-1 whitespace-nowrap">
                    <span className="text-xs font-semibold text-muted-foreground">
                      R$
                    </span>
                    <span className="text-3xl font-extrabold tracking-tight text-foreground">
                      {tier.price}
                    </span>
                    <span className="text-xs text-muted-foreground font-medium">
                      /mês
                    </span>
                  </div>
                </div>

                {/* Ações com copywriting focado em conversão */}
                <div className="pt-2">
                  {activeSubscription ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500/10 py-2 text-xs font-semibold text-emerald-500 border border-emerald-500/20">
                        <Check className="h-3.5 w-3.5" />
                        Plano Ativo
                      </div>
                      {isOwner && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="w-full text-xs text-destructive hover:text-destructive hover:bg-destructive/10 h-9 px-3"
                          onClick={() => {
                            if (
                              confirm(
                                "Tem certeza que deseja cancelar esta assinatura? Ela permanecerá ativa até o fim do ciclo vigente.",
                              )
                            ) {
                              cancelMut.mutate(activeSubscription.id);
                            }
                          }}
                          disabled={
                            cancelMut.isPending ||
                            activeSubscription.cancel_requested_by_user ||
                            pendingSwitchActive
                          }
                        >
                          {cancelMut.isPending ? (
                            <Clock className="mr-1.5 h-3.5 w-3.5 animate-spin shrink-0" />
                          ) : null}
                          <span className="truncate">
                            {activeSubscription.cancel_requested_by_user
                              ? "Cancelamento pendente…"
                              : pendingSwitchActive
                                ? "Alteração bloqueada"
                                : "Cancelar assinatura"}
                          </span>
                        </Button>
                      )}
                    </div>
                  ) : canSwitch ? (
                    <div className="space-y-2">
                      <p className="text-[11px] text-muted-foreground text-center font-medium">
                        {direction === "downgrade"
                          ? "Ajuste ao tamanho da sua operação"
                          : "Evolua sua operação instantaneamente"}
                      </p>
                      <Button
                        variant={
                          direction === "downgrade"
                            ? "outline"
                            : isHighlighted
                              ? "default"
                              : "outline"
                        }
                        className="w-full text-xs font-semibold rounded-lg h-9 px-4 shadow-sm"
                        onClick={() => handleSwitchClick(tier.code)}
                        disabled={
                          !isOwner || isThisCardLoading || pendingSwitchActive
                        }
                      >
                        {isThisCardLoading ? (
                          <Clock className="mr-1.5 h-3.5 w-3.5 animate-spin shrink-0" />
                        ) : null}
                        <span>
                          {direction === "downgrade" ? "Downgrade" : "Upgrade"}
                        </span>
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-[11px] text-muted-foreground text-center font-medium">
                        Pronto para escalar com segurança
                      </p>
                      <Button
                        variant={isHighlighted ? "default" : "outline"}
                        className="w-full text-xs font-semibold rounded-lg h-9 px-4 shadow-sm"
                        onClick={() => subscribeMut.mutate(tier.code)}
                        disabled={
                          !isOwner || isThisCardLoading || pendingSwitchActive
                        }
                      >
                        {isThisCardLoading ? (
                          <Clock className="mr-1.5 h-3.5 w-3.5 animate-spin shrink-0" />
                        ) : null}
                        <span>
                          {pendingSwitchActive && isPendingTarget
                            ? "Troca em andamento"
                            : "Começar agora"}
                        </span>
                      </Button>
                    </div>
                  )}

                  {!isOwner && !activeSubscription && (
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
      {subscription && !subscriptionIsHistorical && (
        <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold text-foreground">
                  Plano Ativo:{" "}
                  <span className="text-primary font-bold">{tierName}</span>
                </h3>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {displayState.description}
              </p>
            </div>
            <Badge
              variant={displayState.badgeVariant}
              className="gap-1.5 py-1 px-2.5"
            >
              {displayState.Icon && (
                <displayState.Icon className="h-3.5 w-3.5" />
              )}
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
  access: AccountAccess | null,
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
      description:
        "Escolha um plano acima para liberar todos os recursos.",
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
        description:
          "Pagamento pendente. Regularize para continuar utilizando o sistema.",
        Icon: Clock,
        badgeVariant: "secondary",
      };

    case "past_due":
      return {
        label: "Em atraso",
        description:
          "Falha na última cobrança. Atualize seu meio de pagamento.",
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

    case "canceled_by_upgrade":
      return {
        label: "Substituído",
        description: "Assinatura substituída por troca de plano.",
        Icon: Ban,
        badgeVariant: "outline",
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
    return new Date(iso).toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return iso.slice(0, 10);
  }
}
