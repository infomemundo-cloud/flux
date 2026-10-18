/**
 * Server Functions de Checkout MP (create + cancel + get + tier switch).
 *
 * FASE 4.7 ITEM 1 — TROCA DE TIER (correção de abordagem 2026-10-18):
 * • A troca NÃO cria preapproval via API (POST /preapproval). Isso exigia
 *   payer_email, que no ambiente TEST precisa ser conta de teste do MP — e o
 *   e-mail do usuário da plataforma é real → 400 "Both payer and collector
 *   must be real or test users".
 * • A troca passa a usar EXATAMENTE o mesmo mecanismo da primeira compra:
 *   URL do plano MP + billing_checkout_intent. O MP cria o preapproval
 *   internamente, com o test user já logado no checkout (cartão salvo).
 * • A única diferença: o intent da troca carrega transition_id setado.
 *   É esse marcador que faz o processor entrar no ramo de troca.
 *
 * Regra de estabilidade:
 * - createCheckoutSession, cancelSubscription e getCurrentSubscription intactos;
 * - a troca reutiliza a mesma URL do plano, mesmo checkout, mesmo payer;
 * - nenhuma assinatura antiga é cancelada antes da aprovação do novo preapproval.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { mpTokenFor } from "./mp-api";
import { TIER_CONTRACTS } from "./tier-contracts";

const PLAN_IDS_TEST: Record<string, string> = {
  operacao: "2ae043b092704c96b1e67b4238295c43",
  crescimento: "67b0eca317cc4e00a03ba0654bd7ff64",
  escala: "5899e7efc405436995ef18cfea544747",
};

const PLAN_IDS_PROD: Record<string, string> = {
  // Preencher após seed em produção
};

const TierCodeSchema = z.enum(["operacao", "crescimento", "escala"]);

type TierCode = z.infer<typeof TierCodeSchema>;

const SWITCH_EXPIRY_HOURS = 24;

function getPlanId(tierCode: string, liveMode: boolean): string | undefined {
  const map = liveMode ? PLAN_IDS_PROD : PLAN_IDS_TEST;
  return map[tierCode];
}

const CreateInputSchema = z.object({
  orgId: z.string().uuid(),
  tierCode: TierCodeSchema,
});

const CancelInputSchema = z.object({
  subscriptionId: z.string().uuid(),
});

const SwitchInputSchema = z.object({
  orgId: z.string().uuid(),
  targetTierCode: TierCodeSchema,
});

const PendingTierSwitchInputSchema = z.object({
  orgId: z.string().uuid(),
});

export interface PendingTierSwitch {
  id: string;
  status: "pending";
  fromTierCode: string | null;
  toTierCode: TierCode;
  fromSubscriptionId: string;
  expiresAt: string;
  createdAt: string;
}

async function assertOwnerOrAdmin(
  orgId: string,
  userId: string,
): Promise<void> {
  const { data: membership } = await supabaseAdmin
    .from("memberships")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error(
      "Sem permissão para gerenciar assinaturas desta organização.",
    );
  }
}

function isUniqueViolation(
  error: unknown,
  constraint?: string,
): boolean {
  const err = error as { code?: string; message?: string } | null | undefined;

  if (!err) return false;

  if (err.code === "23505") return true;

  if (
    constraint &&
    typeof err.message === "string" &&
    err.message.includes(constraint)
  ) {
    return true;
  }

  return false;
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CreateInputSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ initPoint: string }> => {
    const { orgId, tierCode } = data;
    const userId = context.userId!;

    await assertOwnerOrAdmin(orgId, userId);

    const liveMode = process.env.MP_ENV === "prod";
    const planId = getPlanId(tierCode, liveMode);

    if (!planId) {
      throw new Error(
        `Plano '${tierCode}' não configurado para ambiente ${liveMode ? "produção" : "teste"}.`,
      );
    }

    const baseUrl = "https://www.mercadopago.com.br";
    const initPoint = `${baseUrl}/subscriptions/checkout?preapproval_plan_id=${encodeURIComponent(planId)}`;

    console.log("[mp-checkout] session_created_via_init_point", {
      orgId,
      tierCode,
      liveMode,
      planId,
      initPoint,
    });

    const { error: intentErr } = await supabaseAdmin
      .from("billing_checkout_intents")
      .insert({
        org_id: orgId,
        tier_code: tierCode,
        mp_plan_id: planId,
        status: "pending",
      } as never);

    if (intentErr) {
      console.warn("[mp-checkout] intent_insert_error", {
        orgId,
        tierCode,
        error: intentErr.message,
      });
    }

    return { initPoint };
  });

export const cancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => CancelInputSchema.parse(d))
  .handler(async ({ data, context }): Promise<{ success: boolean }> => {
    const { subscriptionId } = data;
    const userId = context.userId!;

    const { data: sub, error: subErr } = await supabaseAdmin
      .from("subscriptions")
      .select("id, org_id, mp_preapproval_id, state")
      .eq("id", subscriptionId)
      .maybeSingle();

    if (subErr || !sub) {
      throw new Error("Assinatura não encontrada.");
    }

    await assertOwnerOrAdmin(sub.org_id, userId);

    if (!sub.mp_preapproval_id) {
      throw new Error("Assinatura sem vínculo com Mercado Pago.");
    }

    const { error: flagErr } = await supabaseAdmin
      .from("subscriptions")
      .update({ cancel_requested_by_user: true } as never)
      .eq("id", subscriptionId);

    if (flagErr) {
      throw new Error("Falha ao registrar solicitação de cancelamento.");
    }

    const liveMode = process.env.MP_ENV === "prod";
    const token = mpTokenFor(liveMode);

    if (!token) {
      throw new Error(
        `Token MP indisponível para ambiente ${liveMode ? "prod" : "test"}.`,
      );
    }

    const res = await fetch(
      `https://api.mercadopago.com/preapproval/${encodeURIComponent(sub.mp_preapproval_id)}`,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ status: "cancelled" }),
      },
    );

    if (!res.ok) {
      throw new Error("Mercado Pago recusou o cancelamento.");
    }

    return { success: true };
  });

const GetCurrentInputSchema = z.object({
  orgId: z.string().uuid(),
});

export const getCurrentSubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GetCurrentInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { orgId } = data;
    const userId = context.userId!;

    const { data: membership } = await supabaseAdmin
      .from("memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) throw new Error("Sem acesso a esta organização.");

    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select(
        "id, plan_code, state, current_period_start, current_period_end, cancel_requested_by_user, mp_preapproval_id",
      )
      .eq("org_id", orgId)
      .in("state", ["active", "grace_period", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return sub ?? null;
  });

// ============================================================================
// FASE 4.7 ITEM 1 — TROCA DE TIER
// ============================================================================

/**
 * Inicia uma troca de tier.
 *
 * Mecanismo (idêntico à primeira compra):
 * 1. valida owner/admin;
 * 2. localiza assinatura viva;
 * 3. impede troca para o mesmo tier;
 * 4. impede múltiplas transições pendentes;
 * 5. cria tier_transition pending;
 * 6. cria billing_checkout_intent COM transition_id (o marcador da troca);
 * 7. retorna a URL do plano MP (mesma tela, mesmo test user, mesmo cartão).
 *
 * Importante:
 * - NÃO chama POST /preapproval (evita o 400 de payer_email real vs collector teste);
 * - a assinatura antiga NÃO é cancelada aqui;
 * - a troca efetiva acontece no processor via billing_complete_tier_switch(),
 *   disparado quando o webhook resolve o intent com transition_id.
 */
