import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { StateEnum, PriorityEnum, OP_ROLES, assertMember } from "@/lib/demandas/demandas-guard";

/**
 * Shape da citação ("em resposta a…") gravada no metadata dos eventos.
 * É um snapshot da mensagem citada (autor + texto + tipo) — não um FK
 * rígida: se o evento original for excluído, a citação continua legível.
 */
const QuotedSchema = z.object({
  event_id: z.string().uuid().optional(),
  author: z.string().max(120),
  content: z.string().max(4000),
  kind: z.string().max(40),
});

export const listDemandas = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        state: StateEnum.optional(),
        assignedToMe: z.boolean().optional(),
        assigneeId: z.string().uuid().nullable().optional(),
        // Escopo das abas da Fila (padrão Intercom): all = visão do papel,
        // mine = só minhas, orphan = só sem responsável. Operador no "all"
        // é forçado server-side pra mine+orphan (regra de produto, sem bypass).
        scope: z.enum(["all", "mine", "orphan"]).optional(),
        search: z.string().optional(),
        // Aba "Atrasadas": filtra só demandas com SLA estourado ANTES de
        // ordenar/paginar. A aba "Fila" lista tudo em ordem de atividade
        // (atrasadas inline, com a borda carmim delas).
        overdueOnly: z.boolean().optional(),
        // Paginação: offset/limit com defaults seguros. limit tem teto de 100
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const role = await assertMember(context.supabase, data.orgId, context.userId);
    // Escopo efetivo: operador na aba Fila (all) vê só SUAS + ÓRFÃS.
    const effectiveScope =
      role === "operador" && (data.scope ?? "all") === "all"
        ? "mine_or_orphan"
        : (data.scope ?? "all");
    // 1. Monta a query com os filtros, mas SEM o .range() ainda
    let q = context.supabase
      .from("demandas")
      .select(
        "id, protocol, title, state, priority, due_at, assignee_id, contact_id, whatsapp_jid, created_at, updated_at, last_message_preview, last_message_at, contacts:contact_id(name, phone, avatar_url), channels:channel_id(kind, name)",
        { count: "exact" },
      )
      .eq("org_id", data.orgId);
    if (data.state) q = q.eq("state", data.state);
    if (data.assignedToMe) q = q.eq("assignee_id", context.userId);
    if (data.assigneeId === null) q = q.is("assignee_id", null);
    else if (typeof data.assigneeId === "string") q = q.eq("assignee_id", data.assigneeId);
    if (effectiveScope === "mine") q = q.eq("assignee_id", context.userId);
    else if (effectiveScope === "orphan") q = q.is("assignee_id", null);
    else if (effectiveScope === "mine_or_orphan")
      q = q.or(`assignee_id.eq.${context.userId},assignee_id.is.null`);
    if (data.search) q = q.ilike("title", `%${data.search}%`);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const now = Date.now();
    // 2. Contagens das 4 abas via head counts (independentes da paginação e
    // do escopo atual): os badges nunca mentem ao trocar de aba.
    const isOverdue = (r: any) =>
      !!r.due_at && new Date(r.due_at).getTime() < now && r.state !== "concluido";
    const baseCount = () => {
      let c = context.supabase
        .from("demandas")
        .select("id", { count: "exact", head: true })
        .eq("org_id", data.orgId);
      if (data.state) c = c.eq("state", data.state);
      if (data.search) c = c.ilike("title", `%${data.search}%`);
      return c;
    };
    // Tipado pelo retorno de baseCount: preserva a cadeia do builder e o
    // contexto de tipo dos .then() (sem isso, noImplicitAny acusa TS7006).
    const withRoleScope = (c: ReturnType<typeof baseCount>) =>
      role === "operador"
        ? c.or(`assignee_id.eq.${context.userId},assignee_id.is.null`)
        : c;
    const nowIso = new Date(now).toISOString();
    const [filaCount, mineCount, orphanCount, overdueCount] = await Promise.all([
      withRoleScope(baseCount()).then((r) => r.count ?? 0),
      baseCount().eq("assignee_id", context.userId).then((r) => r.count ?? 0),
      baseCount().is("assignee_id", null).then((r) => r.count ?? 0),
      withRoleScope(baseCount())
        .lt("due_at", nowIso)
        .neq("state", "concluido")
        .then((r) => r.count ?? 0),
    ]);
    const counts = {
      fila: filaCount,
      mine: mineCount,
      orphan: orphanCount,
      overdue: overdueCount,
    };
    const overdueAll = (rows ?? []).filter(isOverdue);
    // 3. Conjunto de trabalho da aba atual + ordenação por ÚLTIMA ATIVIDADE
    //    = max(last_message_at, updated_at) — mesma chave que o card exibe
    //    (activityIso), então posição e data visível nunca discordam.
    //    Com as abas, não existe mais "atrasadas primeiro" no sort: na aba
    //    Fila elas vivem na posição natural de atividade (borda carmim nelas).
    const activityOf = (r: any) => {
      const lm = r.last_message_at ? new Date(r.last_message_at).getTime() : 0;
      const up = r.updated_at ? new Date(r.updated_at).getTime() : 0;
      return Math.max(lm, up);
    };
    const working = data.overdueOnly ? overdueAll : (rows ?? []);
    working.sort((a: any, b: any) => activityOf(b) - activityOf(a));
    // 4. Paginação manual no array já ordenado (snapshot único por query)
    const paginatedRows = working.slice(data.offset, data.offset + data.limit);
    const ids = paginatedRows.map((r: any) => r.id as string);
    // 5. NÃO LIDAS POR USUÁRIO: última message_in da demanda vs viewed_at
    //    deste membro em demanda_views. Sem view = nunca aberta = não lida.
    //    Service role porque demanda_views tem RLS default-deny (policies só
    //    pra uso futuro via client; hoje tudo passa por aqui).
    if (ids.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: evs } = await supabaseAdmin
        .from("demanda_events")
        .select("demanda_id, created_at")
        .eq("kind", "message_in")
        .in("demanda_id", ids)
        .order("created_at", { ascending: false });
      const lastInbound = new Map<string, string>();
      for (const e of evs ?? []) {
        if (!lastInbound.has(e.demanda_id)) lastInbound.set(e.demanda_id, e.created_at);
      }
      const { data: views } = await supabaseAdmin
        .from("demanda_views")
        .select("demanda_id, viewed_at")
        .eq("user_id", context.userId)
        .in("demanda_id", ids);
      const viewed = new Map<string, string>(
        (views ?? []).map((v: any) => [v.demanda_id, v.viewed_at]),
      );
      for (const r of paginatedRows as any[]) {
        const li = lastInbound.get(r.id);
        const vw = viewed.get(r.id);
        r.unread = !!li && (!vw || li > vw);
      }
    }
    // 6. Resolve nomes dos responsáveis em batch (apenas dos itens paginados)
    const assignees: Record<string, { id: string; name: string }> = {};
    const assigneeIds = [
      ...new Set((paginatedRows ?? []).map((r: any) => r.assignee_id).filter(Boolean) as string[]),
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
    return {
      rows: paginatedRows,
      assignees,
      // total = tamanho da ABA atual (paginação); counts = badges das 4
      // abas (fila/mine/orphan/overdue), sempre do escopo completo filtrado.
      total: working.length,
      counts,
      offset: data.offset,
      limit: data.limit,
    };
  });

