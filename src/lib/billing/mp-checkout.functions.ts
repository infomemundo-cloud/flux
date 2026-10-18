/**
 * Server Functions de Checkout MP (create + cancel + get + tier switch).
 *
 * Fase 4.7 Item 1 — Base da troca de tier:
 * • startTierSwitchCheckout cria transição + intent + preapproval via auto_recurring
 *   (sem plan_id, para não exigir card_token_id) com external_reference = switch:<id>.
 * • getPendingTierSwitch para a UI bloquear trocas concorrentes.
 * • createCheckoutSession, cancelSubscription e getCurrentSubscription intactos.
 *
 * Regra de estabilidade:
 * - compra normal continua usando createCheckoutSession (init_point do plano);
 * - troca usa startTierSwitchCheckout apenas quando já existe assinatura viva;
 * - nenhuma assinatura antiga é cancelada antes da aprovação do novo preapproval.
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  mpTokenFor,
  createPreapprovalForSwitch,
  buildTierSwitchExternalReference,
  MpApiError,
} from "./mp-api";
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

/**
 * Resolve a URL base pública do app para montar back_url do checkout de troca.
 * Defensivo: retorna null se nenhuma env estiver configurada (back_url vira opcional).
 */
function resolveAppBaseUrl(): string | null {
  const direct =
    process.env.PUBLIC_APP_URL ??
    process.env.APP_URL ??
    process.env.NEXT_PUBLIC_APP_URL;

  if (direct) return direct.replace(/\/+$/, "");

  const vercelProd = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelProd) return `https://${vercelProd}`;

  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;

  return null;
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

      // planId ainda é usado como metadado do intent e para validar que o tier
      // está configurado no ambiente. A CRIAÇÃO do preapproval NÃO o usa
      // (auto_recurring), para evitar o 400 "card_token_id is required".
      const planId = getPlanId(targetTierCode, liveMode);

      if (!planId) {
        throw new Error(
          `Plano '${targetTierCode}' não configurado para ambiente ${liveMode ? "produção" : "teste"}.`,
        );
      }

      const tierContract = TIER_CONTRACTS[targetTierCode];

      if (!tierContract) {
        throw new Error(`Contrato de tier desconhecido: ${targetTierCode}`);
      }

      const transactionAmount = tierContract.priceCents / 100;

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

      // back_url defensivo: melhora UX de retorno, mas nunca bloqueia a criação.
      let backUrl: string | undefined;
      try {
        const base = resolveAppBaseUrl();
        if (base) {
          const { data: org } = await supabaseAdmin
            .from("organizations")
            .select("slug")
            .eq("id", orgId)
            .maybeSingle();

          if (org?.slug) {
            backUrl = `${base}/app/o/${org.slug}/configuracoes`;
          }
        }
      } catch (e) {
        console.warn("[mp-checkout] switch_backurl_resolve_warning", {
          orgId,
          error: e instanceof Error ? e.message : String(e),
        });
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

        const mp = await createPreapprovalForSwitch({
          transactionAmount,
          currencyId: "BRL",
          frequency: 1,
          frequencyType: "months",
          externalReference: buildTierSwitchExternalReference(transitionId),
          liveMode,
          reason: `Troca de plano para ${targetTierCode}`,
          backUrl,
        });

        const { error: intentUpdateErr } = await supabaseAdmin
          .from("billing_checkout_intents")
          .update({ mp_preapproval_id: mp.id } as never)
          .eq("id", intentId);

        if (intentUpdateErr) {
          console.warn(
            "[mp-checkout] switch_intent_preapproval_update_error",
            {
              intentId,
              transitionId,
              mpPreapprovalId: mp.id,
              error: intentUpdateErr.message,
            },
          );
        }

        console.log("[mp-checkout] tier_switch_checkout_created", {
          orgId,
          transitionId,
          intentId,
          targetTierCode,
          transactionAmount,
          mpPreapprovalId: mp.id,
          liveMode,
          hasBackUrl: Boolean(backUrl),
        });

        return {
          initPoint: mp.initPoint,
          transitionId,
        };
      } catch (err) {
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

        if (err instanceof MpApiError) {
          const mpBody = err.body as
            | { message?: unknown; cause?: unknown; error?: unknown }
            | undefined;

          const mpMessage =
            typeof mpBody?.message === "string" ? mpBody.message : undefined;

          const mpCause = Array.isArray(mpBody?.cause)
            ? (
                mpBody.cause as Array<{
                  code?: unknown;
                  cause_code?: unknown;
                  description?: unknown;
                }>
              )
                .map((c) => {
                  const code = c?.code ?? c?.cause_code ?? "unknown";
                  const description =
                    typeof c?.description === "string" ? c.description : "";
                  return description ? `${code}: ${description}` : String(code);
                })
                .join(" | ")
            : undefined;

          console.error("[mp-checkout] tier_switch_mp_error", {
            orgId,
            transitionId,
            intentId,
            status: err.status,
            message: err.message,
            mp_message: mpMessage ?? null,
            mp_cause: mpCause ?? null,
            mp_body: mpBody ?? null,
          });

          const detail =
            mpCause ?? mpMessage ?? mpBody?.error ?? "sem detalhes do MP";

          throw new Error(
            `Falha ao iniciar troca no Mercado Pago (${err.status}): ${detail}`,
          );
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
