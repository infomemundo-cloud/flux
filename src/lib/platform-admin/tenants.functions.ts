import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPlatformAdmin } from "@/integrations/supabase/admin-middleware";
import { adminAction } from "@/lib/platform-admin.functions";
import { resolveAccountAccess } from "@/lib/billing/account-access";
import { getTierFeatures } from "@/lib/billing/tier-contracts"; // 👈 NOVO IMPORT
import { cancelPreapproval } from "@/lib/billing/mp-api"; // 👈 DT-09 Parte 3 (force-cancel)
import { z } from "zod";

/**
 * Fase 3.5 — gestão de tenants do portal platform_admin (DT-10).
 *
 * D8: leitura pra qualquer papel admin; escrita superadmin-only no MVP.
 * Matriz local no padrão dos ADMIN_ROLES/TIER_WRITE_ROLES; migra pra
 * ROLE_ACTIONS quando a Fase 4 criar ações de billing.
 *
 * DRY (§1): `effective_state` vem do MESMO `resolveAccountAccess` usado
 * pelo banner, ingest e sends — uma fonte única de verdade pra estados
 * de conta em toda a plataforma.
 */
const TENANT_WRITE_ROLES = ["superadmin"];

export type TenantRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  trial_ends_at: string | null;
  effective_state: "trial" | "grace" | "suspended" | "active";
  days_left: number | null;
  member_count: number;
  open_demands: number;
  /** Receita realizada: SUM(invoices.amount_cents) status=paid nos últimos 30d (D-2). */
  realized_l30d_cents: number;
  /** MRR projetado: tiers.price_cents da subscription viva (banco = fonte; D-2). */
  mrr_projected_cents: number;
};

/** Memo server-side 60s: lista de tenants muda raro, leitura quente. */
const TENANTS_MEMO_TTL_MS = 60_000;
let tenantsMemo: { at: number; value: TenantRow[] } | null = null;