/**
 * Marca TODAS as demandas da org como lidas pra este membro (upsert em
 * demanda_views). É a ação secundária do menu "..." da fila — limpa os dots
 * de não-lida de uma vez sem precisar abrir demanda por demanda.
 */
export const markAllDemandasRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.orgId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: ids, error } = await supabaseAdmin
      .from("demandas")
      .select("id")
      .eq("org_id", data.orgId);
    if (error) throw new Error(error.message);
    const now = new Date().toISOString();
    const payload = (ids ?? []).map((r: any) => ({
      demanda_id: r.id as string,
      user_id: context.userId,
      viewed_at: now,
    }));
    if (payload.length > 0) {
      const { error: upErr } = await supabaseAdmin
        .from("demanda_views")
        .upsert(payload, { onConflict: "demanda_id,user_id" });
      if (upErr) throw new Error(upErr.message);
    }
    return { ok: true, count: payload.length };
  });

export const getDemanda = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: dem, error } = await context.supabase
      .from("demandas")
      .select(
        "*, contacts:contact_id(id, name, phone, email, avatar_url, notes, tags, company), channels:channel_id(id, kind, name)",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!dem) throw new Error("Demanda não encontrada");

    // Marca como vista pra este usuário — o dot de "não lida" some na fila.
    // Upsert idempotente (PK demanda_id+user_id); falha aqui NÃO pode
    // derrubar a abertura da demanda, então engolimos com log.
    try {
      const { supabaseAdmin: adminViews } = await import("@/integrations/supabase/client.server");
      await adminViews
        .from("demanda_views")
        .upsert(
          { demanda_id: data.id, user_id: context.userId, viewed_at: new Date().toISOString() },
          { onConflict: "demanda_id,user_id" },
        );
    } catch (e) {
      console.error("[getDemanda] falha ao marcar vista", e);
    }

    const { data: events } = await context.supabase
      .from("demanda_events")
      .select("*")
      .eq("demanda_id", data.id)
      .order("created_at");
    // Bucket privado: gera URL assinada (1h) só pros eventos que têm mídia,
    // em paralelo — incluindo o thumbnail de vídeo (metadata.media_thumb).
    // Falha ao assinar NÃO derruba a demanda: o evento chega com
    // media_url_signed = null e a bolha mostra o fallback "mídia indisponível".
    const { signedMediaUrl } = await import("@/lib/demandas/media-storage");
    const signedEvents = await Promise.all(
      (events ?? []).map(async (e: any) => {
        if (!e.media_url) return e;
        const [url, thumb] = await Promise.all([
          signedMediaUrl(e.media_url, 3600),
          e.metadata?.media_thumb ? signedMediaUrl(e.metadata.media_thumb, 3600) : Promise.resolve(null),
        ]);
        return { ...e, media_url_signed: url, media_thumb_signed: thumb };
      }),
    );
    // Identidade dos personagens: quem criou, mudou status, comentou e é responsável.
    const ids = new Set<string>();
    if (dem.created_by) ids.add(dem.created_by as string);
    if (dem.assignee_id) ids.add(dem.assignee_id as string);
    for (const e of signedEvents ?? []) {
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

    // "Demanda nº X deste contato" + anteriores (aba Demanda do trilho).
    // Três queries baratas (2 head counts + lista limitada) só quando existe
    // contato vinculado; sem contato, contactStats = null e o trilho omite.
    let contactStats: {
      posicao: number;
      total: number;
      anteriores: { id: string; protocol: string | null; state: string; created_at: string }[];
    } | null = null;
    if (dem.contact_id) {
      const { count: total, error: totErr } = await context.supabase
        .from("demandas")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", dem.contact_id);
      if (totErr) throw new Error(totErr.message);
      const { count: before, error: befErr } = await context.supabase
        .from("demandas")
        .select("id", { count: "exact", head: true })
        .eq("contact_id", dem.contact_id)
        .lt("created_at", dem.created_at);
      if (befErr) throw new Error(befErr.message);
      const { data: anteriores, error: antErr } = await context.supabase
        .from("demandas")
        .select("id, protocol, state, created_at")
        .eq("contact_id", dem.contact_id)
        .lt("created_at", dem.created_at)
        .order("created_at", { ascending: false })
        .limit(4);
      if (antErr) throw new Error(antErr.message);
      contactStats = {
        posicao: (before ?? 0) + 1,
        total: total ?? 1,
        anteriores: (anteriores ?? []) as {
          id: string;
          protocol: string | null;
          state: string;
          created_at: string;
        }[],
      };
    }

    return { demanda: dem, events: signedEvents, actors, viewerId: context.userId, contactStats };
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
    // Ninguém preenchia resolved_at em lugar nenhum do sistema — o contador
    // "Concluídas" contava certo (bate em state), mas o gráfico "Últimos 14
    // dias" e o KPI de tendência dependem desse campo, que ficava sempre
    // null. Preenche ao concluir, limpa se for reaberta depois.
    if ("state" in patch) {
      patch.resolved_at = patch.state === "concluido" ? new Date().toISOString() : null;
    }
    // Usa context.supabase (cliente autenticado) em vez de supabaseAdmin para que o trigger
    // log_demanda_changes consiga resolver auth.uid() e gravar actor_id corretamente.
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
        // Citação opcional ("em resposta a…") — snapshot da mensagem citada
        // gravado no metadata do evento de comentário.
        quoted: QuotedSchema.optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // metadata só entra quando há citação: a coluna tem default próprio e é
    // NOT NULL — inserir null explícito era o erro do comentário interno sem
    // reply. Sem citação, omitimos a chave e o default do banco vale.
    const { error } = await supabaseAdmin.from("demanda_events").insert({
      org_id: data.orgId,
      demanda_id: data.demandaId,
      kind: "commented",
      actor_id: context.userId,
      content: data.content,
      ...(data.quoted ? { metadata: { quoted: data.quoted } } : {}),
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