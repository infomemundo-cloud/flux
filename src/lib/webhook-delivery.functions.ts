import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPlatformAdmin } from "@/integrations/supabase/admin-middleware";
import { z } from "zod";

/** Memo server-side 60s pra stats (counts no dashboard). */
const STATS_MEMO_TTL_MS = 60_000;
interface StatsResult {
  total: number;
  byOutcome: Record<string, number>;
  byAction: Record<string, number>;
}
const statsMemo = new Map<string, { at: number; value: StatsResult }>();

/**
 * Lista logs de webhook cross-tenant (superadmin vê tudo).
 * Filtros: org_id, token_id, outcome, action, from/to.
 * SEM payload na listagem (só no getWebhookLogDetail) — §2 performance.
 * Paginação nativa .range() + count: exact.
 */
export const listWebhookLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid().optional(),
        tokenId: z.string().uuid().optional(),
        outcome: z.enum(["success", "rejected", "error"]).optional(),
        action: z.string().optional(),
        from: z.string().optional(),
        to: z.string().optional(),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("webhook_delivery_logs")
      .select(
        "id, created_at, token_id, org_id, outcome, action, status, latency_ms, error, demanda_id, protocol, webhook_tokens:token_id(id, name), organizations:org_id(id, name)",
        { count: "exact" },
      )
      .order("created_at", { ascending: false });

    if (data.orgId) q = q.eq("org_id", data.orgId);
    if (data.tokenId) q = q.eq("token_id", data.tokenId);
    if (data.outcome) q = q.eq("outcome", data.outcome);
    if (data.action) q = q.eq("action", data.action);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);

    const { data: rows, error, count } = await q.range(
      data.offset,
      data.offset + data.limit - 1,
    );
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

/**
 * Detalhe de uma entrega (com payload redacted).
 * Autoridade: admin OU membro da org dona do log.
 */
export const getWebhookLogDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.coerce.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("webhook_delivery_logs")
      .select("*, webhook_tokens:token_id(id, name, token), organizations:org_id(id, name)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Log não encontrado.");

    // Gate: admin OU membro da org do log.
    // Log sem org (auth_failed com token inválido): só admin pode ver,
    // pois a verificação de membership é impossível sem org_id.
    const { data: isAdmin } = await supabaseAdmin
      .from("platform_admins")
      .select("id")
      .eq("user_id", context.userId)
      .eq("active", true)
      .maybeSingle();
    if (!isAdmin) {
      if (!row.org_id) {
        throw new Error("Acesso negado: este log não está associado a nenhuma org.");
      }
      const { data: mem } = await supabaseAdmin
        .from("memberships")
        .select("id")
        .eq("user_id", context.userId)
        .eq("org_id", row.org_id)
        .maybeSingle();
      if (!mem) throw new Error("Acesso negado: você não pertence a esta org.");
    }
    return row;
  });

/**
 * Stats cross-tenant (dashboard). Memo server 60s.
 * Usa head: true pros 3 counts (custo mínimo) — §2.
 */
export const getWebhookStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.userId);
    const cached = statsMemo.get("all");
    if (cached && Date.now() - cached.at < STATS_MEMO_TTL_MS) return cached.value;

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count: total } = await supabaseAdmin
      .from("webhook_delivery_logs")
      .select("id", { count: "exact", head: true });
    const { count: success } = await supabaseAdmin
      .from("webhook_delivery_logs")
      .select("id", { count: "exact", head: true })
      .eq("outcome", "success");
    const { count: rejected } = await supabaseAdmin
      .from("webhook_delivery_logs")
      .select("id", { count: "exact", head: true })
      .eq("outcome", "rejected");
    const { count: errored } = await supabaseAdmin
      .from("webhook_delivery_logs")
      .select("id", { count: "exact", head: true })
      .eq("outcome", "error");

    const value: StatsResult = {
      total: total ?? 0,
      byOutcome: {
        success: success ?? 0,
        rejected: rejected ?? 0,
        error: errored ?? 0,
      },
      byAction: {},
    };
    statsMemo.set("all", { at: Date.now(), value });
    return value;
  });

/**
 * Picker de orgs/tokens pra filtros (limit 50, batch sem N+1).
 */
export const listWebhookFilterOptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: orgs } = await supabaseAdmin
      .from("organizations")
      .select("id, name")
      .order("name")
      .limit(200);
    const { data: tokens } = await supabaseAdmin
      .from("webhook_tokens")
      .select("id, name, org_id, organizations:org_id(name)")
      .order("name")
      .limit(200);
    return {
      orgs: (orgs ?? []).map((o) => ({ id: o.id, name: o.name })),
      tokens: (tokens ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        org_id: t.org_id,
        org_name: (t as any).organizations?.name ?? "—",
      })),
    };
  });
