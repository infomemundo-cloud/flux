/**
 * Fase 4.5 — Server Functions de Checkout MP (create + cancel).
 * 
 * ATUALIZAÇÃO 2026-10-09: PLAN_IDS_TEST atualizado com os 3 novos planos
 * criados na aplicação 46866664961523154 (vendedor de teste).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MpApiError, mpTokenFor } from "./mp-api";

// ---------- Mapeamento canônico tierCode → mp_plan_id ----------
// IDs dos planos criados na aplicação 46866664961523154 (vendedor de teste)
// em 2026-10-09 via POST /preapproval_plan
const PLAN_IDS_TEST: Record<string, string> = {
  operacao: "2ae043b092704c96b1e67b4238295c43",
  crescimento: "67b0eca317cc4e00a03ba0654bd7ff64",
  escala: "5899e7efc405436995ef18cfea544747",
};

// Para produção, substituir pelos IDs reais após rodar o seed em PROD
const PLAN_IDS_PROD: Record<string, string> = {
  // TODO: preencher após seed em produção
};

function getPlanId(tierCode: string, liveMode: boolean): string | undefined {
  const map = liveMode ? PLAN_IDS_PROD : PLAN_IDS_TEST;
  return map[tierCode];
}

// ---------- Validação de input compartilhada ----------
const CreateInputSchema = z.object({
  orgId: z.string().uuid(),
  tierCode: z.enum(["operacao", "crescimento", "escala"]),
});

const CancelInputSchema = z.object({
  subscriptionId: z.string().uuid(),
});

// ---------- Helper: assertMemberRole (RBAC §17) ----------
async function assertOwnerOrAdmin(orgId: string, userId: string): Promise<void> {
  const { data: membership } = await supabaseAdmin
    .from("memberships")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!membership || !["owner", "admin"].includes(membership.role)) {
    throw new Error("Sem permissão para gerenciar assinaturas desta organização.");
  }
}

// ---------- Server Function: createCheckoutSession ----------
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
        `Plano '${tierCode}' não configurado para ambiente ${liveMode ? "produção" : "teste"}. ` +
        `Execute o seed correspondente antes de prosseguir.`,
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

    return { initPoint };
  });

// ---------- Server Function: cancelSubscription ----------
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
      throw new Error("Assinatura sem vínculo com Mercado Pago. Contate suporte.");
    }

    // DECISÃO C5: setar flag cancel_requested_by_user=true ANTES do PUT no MP
    const { error: flagErr } = await supabaseAdmin
      .from("subscriptions")
      .update({ cancel_requested_by_user: true } as never)
      .eq("id", subscriptionId);

    if (flagErr) {
      console.error("[mp-checkout] flag_update_failed", {
        subscriptionId,
        error: flagErr.message,
      });
      throw new Error("Falha ao registrar solicitação de cancelamento. Tente novamente.");
    }

    const liveMode = process.env.MP_ENV === "prod";
    const token = mpTokenFor(liveMode);

    if (!token) {
      throw new Error(`Token MP indisponível para ambiente ${liveMode ? "prod" : "test"}.`);
    }

    try {
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
        const body = await res.json().catch(() => ({}));
        console.error("[mp-checkout] mp_cancel_failed", {
          subscriptionId,
          mpPreapprovalId: sub.mp_preapproval_id,
          status: res.status,
          body,
        });
        throw new Error("Mercado Pago recusou o cancelamento. Verifique dados da assinatura.");
      }
    } catch (err) {
      console.error("[mp-checkout] mp_cancel_error", {
        subscriptionId,
        error: err instanceof Error ? err.message : String(err),
      });
      throw new Error("Falha ao comunicar cancelamento ao Mercado Pago. Tente novamente.");
    }

    console.log("[mp-checkout] cancellation_requested", {
      subscriptionId,
      orgId: sub.org_id,
      mpPreapprovalId: sub.mp_preapproval_id,
      liveMode,
      ms: Date.now(),
    });

    return { success: true };
  });

// ---------- Server Function: getCurrentSubscription ----------
const GetCurrentInputSchema = z.object({
  orgId: z.string().uuid(),
});

export const getCurrentSubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GetCurrentInputSchema.parse(d))
  .handler(async ({ data, context }): Promise<{
    id: string;
    plan_code: string;
    state: "active" | "grace_period" | "past_due" | "canceled_by_user" | "canceled_by_dunning" | "suspended";
    current_period_start: string | null;
    current_period_end: string | null;
    cancel_requested_by_user: boolean;
    mp_preapproval_id: string | null;
  } | null> => {
    const { orgId } = data;
    const userId = context.userId!;

    const { data: membership } = await supabaseAdmin
      .from("memberships")
      .select("role")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!membership) throw new Error("Sem acesso a esta organização.");

    const { data: sub, error } = await supabaseAdmin
      .from("subscriptions")
      .select(
        "id, plan_code, state, current_period_start, current_period_end, cancel_requested_by_user, mp_preapproval_id",
      )
      .eq("org_id", orgId)
      .in("state", ["active", "grace_period", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[mp-checkout] get_subscription_error", {
        orgId,
        error: error.message,
      });
      return null;
    }

    return sub ?? null;
  });