export const listTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.userId);
    if (tenantsMemo && Date.now() - tenantsMemo.at < TENANTS_MEMO_TTL_MS) return tenantsMemo.value;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Orgs base
    const { data: orgs, error: orgsErr } = await supabaseAdmin
      .from("organizations")
      .select("id, name, slug, created_at, trial_ends_at")
      .order("created_at", { ascending: false });
    if (orgsErr) throw new Error(orgsErr.message);
    const orgList = (orgs ?? []) as {
      id: string;
      name: string;
      slug: string;
      created_at: string;
      trial_ends_at: string | null;
    }[];
    if (orgList.length === 0) return [];
    const ids = orgList.map((o) => o.id);

    // 2) Contagens em batch (zero N+1)
    const memberByOrg = new Map<string, number>();
    const demandByOrg = new Map<string, number>();
    const realizedByOrg = new Map<string, number>();
    const mrrByOrg = new Map<string, number>();
    const cutoff30d = new Date(Date.now() - 30 * 86_400_000).toISOString();
    // Re-faz as queries sem count, buscando só o campo de agrupamento,
    // e conta em memória. Mais barato que RPC e funciona pra ~milhares.
    // 5 queries em paralelo (mesmo padrão batch+reduce; tiers é fixo ~4 linhas).
    const [
      { data: memRows },
      { data: demRows },
      { data: invRows },
      { data: subRows },
      { data: tierRows },
    ] = await Promise.all([
      supabaseAdmin.from("memberships").select("org_id").in("org_id", ids),
      supabaseAdmin
        .from("demandas")
        .select("org_id")
        .in("org_id", ids)
        .neq("state", "concluido"),
      supabaseAdmin
        .from("invoices")
        .select("org_id, amount_cents")
        .eq("status", "paid")
        .gte("paid_at", cutoff30d)
        .in("org_id", ids),
      supabaseAdmin
        .from("subscriptions")
        .select("org_id, plan_code")
        .in("state", ["active", "grace_period", "past_due"])
        .in("org_id", ids),
      supabaseAdmin.from("tiers").select("code, price_cents"),
    ]);
    for (const r of (memRows ?? []) as { org_id: string }[]) {
      memberByOrg.set(r.org_id, (memberByOrg.get(r.org_id) ?? 0) + 1);
    }
    for (const r of (demRows ?? []) as { org_id: string }[]) {
      demandByOrg.set(r.org_id, (demandByOrg.get(r.org_id) ?? 0) + 1);
    }
    // Receita realizada (L30D): soma amount_cents das invoices paid na janela.
    for (const r of (invRows ?? []) as { org_id: string; amount_cents: number }[]) {
      realizedByOrg.set(r.org_id, (realizedByOrg.get(r.org_id) ?? 0) + (r.amount_cents ?? 0));
    }
    // MRR projetado: price_cents do banco casado com plan_code da sub viva.
    // subscriptions_org_active_uq garante 1 viva/org; último vence se houver
    // anomalia (defensivo, não esperado). Org sem sub viva fica ausente → 0.
    const priceByTier = new Map<string, number>();
    for (const t of (tierRows ?? []) as { code: string; price_cents: number }[]) {
      priceByTier.set(t.code, t.price_cents);
    }
    for (const r of (subRows ?? []) as { org_id: string; plan_code: string }[]) {
      mrrByOrg.set(r.org_id, priceByTier.get(r.plan_code) ?? 0);
    }

    // 3) Estado efetivo via MESMO helper do banner/ingest/sends (DRY).
    //    Chamadas em paralelo; memo interno do helper (60s/org) garante
    //    que ingest e admin compartilham a mesma leitura.
    const accessByOrg = new Map<string, Awaited<ReturnType<typeof resolveAccountAccess>>>();
    await Promise.all(
      orgList.map(async (o) => {
        try {
          accessByOrg.set(o.id, await resolveAccountAccess(supabaseAdmin, o.id));
        } catch (e) {
          // Fallback defensivo: se o helper falhar (org sem dados, p.ex.),
          // tratamos como active pra não quebrar a listagem.
          // ✅ CORREÇÃO TS2345: Adicionados tierCode e features obrigatórios
          accessByOrg.set(o.id, {
            access_level: "full",
            effective_state: "active",
            days_left: null,
            trial_ends_at: null,
            tierCode: "operacao",
            features: getTierFeatures("operacao"),
          });
        }
      }),
    );

    const value: TenantRow[] = orgList.map((o) => {
      const access = accessByOrg.get(o.id)!;
      return {
        id: o.id,
        name: o.name,
        slug: o.slug,
        created_at: o.created_at,
        trial_ends_at: o.trial_ends_at,
        effective_state: access.effective_state,
        days_left: access.days_left ?? null,
        member_count: memberByOrg.get(o.id) ?? 0,
        open_demands: demandByOrg.get(o.id) ?? 0,
        realized_l30d_cents: realizedByOrg.get(o.id) ?? 0,
        mrr_projected_cents: mrrByOrg.get(o.id) ?? 0,
      };
    });
    tenantsMemo = { at: Date.now(), value };
    return value;
  });

export const TenantActionSchema = z.enum([
  "extend_7d",
  "extend_30d",
  "reactivate",
  "grandfather",
  "suspend",
]);
export type TenantAction = z.infer<typeof TenantActionSchema>;

/**
 * Calcula o novo trial_ends_at a partir da ação escolhida.
 * grandfather = NULL (MK e similares, isentas de ciclo).
 * suspend = passado distante o suficiente pra cair em blocked (≥15d).
 * extend/reactivate = now() + delta.
 */
function computeNewTrial(
  action: TenantAction,
  current: string | null,
): string | null {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  switch (action) {
    case "grandfather":
      return null;
    case "suspend":
      return new Date(now - 15 * DAY).toISOString();
    case "reactivate":
      return new Date(now + 7 * DAY).toISOString();
    case "extend_7d": {
      // Empilha sobre trial VIVO; expirada/suspensa ganha dias a partir de
      // HOJE (extend que parece no-op é defeito — caso real 2026-10-06:
      // extend_7d com from_state=suspended manteve a org suspensa).
      const base = Math.max(now, current ? new Date(current).getTime() : now);
      return new Date(base + 7 * DAY).toISOString();
    }
    case "extend_30d": {
      const base = Math.max(now, current ? new Date(current).getTime() : now);
      return new Date(base + 30 * DAY).toISOString();
    }
  }
}

const ACTION_LABEL: Record<TenantAction, string> = {
  extend_7d: "estendeu trial em +7d",
  extend_30d: "estendeu trial em +30d",
  reactivate: "reativou (trial +7d)",
  grandfather: "marcou como grandfather (NULL)",
  suspend: "suspendeu",
};

