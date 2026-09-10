import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const StateEnum = z.enum([
  "novo",
  "em_analise",
  "aguardando_cliente",
  "aguardando_revisao_humana",
  "concluido",
]);
const PriorityEnum = z.enum(["baixa", "media", "alta", "urgente"]);

const OP_ROLES = ["owner", "admin", "gerente", "operador", "agente_ia"] as const;

async function assertMember(supabase: any, orgId: string, userId: string) {
  const { data } = await supabase
    .from("memberships")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) throw new Error("Sem acesso à organização");
  return data.role as string;
}

export const listDemandas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        state: StateEnum.optional(),
        assignedToMe: z.boolean().optional(),
        assigneeId: z.string().uuid().nullable().optional(),
        search: z.string().optional(),
        // Paginação: offset/limit com defaults seguros. limit tem teto de 100
        // pra impedir que alguém peça um lote gigante direto na chamada.
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.orgId, context.userId);
    let q = context.supabase
      .from("demandas")
      .select(
        "id, protocol, title, state, priority, due_at, assignee_id, contact_id, created_at, updated_at, contacts:contact_id(name, phone), channels:channel_id(kind, name)",
        { count: "exact" },
      )
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (data.state) q = q.eq("state", data.state);
    if (data.assignedToMe) q = q.eq("assignee_id", context.userId);
    if (data.assigneeId === null) q = q.is("assignee_id", null);
    else if (typeof data.assigneeId === "string") q = q.eq("assignee_id", data.assigneeId);
    if (data.search) q = q.ilike("title", `%${data.search}%`);
    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);

    // Resolve nomes dos responsáveis em batch
    const assignees: Record<string, { id: string; name: string }> = {};
    const assigneeIds = [
      ...new Set((rows ?? []).map((r: any) => r.assignee_id).filter(Boolean) as string[]),
    ];
    if (assigneeIds.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await Promise.all(
        assigneeIds.map(async (uid) => {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
          const meta = (u.user?.user_metadata ?? {}) as Record<string, unknown>;
          const email = u.user?.email ?? null;
          const name =
            (typeof meta.full_name === "string" && meta.full_name) ||
            (typeof meta.name === "string" && meta.name) ||
            (email ? email.split("@")[0] : `Usuário ${uid.slice(0, 6)}`);
          assignees[uid] = { id: uid, name: name as string };
        }),
      );
    }

    // total = contagem real no banco (respeitando os filtros aplicados), não rows.length.
    // offset/limit voltam no payload pra a UI saber se ainda há mais páginas
    // (offset + rows.length < total) sem precisar recalcular nada.
    return { rows: rows ?? [], assignees, total: count ?? 0, offset: data.offset, limit: data.limit };
  });

export const getDemanda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: dem, error } = await context.supabase
      .from("demandas")
      .select("*, contacts:contact_id(id, name, phone, email), channels:channel_id(id, kind, name)")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!dem) throw new Error("Demanda não encontrada");
    const { data: events } = await context.supabase
      .from("demanda_events")
      .select("*")
      .eq("demanda_id", data.id)
      .order("created_at");

    // Identidade dos personagens: quem criou, mudou status, comentou e é responsável.
    const ids = new Set<string>();
    if (dem.created_by) ids.add(dem.created_by as string);
    if (dem.assignee_id) ids.add(dem.assignee_id as string);
    for (const e of events ?? []) {
      if (e.actor_id) ids.add(e.actor_id as string);
      if (e.kind === "assigned") {
        if (e.from_value) ids.add(e.from_value as string);
        if (e.to_value) ids.add(e.to_value as string);
      }
    }
    const actors: Record<
      string,
      { id: string; name: string; email: string | null; role: string | null }
    > = {};
    if (ids.size) {
      const idList = [...ids];
      const { data: mems } = await context.supabase
        .from("memberships")
        .select("user_id, role")
        .eq("org_id", dem.org_id)
        .in("user_id", idList);
      const roleById = new Map((mems ?? []).map((m: any) => [m.user_id, m.role as string]));
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      await Promise.all(
        idList.map(async (uid) => {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
          const meta = (u.user?.user_metadata ?? {}) as Record<string, unknown>;
          const email = u.user?.email ?? null;
          const name =
            (typeof meta.full_name === "string" && meta.full_name) ||
            (typeof meta.name === "string" && meta.name) ||
            (email ? email.split("@")[0] : `Usuário ${uid.slice(0, 6)}`);
          actors[uid] = { id: uid, name: name as string, email, role: roleById.get(uid) ?? null };
        }),
      );
    }
    return { demanda: dem, events: events ?? [], actors, viewerId: context.userId };
  });