export const startTierSwitchCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SwitchInputSchema.parse(d))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ initPoint: string; transitionId: string }> => {
      const { orgId, targetTierCode } = data;
      const userId = context.userId!;

      await assertOwnerOrAdmin(orgId, userId);

      const liveMode = process.env.MP_ENV === "prod";
      const planId = getPlanId(targetTierCode, liveMode);

      if (!planId) {
        throw new Error(
          `Plano '${targetTierCode}' não configurado para ambiente ${liveMode ? "produção" : "teste"}.`,
        );
      }

      // Garante que o tier alvo existe no contrato central (consistência UI/gates).
      const tierContract = TIER_CONTRACTS[targetTierCode];
      if (!tierContract) {
        throw new Error(`Contrato de tier desconhecido: ${targetTierCode}`);
      }

      const nowIso = new Date().toISOString();

      const { data: currentSub, error: currentSubErr } = await supabaseAdmin
        .from("subscriptions")
        .select("id, plan_code, mp_preapproval_id")
        .eq("org_id", orgId)
        .in("state", ["active", "grace_period", "past_due"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (currentSubErr) {
        throw new Error(
          `Falha ao ler assinatura ativa: ${currentSubErr.message}`,
        );
      }

      if (!currentSub) {
        throw new Error(
          "Nenhuma assinatura ativa encontrada para troca de plano.",
        );
      }

      if (currentSub.plan_code === targetTierCode) {
        throw new Error("Esta organização já está no plano selecionado.");
      }

      const { data: existingPending, error: existingPendingErr } =
        await supabaseAdmin
          .from("tier_transitions")
          .select("id")
          .eq("org_id", orgId)
          .eq("status", "pending")
          .gt("expires_at", nowIso)
          .maybeSingle();

      if (existingPendingErr) {
        throw new Error(
          `Falha ao verificar troca em andamento: ${existingPendingErr.message}`,
        );
      }

      if (existingPending) {
        throw new Error("Já existe uma troca de plano em andamento.");
      }

      let transitionId: string | null = null;
      let intentId: string | null = null;

      try {
        const expiresAt = new Date(
          Date.now() + SWITCH_EXPIRY_HOURS * 60 * 60 * 1000,
        ).toISOString();

        const { data: transition, error: transitionErr } = await supabaseAdmin
          .from("tier_transitions")
          .insert(
            {
              org_id: orgId,
              from_subscription_id: currentSub.id,
              from_mp_preapproval_id: currentSub.mp_preapproval_id ?? null,
              to_tier_code: targetTierCode,
              status: "pending",
              expires_at: expiresAt,
              metadata: {
                source: "billing_plan_card",
                requested_by: userId,
              },
            } as never,
          )
          .select("id")
          .single();

        if (transitionErr) {
          if (
            isUniqueViolation(
              transitionErr,
              "tier_transitions_org_pending_uq",
            )
          ) {
            throw new Error(
              "Já existe uma troca de plano em andamento.",
            );
          }

          throw new Error(
            `Falha ao registrar troca de plano: ${transitionErr.message}`,
          );
        }

        transitionId = transition.id;

        // Intent da troca: igual ao da primeira compra, MAS com transition_id.
        // É esse marcador que o processor usa para entrar no ramo de troca.
        const { data: intent, error: intentErr } = await supabaseAdmin
          .from("billing_checkout_intents")
          .insert(
            {
              org_id: orgId,
              tier_code: targetTierCode,
              mp_plan_id: planId,
              status: "pending",
              transition_id: transitionId,
            } as never,
          )
          .select("id")
          .single();

        if (intentErr) {
          throw new Error(
            `Falha ao registrar intenção de checkout da troca: ${intentErr.message}`,
          );
        }

        intentId = intent.id;

        // Mesma URL da primeira compra. O MP cria o preapproval internamente,
        // com o test user logado no checkout. Nenhum POST /preapproval nosso.
        const baseUrl = "https://www.mercadopago.com.br";
        const initPoint = `${baseUrl}/subscriptions/checkout?preapproval_plan_id=${encodeURIComponent(planId)}`;

        console.log("[mp-checkout] tier_switch_checkout_created", {
          orgId,
          transitionId,
          intentId,
          targetTierCode,
          planId,
          liveMode,
          initPoint,
        });

        return {
          initPoint,
          transitionId,
        };
      } catch (err) {
        // Sem chamada externa após a criação do intent: o único ponto de falha
        // residual é o próprio insert. Marcamos a transição como failed para
        // não deixar pending órfão (o unique é só em pending, então não trava
        // a org, mas mantém higiene).
        if (transitionId) {
          const { error: failTransitionErr } = await supabaseAdmin
            .from("tier_transitions")
            .update({ status: "failed" } as never)
            .eq("id", transitionId)
            .eq("status", "pending");

          if (failTransitionErr) {
            console.warn(
              "[mp-checkout] switch_transition_fail_cleanup_error",
              {
                transitionId,
                error: failTransitionErr.message,
              },
            );
          }
        }

        if (intentId) {
          const { error: failIntentErr } = await supabaseAdmin
            .from("billing_checkout_intents")
            .update({ status: "failed" } as never)
            .eq("id", intentId);

          if (failIntentErr) {
            console.warn(
              "[mp-checkout] switch_intent_fail_cleanup_error",
              {
                intentId,
                error: failIntentErr.message,
              },
            );
          }
        }

        throw err;
      }
    },
  );

export const getPendingTierSwitch = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => PendingTierSwitchInputSchema.parse(d))
  .handler(async ({ data, context }): Promise<PendingTierSwitch | null> => {
    const { orgId } = data;
    const userId = context.userId!;

    const { data: membership, error: membershipErr } = await supabaseAdmin
      .from("memberships")
      .select("id")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();

    if (membershipErr) {
      throw new Error(`Falha ao validar acesso: ${membershipErr.message}`);
    }

    if (!membership) {
      throw new Error("Sem acesso a esta organização.");
    }

    const nowIso = new Date().toISOString();

    const { data: transition, error } = await supabaseAdmin
      .from("tier_transitions")
      .select(
        "id, status, from_subscription_id, to_tier_code, expires_at, created_at",
      )
      .eq("org_id", orgId)
      .eq("status", "pending")
      .gt("expires_at", nowIso)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      throw new Error(
        `Falha ao consultar troca pendente: ${error.message}`,
      );
    }

    if (!transition) {
      return null;
    }

    const { data: fromSub, error: fromSubErr } = await supabaseAdmin
      .from("subscriptions")
      .select("plan_code")
      .eq("id", transition.from_subscription_id)
      .maybeSingle();

    if (fromSubErr) {
      console.warn("[mp-checkout] pending_switch_from_subscription_error", {
        transitionId: transition.id,
        fromSubscriptionId: transition.from_subscription_id,
        error: fromSubErr.message,
      });
    }

    return {
      id: transition.id,
      status: "pending",
      fromTierCode: fromSub?.plan_code ?? null,
      toTierCode: transition.to_tier_code as TierCode,
      fromSubscriptionId: transition.from_subscription_id,
      expiresAt: transition.expires_at,
      createdAt: transition.created_at,
    };
  });