export const setTenantTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        action: TenantActionSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    if (!TENANT_WRITE_ROLES.includes(adminRole))
      throw new Error("Apenas superadmin pode alterar o ciclo de vida do tenant.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Resolve estado atual ANTES de aplicar (pra gravar no metadata).
    const currentAccess = await resolveAccountAccess(supabaseAdmin, data.orgId);
    const { data: orgRow, error: fetchErr } = await supabaseAdmin
      .from("organizations")
      .select("trial_ends_at")
      .eq("id", data.orgId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!orgRow) throw new Error("Organização não encontrada.");
    const newTrial = computeNewTrial(data.action, orgRow.trial_ends_at);
    return adminAction({
      context: { userId: context.userId, adminRole },
      action: "trial_updated",
      targetType: "organization",
      targetId: data.orgId,
      metadata: {
        action: data.action,
        label: ACTION_LABEL[data.action],
        from_state: currentAccess.effective_state,
        from_trial_ends_at: orgRow.trial_ends_at,
        to_trial_ends_at: newTrial,
      },
      run: async () => {
        const { error } = await supabaseAdmin
          .from("organizations")
          .update({
            trial_ends_at: newTrial,
            // organizations TEM trigger trg_orgs_upd → updated_at automático
            // (dicionário do banco), não precisamos gravar na mão.
          } as never)
          .eq("id", data.orgId);
        if (error) throw new Error(error.message);
        tenantsMemo = null; // invalida memo: próxima listagem vê o estado novo
        return {
          ok: true,
          orgId: data.orgId,
          action: data.action,
          new_trial_ends_at: newTrial,
        };
      },
    });
  });


/**
 * Resolve liveMode para chamadas MP outbound do admin (force-cancel).
 * HEURÍSTICA DE AMBIENTE: produção (NODE_ENV=production → token APP_USR) =
 * live=true; dev/sandbox (token TEST) = live=false. subscriptions NÃO tem
 * coluna live_mode (dicionário), então a fonte é o ambiente do deploy — mesmo
 * princípio de mpTokenFor (fallback MP_ACCESS_TOKEN).
 * ⚠️ ALINHAR: confirmar contra a resolução de liveMode usada por
 * cancelSubscription (mp-checkout.functions.ts). O force-cancel DEVE espelhá-la
 * (DRY §1). Se cancelSubscription usar env dedicada (ex.: MP_LIVE_MODE), trocar
 * aqui — é 1 linha.
 */
