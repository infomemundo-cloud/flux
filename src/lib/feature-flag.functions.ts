import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPlatformAdmin } from "@/integrations/supabase/admin-middleware";
import { adminAction, assertRole, ROLE_ACTIONS } from "@/lib/platform-admin.functions";
import {
  evaluateAllFlags,
  type FlagContext,
  type FlagDefinition,
  type FlagRule,
} from "@/lib/feature-flags";
import { z } from "zod";

/** Slug de flag: minúsculas/números/underscore (ex.: demandas_ia). */
const FLAG_KEY_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;

/** Memo server-side 60s por org: blinda o Postgres do hot-path de avaliação.
 *  Propagação cross-instance é por TTL (documentado como SLA da fase). */
const EVAL_MEMO_TTL_MS = 60_000;
interface EvalResult {
  orgName: string | null;
  flags: { id: string; key: string; enabled: boolean; rule: FlagRule }[];
}
const evalMemo = new Map<string, { at: number; value: EvalResult }>();

const flagInput = z.object({
  key: z.string().regex(FLAG_KEY_RE, "key: minúsculas, números e _ (ex.: demandas_ia)"),
  description: z.string().max(280).default(""),
  default_state: z.boolean().default(false),
  rollout_percent: z.number().int().min(0).max(100).default(0),
  enabled_for_tags: z.array(z.string()).default([]),
});

/**
 * Lista flags + overrides (com nome da org) pro portal. Qualquer admin lê;
 * overrides vêm em 1 query com embed de organizations (sem N+1).
 */
export const listFeatureFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: flags, error } = await supabaseAdmin
      .from("feature_flags")
      .select(
        "id, key, description, default_state, rollout_percent, enabled_for_tags, active, created_at, updated_at",
      )
      .order("key", { ascending: true });
    if (error) throw new Error(error.message);
    const { data: overrides, error: oErr } = await supabaseAdmin
      .from("feature_flag_overrides")
      .select("id, flag_id, org_id, enabled, organizations:org_id(id, name)")
      .order("created_at", { ascending: false })
      .limit(500);
    if (oErr) throw new Error(oErr.message);
    return { flags: flags ?? [], overrides: overrides ?? [] };
  });

/** Cria flag. Gate: superadmin. Auditado. */
export const createFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => flagInput.parse(d))
  .handler(async ({ data, context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    assertRole(adminRole, [...ROLE_ACTIONS.flagManagement], "criar feature flags");
    return adminAction({
      context: { userId: context.userId, adminRole },
      action: "feature_flag_created",
      targetType: "feature_flag",
      targetId: null,
      metadata: { key: data.key, default_state: data.default_state, rollout: data.rollout_percent },
      run: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row, error } = await supabaseAdmin
          .from("feature_flags")
          .insert({
            key: data.key,
            description: data.description,
            default_state: data.default_state,
            rollout_percent: data.rollout_percent,
            enabled_for_tags: data.enabled_for_tags,
            created_by: context.userId,
          })
          .select()
          .single();
        if (error) {
          if (error.code === "23505") throw new Error(`Flag "${data.key}" já existe.`);
          throw new Error(error.message);
        }
        return row;
      },
    });
  });

/** Atualiza flag (inclui kill-switch). Gate: superadmin. Auditado. */
export const updateFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    flagInput.partial().extend({ id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    assertRole(adminRole, [...ROLE_ACTIONS.flagManagement], "editar feature flags");
    return adminAction({
      context: { userId: context.userId, adminRole },
      action: "feature_flag_updated",
      targetType: "feature_flag",
      targetId: data.id,
      metadata: { ...data },
      run: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { id, ...patch } = data;
        const { data: row, error } = await supabaseAdmin
          .from("feature_flags")
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq("id", id)
          .select()
          .single();
        if (error) throw new Error(error.message);
        return row;
      },
    });
  });

/** Exclui flag (overrides cascateiam). Gate: superadmin. Auditado. */
export const deleteFeatureFlag = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    assertRole(adminRole, [...ROLE_ACTIONS.flagManagement], "excluir feature flags");
    return adminAction({
      context: { userId: context.userId, adminRole },
      action: "feature_flag_deleted",
      targetType: "feature_flag",
      targetId: data.id,
      metadata: {},
      run: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.from("feature_flags").delete().eq("id", data.id);
        if (error) throw new Error(error.message);
        return { ok: true };
      },
    });
  });

