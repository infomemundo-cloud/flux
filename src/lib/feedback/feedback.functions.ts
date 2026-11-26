import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertMember } from "@/lib/demandas/demandas-guard";
import { evaluateFlag, type FlagContext, type FlagDefinition } from "@/lib/feature-flags";

const RATE_LIMIT_WINDOW_H = 24;
const RATE_LIMIT_MAX = 3;

const feedbackInput = z.object({
  orgId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.string().max(40)).max(5).default([]),
  comment: z.string().max(1000).optional(),
  pmfScore: z
    .enum(["very_disappointed", "somewhat_disappointed", "not_disappointed"])
    .optional(),
  allowFollowup: z.boolean().default(false),
  surface: z.enum(["menu", "nudge"]).default("menu"),
  currentRoute: z.string().max(200).optional(),
});

/**
 * Submit de feedback (Fase 9.2). user_id/org_id SEMPRE do contexto/membership
 * validado — nunca do payload. Gate duplo da flag: client esconde o item,
 * servidor recusa submit com flag off (kill-switch real, sem deploy).
 */
export const submitFeedback = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => feedbackInput.parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    await assertMember(supabaseAdmin, data.orgId, userId);

    // Gate server-side da flag (9.5) — mesma precedência do motor puro.
    const { data: flag } = await supabaseAdmin
      .from("feature_flags")
      .select("id, key, description, default_state, rollout_percent, enabled_for_tags, active")
      .eq("key", "product_feedback")
      .maybeSingle();
    if (!flag) throw new Error("Feedback indisponível.");
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("tags")
      .eq("id", data.orgId)
      .maybeSingle();
    const { data: ov } = await supabaseAdmin
      .from("feature_flag_overrides")
      .select("flag_id, enabled")
      .eq("org_id", data.orgId);
    const ctx: FlagContext = {
      orgId: data.orgId,
      orgTags: Array.isArray(org?.tags) ? (org!.tags as string[]) : [],
      overridesByFlagId: Object.fromEntries((ov ?? []).map((o) => [o.flag_id, o.enabled])),
    };
    if (!evaluateFlag(flag as FlagDefinition, ctx).enabled) {
      throw new Error("Feedback indisponível.");
    }

    // Rate-limit humano: 3 envios por usuário em 24h.
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_H * 3600_000).toISOString();
    const { count } = await supabaseAdmin
      .from("product_feedbacks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .gte("created_at", windowStart);
    if ((count ?? 0) >= RATE_LIMIT_MAX) throw new Error("RATE_LIMIT_EXCEEDED");

    // Snapshot do tier pra segmentar satisfação por plano no dashboard 9.4.
    const { resolveAccountAccess } = await import("@/lib/billing/account-access");
    const access = await resolveAccountAccess(supabaseAdmin, data.orgId);

    // Minimização LGPD: rota normalizada (uuids → *), nunca identificadores.
    const normalizedRoute = data.currentRoute?.replace(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
      "*",
    );

    const { error } = await supabaseAdmin.from("product_feedbacks").insert({
      org_id: data.orgId,
      user_id: userId,
      rating: data.rating,
      tags: data.tags,
      comment: data.comment ?? null,
      pmf_score: data.pmfScore ?? null,
      allow_followup: data.allowFollowup,
      surface: data.surface,
      current_route: normalizedRoute ?? null,
      tier_code: access?.tierCode ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Memo 60s por (org, usuário) — elegibilidade não precisa de tempo real (§2.4). */
const nudgeMemo = new Map<string, { at: number; value: NudgeState }>();
interface NudgeState {
  enabled: boolean;
  eligible: boolean;
  dismissed: boolean;
  responded: boolean;
}

/**
 * Estado do nudge (9.3). "Respondido" deriva da existência de linha própria em
 * product_feedbacks (zero coluna extra); dismiss persiste em feedback_nudge_state.
 * Marcos: ≥5 demandas concluídas COMO responsável OU ≥3 dias distintos de
 * atividade em demanda_events. Supressões de acesso/onboarding ficam no client
 * (hierarquia de banners da Fase 10), aqui só elegibilidade + flag.
 */
export const getFeedbackNudgeState = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    await assertMember(supabaseAdmin, data.orgId, userId);

    const key = `${data.orgId}:${userId}`;
    const cached = nudgeMemo.get(key);
    if (cached && Date.now() - cached.at < 60_000) return cached.value;

    const { data: flag } = await supabaseAdmin
      .from("feature_flags")
      .select("id, key, description, default_state, rollout_percent, enabled_for_tags, active")
      .eq("key", "product_feedback")
      .maybeSingle();
    let enabled = false;
    if (flag) {
      const { data: org } = await supabaseAdmin
        .from("organizations")
        .select("tags")
        .eq("id", data.orgId)
        .maybeSingle();
      const { data: ov } = await supabaseAdmin
        .from("feature_flag_overrides")
        .select("flag_id, enabled")
        .eq("org_id", data.orgId);
      const ctx: FlagContext = {
        orgId: data.orgId,
        orgTags: Array.isArray(org?.tags) ? (org!.tags as string[]) : [],
        overridesByFlagId: Object.fromEntries((ov ?? []).map((o) => [o.flag_id, o.enabled])),
      };
      enabled = evaluateFlag(flag as FlagDefinition, ctx).enabled;
    }

    const { count: respondedCount } = await supabaseAdmin
      .from("product_feedbacks")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    const { data: st } = await supabaseAdmin
      .from("feedback_nudge_state")
      .select("dismissed_at")
      .eq("user_id", userId)
      .maybeSingle();
    const { count: doneCount } = await supabaseAdmin
      .from("demandas")
      .select("id", { count: "exact", head: true })
      .eq("org_id", data.orgId)
      .eq("assignee_id", userId)
      .eq("state", "concluido");

    let activeDays = 0;
    if ((doneCount ?? 0) < 5) {
      const { data: ev } = await supabaseAdmin
        .from("demanda_events")
        .select("created_at")
        .eq("org_id", data.orgId)
        .eq("actor_id", userId)
        .limit(500);
      activeDays = new Set((ev ?? []).map((e) => e.created_at.slice(0, 10))).size;
    }

    const value: NudgeState = {
      enabled,
      eligible: (doneCount ?? 0) >= 5 || activeDays >= 3,
      dismissed: !!st?.dismissed_at,
      responded: (respondedCount ?? 0) > 0,
    };
    nudgeMemo.set(key, { at: Date.now(), value });
    return value;
  });

/** Dismiss persistente (máx. 1 vez por usuário). Idempotente. */
export const dismissFeedbackNudge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("feedback_nudge_state")
      .upsert(
        { user_id: context.userId, dismissed_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
    if (error) throw new Error(error.message);
    nudgeMemo.clear();
    return { ok: true };
  });
