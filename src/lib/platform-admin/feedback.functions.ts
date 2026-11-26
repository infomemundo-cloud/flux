import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPlatformAdmin } from "@/integrations/supabase/admin-middleware";
import { adminAction, assertRole, ROLE_ACTIONS } from "@/lib/platform-admin.functions";

const PMF_VALUES = ["very_disappointed", "somewhat_disappointed", "not_disappointed"] as const;

const listInput = z.object({
  rating: z.number().int().min(1).max(5).optional(),
  pmf: z.enum(PMF_VALUES).optional(),
  followup: z.enum(["all", "pending", "done"]).default("all"),
  orgId: z.string().uuid().optional(),
  offset: z.number().int().min(0).default(0),
  limit: z.number().int().min(1).max(100).default(20),
});

/**
 * Lista cross-tenant de feedbacks (9.4). Filtros nota/pmf/follow-up/org +
 * paginação nativa .range() + count exact. Identidade do autor em batch
 * (profiles), sem N+1 — product_feedbacks.user_id aponta pra auth.users,
 * então embed direto de profiles não existe; batch é o caminho certo.
 */
export const listProductFeedbacks = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listInput.parse(d))
  .handler(async ({ data, context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    assertRole(adminRole, [...ROLE_ACTIONS.feedbackRead], "ler feedbacks de produto");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("product_feedbacks")
      .select(
        "id, org_id, user_id, rating, tags, comment, pmf_score, allow_followup, surface, current_route, tier_code, followed_up_at, created_at, organizations:org_id(name)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });
    if (data.rating) q = q.eq("rating", data.rating);
    if (data.pmf) q = q.eq("pmf_score", data.pmf);
    if (data.orgId) q = q.eq("org_id", data.orgId);
    if (data.followup === "pending") q = q.eq("allow_followup", true).is("followed_up_at", null);
    if (data.followup === "done") q = q.not("followed_up_at", "is", null);
    const { data: rows, error, count } = await q.range(data.offset, data.offset + data.limit - 1);
    if (error) throw new Error(error.message);

    const userIds = [...new Set((rows ?? []).map((r) => r.user_id).filter(Boolean))] as string[];
    const profileMap = new Map<string, { email: string; name: string | null }>();
    if (userIds.length > 0) {
      const { data: profiles } = await supabaseAdmin
        .from("profiles")
        .select("id, email, full_name")
        .in("id", userIds);
      for (const p of profiles ?? []) profileMap.set(p.id, { email: p.email, name: p.full_name });
    }
    return {
      rows: (rows ?? []).map((r) => ({
        ...r,
        org_name: (r.organizations as { name?: string } | null)?.name ?? "Org removida",
        user_email: profileMap.get(r.user_id ?? "")?.email ?? null,
        user_name: profileMap.get(r.user_id ?? "")?.name ?? null,
      })),
      total: count ?? 0,
    };
  });

/**
 * Métricas do dashboard (9.4): média, distribuição 1–5, % PMF vs meta 40%,
 * fila de follow-ups. Agregação em memória sobre 4 colunas (volume atual de
 * testers); cap 5000 com flag `capped` — gatilho de escala: migrar pra head
 * counts/SQL aggregate quando total passar de ~5k feedbacks.
 */
export const getFeedbackStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    assertRole(adminRole, [...ROLE_ACTIONS.feedbackRead], "ler métricas de feedback");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("product_feedbacks")
      .select("rating, pmf_score, allow_followup, followed_up_at")
      .limit(5000);
    if (error) throw new Error(error.message);
    const all = rows ?? [];
    const total = all.length;
    const distribution = [1, 2, 3, 4, 5].map((n) => all.filter((r) => r.rating === n).length);
    const sum = all.reduce((acc, r) => acc + (r.rating ?? 0), 0);
    const pmfAnswered = all.filter((r) => !!r.pmf_score);
    const pmfHit = pmfAnswered.filter((r) => r.pmf_score === "not_disappointed").length;
    return {
      total,
      average: total ? Math.round((sum / total) * 10) / 10 : null,
      distribution,
      pmfAnswered: pmfAnswered.length,
      pmfPct: pmfAnswered.length ? Math.round((pmfHit / pmfAnswered.length) * 100) : null,
      pmfTarget: 40,
      followupPending: all.filter((r) => r.allow_followup && !r.followed_up_at).length,
      capped: total >= 5000,
    };
  });

/** Badge da sidebar: head count no índice parcial de follow-ups (9.1). */
export const countPendingFollowups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    assertRole(adminRole, [...ROLE_ACTIONS.feedbackRead], "contar follow-ups de feedback");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error } = await supabaseAdmin
      .from("product_feedbacks")
      .select("id", { count: "exact", head: true })
      .eq("allow_followup", true)
      .is("followed_up_at", null);
    if (error) throw new Error(error.message);
    return count ?? 0;
  });

/**
 * Fecha o loop do opt-in (9.4): grava followed_up_at SOMENTE se ainda null e
 * com allow_followup=true (idempotência por predicado, não por read-modify).
 * Auditado via adminAction (outcome ok/error sempre).
 */
export const markFeedbackFollowedUp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    assertRole(adminRole, [...ROLE_ACTIONS.feedbackFollowup], "encerrar follow-up de feedback");
    return adminAction({
      context: { userId: context.userId, adminRole },
      action: "feedback_followup_closed",
      targetType: "product_feedback",
      targetId: data.id,
      metadata: {},
      run: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row, error } = await supabaseAdmin
          .from("product_feedbacks")
          .update({ followed_up_at: new Date().toISOString() })
          .eq("id", data.id)
          .eq("allow_followup", true)
          .is("followed_up_at", null)
          .select("id")
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!row) throw new Error("Feedback não encontrado, sem opt-in ou já encerrado.");
        return { ok: true };
      },
    });
  });