/** Upsert de override por tenant. Gate: superadmin. Auditado. */
export const upsertFlagOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ flagId: z.string().uuid(), orgId: z.string().uuid(), enabled: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    assertRole(adminRole, [...ROLE_ACTIONS.flagManagement], "gerenciar overrides de flags");
    return adminAction({
      context: { userId: context.userId, adminRole },
      action: "feature_flag_override_set",
      targetType: "feature_flag_override",
      targetId: data.flagId,
      metadata: { org_id: data.orgId, enabled: data.enabled },
      run: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: row, error } = await supabaseAdmin
          .from("feature_flag_overrides")
          .upsert(
            { flag_id: data.flagId, org_id: data.orgId, enabled: data.enabled, created_by: context.userId },
            { onConflict: "flag_id,org_id" },
          )
          .select("id, flag_id, org_id, enabled, organizations:org_id(id, name)")
          .single();
        if (error) throw new Error(error.message);
        return row;
      },
    });
  });

/** Remove override. Gate: superadmin. Auditado. */
export const deleteFlagOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    assertRole(adminRole, [...ROLE_ACTIONS.flagManagement], "gerenciar overrides de flags");
    return adminAction({
      context: { userId: context.userId, adminRole },
      action: "feature_flag_override_removed",
      targetType: "feature_flag_override",
      targetId: data.id,
      metadata: {},
      run: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("feature_flag_overrides")
          .delete()
          .eq("id", data.id);
        if (error) throw new Error(error.message);
        return { ok: true };
      },
    });
  });

/** Busca de orgs (simulador + picker de overrides): 1 query, limit 20. */
export const searchOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ search: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin.from("organizations").select("id, name, tags").order("name");
    if (data.search) q = q.ilike("name", `%${data.search.toLowerCase()}%`);
    const { data: rows, error } = await q.limit(20);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Avaliação de flags pra um tenant (consumo do produto + simulador).
 * Gate: platform admin OU membro da org. Memo server-side 60s por org.
 */
export const evaluateFeatureFlags = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Autoridade: admin da plataforma OU membro da org alvo.
    const { data: isAdmin } = await supabaseAdmin
      .from("platform_admins")
      .select("id")
      .eq("user_id", context.userId)
      .eq("active", true)
      .maybeSingle();
    if (!isAdmin) {
      const { data: mem } = await supabaseAdmin
        .from("memberships")
        .select("id")
        .eq("user_id", context.userId)
        .eq("org_id", data.orgId)
        .maybeSingle();
      if (!mem) throw new Error("Acesso negado: você não pertence a esta org.");
    }

    const cached = evalMemo.get(data.orgId);
    if (cached && Date.now() - cached.at < EVAL_MEMO_TTL_MS) return cached.value;

    const { data: org, error: orgErr } = await supabaseAdmin
      .from("organizations")
      .select("id, name, tags")
      .eq("id", data.orgId)
      .maybeSingle();
    if (orgErr) throw new Error(orgErr.message);
    if (!org) throw new Error("Org não encontrada.");

    const { data: flags, error: fErr } = await supabaseAdmin.from("feature_flags").select("*");
    if (fErr) throw new Error(fErr.message);
    const { data: overrides, error: oErr } = await supabaseAdmin
      .from("feature_flag_overrides")
      .select("flag_id, enabled")
      .eq("org_id", data.orgId);
    if (oErr) throw new Error(oErr.message);

    const ctx: FlagContext = {
      orgId: data.orgId,
      orgTags: Array.isArray(org.tags) ? (org.tags as string[]) : [],
      overridesByFlagId: Object.fromEntries((overrides ?? []).map((o) => [o.flag_id, o.enabled])),
    };
    const evals = evaluateAllFlags((flags ?? []) as FlagDefinition[], ctx);
    const value: EvalResult = {
      orgName: org.name,
      flags: evals.map((e) => ({ id: e.id, key: e.key, enabled: e.enabled, rule: e.rule })),
    };
    evalMemo.set(data.orgId, { at: Date.now(), value });
    return value;
  });
