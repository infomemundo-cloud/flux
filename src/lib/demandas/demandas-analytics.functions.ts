import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertMember } from "@/lib/demandas/demandas-guard";

export const orgDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        assigneeId: z.string().uuid().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.orgId, context.userId);
    let q = context.supabase
      .from("demandas")
      .select("state, priority, due_at, resolved_at, created_at")
      .eq("org_id", data.orgId)
      .limit(2000);
    if (data.assigneeId === null) q = q.is("assignee_id", null);
    else if (typeof data.assigneeId === "string") q = q.eq("assignee_id", data.assigneeId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const now = Date.now();
    const counts: Record<string, number> = {
      novo: 0,
      em_analise: 0,
      aguardando_cliente: 0,
      aguardando_revisao_humana: 0,
      concluido: 0,
    };
    let overdue = 0;
    let openTotal = 0;
    const last14: Record<string, { novas: number; resolvidas: number }> = {};
    for (let i = 13; i >= 0; i--) {
      const d = new Date(now - i * 86400000);
      const k = d.toISOString().slice(0, 10);
      last14[k] = { novas: 0, resolvidas: 0 };
    }
    for (const r of rows ?? []) {
      counts[r.state] = (counts[r.state] ?? 0) + 1;
      const isOpen = r.state !== "aguardando_revisao_humana" && r.state !== "concluido";
      if (isOpen) openTotal++;
      if (isOpen && r.due_at && new Date(r.due_at).getTime() < now) overdue++;
      const created = (r.created_at as string).slice(0, 10);
      if (created in last14) last14[created].novas++;
      if (r.resolved_at) {
        const resolved = (r.resolved_at as string).slice(0, 10);
        if (resolved in last14) last14[resolved].resolvidas++;
      }
    }
    return {
      counts,
      overdue,
      openTotal,
      timeline: Object.entries(last14).map(([date, v]) => ({ date, ...v })),
      total: rows?.length ?? 0,
    };
  });

export const slaAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        staleDays: z.number().int().min(1).max(30).default(2),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.orgId, context.userId);
    const cutoff = new Date(Date.now() - data.staleDays * 86400000).toISOString();
    // Open (pending) demandas: not resolvido/fechado
    const { data: rows, error } = await context.supabase
      .from("demandas")
      .select(
        "id, protocol, title, state, priority, due_at, whatsapp_jid, created_at, updated_at, contacts:contact_id(name, phone, avatar_url), channels:channel_id(kind, name)",
      )
      .eq("org_id", data.orgId)
      .not("state", "in", "(aguardando_revisao_humana,concluido)")
      .limit(500);
    if (error) throw new Error(error.message);
    const list = rows ?? [];
    if (list.length === 0) return [];
    // Latest event per demanda
    const ids = list.map((r: any) => r.id);
    const { data: events } = await context.supabase
      .from("demanda_events")
      .select("demanda_id, created_at")
      .in("demanda_id", ids)
      .order("created_at", { ascending: false });
    const lastByDemanda = new Map<string, string>();
    for (const e of events ?? []) {
      if (!lastByDemanda.has(e.demanda_id)) lastByDemanda.set(e.demanda_id, e.created_at);
    }
    const stale = list
      .map((r: any) => {
        const last = lastByDemanda.get(r.id) ?? r.updated_at ?? r.created_at;
        return { ...r, last_activity_at: last };
      })
      .filter((r: any) => r.last_activity_at < cutoff)
      .sort((a: any, b: any) => a.last_activity_at.localeCompare(b.last_activity_at));
    return stale;
  });