export const createDemanda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        title: z
          .string({ required_error: "Informe um título para a demanda." })
          .trim()
          .min(3, { message: "O título precisa ter pelo menos 3 caracteres." })
          .max(200, { message: "O título pode ter no máximo 200 caracteres." }),
        description: z
          .string()
          .max(5000, { message: "A descrição pode ter no máximo 5000 caracteres." })
          .optional(),
        priority: PriorityEnum.default("media"),
        due_at: z.string().datetime().optional(),
        contact_name: z
          .string()
          .max(120, { message: "O nome do contato pode ter no máximo 120 caracteres." })
          .optional(),
        contact_phone: z
          .string()
          .max(40, { message: "O telefone pode ter no máximo 40 caracteres." })
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const role = await assertMember(context.supabase, data.orgId, context.userId);
    if (!OP_ROLES.includes(role as (typeof OP_ROLES)[number]))
      throw new Error("Sem permissão para criar");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let contactId: string | null = null;
    if (data.contact_name || data.contact_phone) {
      const { data: c, error: ce } = await supabaseAdmin
        .from("contacts")
        .insert({
          org_id: data.orgId,
          name: data.contact_name ?? null,
          phone: data.contact_phone ?? null,
        })
        .select("id")
        .single();
      if (ce) throw new Error(ce.message);
      contactId = c.id;
    }
    const { data: dem, error } = await supabaseAdmin
      .from("demandas")
      .insert({
        org_id: data.orgId,
        title: data.title,
        description: data.description ?? null,
        priority: data.priority,
        due_at: data.due_at ?? null,
        contact_id: contactId,
        created_by: context.userId,
      })
      .select("id, protocol")
      .single();
    if (error) throw new Error(error.message);
    return dem;
  });

export const updateDemanda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        state: StateEnum.optional(),
        priority: PriorityEnum.optional(),
        assignee_id: z.string().uuid().nullable().optional(),
        due_at: z.string().datetime().nullable().optional(),
        title: z
          .string()
          .trim()
          .min(3, { message: "O título precisa ter pelo menos 3 caracteres." })
          .max(200, { message: "O título pode ter no máximo 200 caracteres." })
          .optional(),
        description: z
          .string()
          .max(5000, { message: "A descrição pode ter no máximo 5000 caracteres." })
          .nullable()
          .optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { id, ...rest } = data;
    const { data: currentDem, error: curErr } = await context.supabase
      .from("demandas")
      .select("org_id")
      .eq("id", id)
      .maybeSingle();
    if (curErr) throw new Error(curErr.message);
    if (!currentDem) throw new Error("Demanda não encontrada");
    const role = await assertMember(context.supabase, currentDem.org_id, context.userId);
    if (!OP_ROLES.includes(role as (typeof OP_ROLES)[number]))
      throw new Error("Sem permissão para editar");

    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) if (v !== undefined) patch[k] = v;
    // Usa context.supabase (cliente autenticado) em vez de supabaseAdmin para que o trigger
    // log_demanda_changes consiga resolver auth.uid() e gravar actor_id corretamente.
    // A permissão já foi verificada acima via assertMember + OP_ROLES.
    const { data: dem, error } = await context.supabase
      .from("demandas")
      .update(patch as never)
      .eq("id", id)
      .select("id, state")
      .single();
    if (error) throw new Error(error.message);
    return dem;
  });

export const addComment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        demandaId: z.string().uuid(),
        orgId: z.string().uuid(),
        content: z
          .string()
          .trim()
          .min(1, { message: "Escreva um comentário antes de enviar." })
          .max(4000, { message: "O comentário pode ter no máximo 4000 caracteres." }),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("demanda_events").insert({
      org_id: data.orgId,
      demanda_id: data.demandaId,
      kind: "commented",
      actor_id: context.userId,
      content: data.content,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDemanda = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: dem, error: fetchErr } = await context.supabase
      .from("demandas")
      .select("org_id")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!dem) throw new Error("Demanda não encontrada");
    const role = await assertMember(context.supabase, dem.org_id, context.userId);
    if (!["owner", "admin"].includes(role))
      throw new Error("Apenas owners e admins podem excluir demandas.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("demandas").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

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

export const listWebhookTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("webhook_tokens")
      .select("id, name, token, last_used_at, created_at")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
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
        "id, protocol, title, state, priority, due_at, created_at, updated_at, contacts:contact_id(name, phone), channels:channel_id(kind, name)",
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

export const createWebhookToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        name: z.string().min(2).max(80),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const token =
      "wht_" +
      crypto.randomUUID().replace(/-/g, "") +
      crypto.randomUUID().replace(/-/g, "").slice(0, 8);
    const { data: row, error } = await context.supabase
      .from("webhook_tokens")
      .insert({
        org_id: data.orgId,
        name: data.name,
        token,
        created_by: context.userId,
      })
      .select("id, token, name")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const deleteWebhookToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("webhook_tokens").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
