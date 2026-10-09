/**
 * Server Functions de Checkout MP (create + cancel + get).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { mpTokenFor } from "./mp-api";

const PLAN_IDS_TEST: Record<string, string> = {
  operacao: "2ae043b092704c96b1e67b4238295c43",
  crescimento: "67b0eca317cc4e00a03ba0654bd7ff64",
  escala: "5899e7efc405436995ef18cfea544747",
};

const PLAN_IDS_PROD: Record<string, string> = {
  // Preencher após seed em produção
};

function getPlanId(tierCode: string, liveMode: boolean): string | undefined {
  const map = liveMode ? PLAN_IDS_PROD : PLAN_IDS_TEST;
  return map[tierCode];
}

const CreateInputSchema = z.object({
  orgId: z.string().uuid(),
  tierCode: z.enum(["operacao", "crescimento", "escala"]),
});

const CancelInputSchema = z.object({
  subscriptionId: z.string().uuid(),
});

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
      throw new Error(`Token MP indisponível para ambiente ${liveMode ? "prod" : "test"}.`);
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