function resolveMpLiveMode(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Fase 4.9 Parte 2.A / D-3 — Forçar cancelamento de assinatura (superadmin).
 * MP-PRIMEIRO: cancela o preapproval no MP ANTES de tocar local. Como
 * cancelPreapproval nunca retorna ok:false (ou resolve ok / 404-idempotente,
 * ou throw MpApiError), um throw propaga pro admin SEM alterar local —
 * impossível ficar "cancelado local mas vivo no MP" (cobrança fantasma).
 * Estado gravado: canceled_by_dunning + cancel_requested_by_user=false —
 * mesmo shape do cancelamento externo/dunning (D17). A distinção
 * admin-vs-dunning-automático vive no admin_audit_log (D8, fonte forense),
 * não no enum → zero migration. A view org_access_effective mapeia estados
 * não-vivos → blocked (bloqueio instantâneo; webhook pós-cancel reafirma o
 * mesmo valor, idempotente, guard "histórica não reativa" impede regressão).
 */
export const forceCancelSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        reason: z.string().min(3).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    if (!TENANT_WRITE_ROLES.includes(adminRole))
      throw new Error("Apenas superadmin pode forçar cancelamento.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Resolve a subscription VIVA da org (fonte do preapproval a cancelar).
    const { data: sub, error: subErr } = await supabaseAdmin
      .from("subscriptions")
      .select("id, plan_code, state, mp_preapproval_id")
      .eq("org_id", data.orgId)
      .in("state", ["active", "grace_period", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subErr) throw new Error(subErr.message);
    if (!sub) throw new Error("Sem assinatura viva para cancelar.");
    if (!sub.mp_preapproval_id)
      throw new Error("Assinatura sem preapproval MP vinculado (não cancelável via MP).");

    // MP-PRIMEIRO (D-3): sem try/catch — throw MpApiError aborta antes do local.
    await cancelPreapproval({
      preapprovalId: sub.mp_preapproval_id,
      liveMode: resolveMpLiveMode(),
    });

    return adminAction({
      context: { userId: context.userId, adminRole },
      action: "subscription_force_canceled",
      targetType: "organization",
      targetId: data.orgId,
      metadata: {
        reason: data.reason,
        subscription_id: sub.id,
        plan_code: sub.plan_code,
        mp_preapproval_id: sub.mp_preapproval_id,
        from_state: sub.state,
        to_state: "canceled_by_dunning",
      },
      run: async () => {
        const { error } = await supabaseAdmin
          .from("subscriptions")
          .update(
            {
              state: "canceled_by_dunning",
              cancel_requested_by_user: false,
            } as never,
          )
          .eq("id", sub.id);
        if (error) throw new Error(error.message);
        tenantsMemo = null; // próxima listagem vê blocked + MRR zerado
        return {
          ok: true,
          orgId: data.orgId,
          subscriptionId: sub.id,
          state: "canceled_by_dunning",
        };
      },
    });
  });

/**
 * Fase 4.9 Parte 2.A / D-1 — Ajustar tier manual (override de acesso, superadmin).
 * NÃO reusa billing_complete_tier_switch: a RPC exige p_new_mp_preapproval_id
 * NOT NULL (guard new_preapproval_id_required) e preapproval novo real só nasce
 * via checkout do pagador. Override "sem checkout" não tem o que passar. Então
 * é update LOCAL de subscriptions.plan_code + audit.
 * CUSTO SEMÂNTICO REGISTRADO (obrigatório na UI): mudar plan_code local NÃO
 * muda a cobrança no MP — o MP segue cobrando o tier antigo até a próxima
 * reconciliação/checkout. Por isso o retorno carrega mp_divergence_warning e o
 * metadata grava from/to pra rastreabilidade forense (D8). Use para CORRIGIR
 * ESTADO TRAVADO, não para troca comercial (essa é checkout).
 * Exige subscription viva: sem ela, "ajuste de tier" é troca comercial via
 * checkout, não override (mensagem orienta o admin).
 */
export const overrideTenantTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        toTierCode: z.string().min(1),
        reason: z.string().min(3).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    if (!TENANT_WRITE_ROLES.includes(adminRole))
      throw new Error("Apenas superadmin pode ajustar tier manualmente.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Tier alvo precisa existir no banco (fonte de verdade; updateTier edita).
    const { data: targetTier, error: tierErr } = await supabaseAdmin
      .from("tiers")
      .select("code")
      .eq("code", data.toTierCode)
      .maybeSingle();
    if (tierErr) throw new Error(tierErr.message);
    if (!targetTier) throw new Error("Tier alvo inexistente.");

    // Override só faz sentido com assinatura viva.
    const { data: sub, error: subErr } = await supabaseAdmin
      .from("subscriptions")
      .select("id, plan_code, state")
      .eq("org_id", data.orgId)
      .in("state", ["active", "grace_period", "past_due"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subErr) throw new Error(subErr.message);
    if (!sub)
      throw new Error("Sem assinatura viva; use o checkout do tenant para troca comercial.");
    if (sub.plan_code === data.toTierCode)
      throw new Error("Tier alvo igual ao atual.");

    const fromTierCode = sub.plan_code;
    return adminAction({
      context: { userId: context.userId, adminRole },
      action: "tier_manual_override",
      targetType: "organization",
      targetId: data.orgId,
      metadata: {
        reason: data.reason,
        subscription_id: sub.id,
        from_tier_code: fromTierCode,
        to_tier_code: data.toTierCode,
        mp_divergence_warning:
          "Cobrança no MP permanece no tier antigo até próxima reconciliação/checkout.",
      },
      run: async () => {
        const { error } = await supabaseAdmin
          .from("subscriptions")
          .update({ plan_code: data.toTierCode } as never)
          .eq("id", sub.id);
        if (error) throw new Error(error.message);
        tenantsMemo = null; // MRR projetado reflete o novo tier na próxima listagem
        return {
          ok: true,
          orgId: data.orgId,
          subscriptionId: sub.id,
          from_tier_code: fromTierCode,
          to_tier_code: data.toTierCode,
          mp_divergence_warning:
            "Override local aplicado. A cobrança no MP permanece no tier antigo até a próxima reconciliação. Use para correção de estado, não para troca comercial.",
        };
      },
    });
  });
