import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertMember } from "@/lib/demandas/demandas-guard";

/**
 * Dashboard operacional da organização.
 *
 * FONTE ÚNICA DE VERDADE: uma única query em `demandas` (escopo completo ou
 * filtrado por responsável) alimenta counts, KPIs, timeline E as colunas de
 * tarefas (`columns`). Antes, as colunas do dashboard vinham de uma chamada
 * separada de `listDemandas` com limit default 20 — as demandas abertas fora
 * do top-20 sumiam das contagens e divergiam da Fila. Agora dashboard e fila
 * compartilham a mesma lógica de contagem/filtros sobre a mesma tabela.
 */
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
      .select(
        "id, protocol, title, state, priority, due_at, resolved_at, created_at, updated_at, assignee_id, whatsapp_jid, last_message_preview, contacts:contact_id(name, phone, avatar_url)",
      )
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

    // Colunas de tarefas (mesmos estados abertos do kanban do dashboard),
    // agrupadas do MESMO array de rows dos counts — contagem e cards nunca
    // divergem. Ordenação interna = mesma regra da fila: atrasadas primeiro
    // (pip), depois por atividade recente (updated_at desc).
    const columns: Record<string, any[]> = {
      novo: [],
      em_analise: [],
      aguardando_cliente: [],
      aguardando_revisao_humana: [],
    };
    const isOverdueRow = (r: any) =>
      !!r.due_at && new Date(r.due_at).getTime() < now && r.state !== "concluido";

    for (const r of rows ?? []) {
      counts[r.state] = (counts[r.state] ?? 0) + 1;
      // Aberta = tudo que não está concluída/fechada (inclui aguardando
      // revisão humana) — regra definida com o produto.
      const state = r.state as string;
      const isOpen = state !== "concluido" && state !== "fechado";
      if (isOpen) openTotal++;
      // Vencida = aberta com prazo estourado, exceto aguardando revisão
      // humana (mesmo predicado do pip vermelho da fila).
      if (isOpen && r.state !== "aguardando_revisao_humana" && isOverdueRow(r)) overdue++;
      const created = (r.created_at as string).slice(0, 10);
      if (created in last14) last14[created].novas++;
      if (r.resolved_at) {
        const resolved = (r.resolved_at as string).slice(0, 10);
        if (resolved in last14) last14[resolved].resolvidas++;
      }
      if (columns[r.state]) columns[r.state].push(r);
    }

    for (const key of Object.keys(columns)) {
      columns[key].sort((a: any, b: any) => {
        const oa = isOverdueRow(a);
        const ob = isOverdueRow(b);
        if (oa && !ob) return -1;
        if (!oa && ob) return 1;
        return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
      });
    }

    return {
      counts,
      overdue,
      openTotal,
      timeline: Object.entries(last14).map(([date, v]) => ({ date, ...v })),
      total: rows?.length ?? 0,
      columns,
    };
  });

/**
 * Demandas paradas (Alertas de SLA).
 *
 * Janela em DIAS (aceita fração: 4h = 4/24). `staleDays` é OPCIONAL de
 * propósito — balanceamento front/back:
 * - SEM staleDays: o servidor aplica a REGRA DA ORG
 *   (organizations.sla_max_inactivity_hours ÷ 24; sla_enabled=false → []).
 *   Badge da sidebar/nav e futuros consumidores (notificações) herdam a
 *   regra sem precisar conhecê-la;
 * - COM staleDays: vira override de exploração (página Alertas, select em
 *   dias inteiros).
 */
export const slaAlerts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        staleDays: z.number().min(1 / 24).max(30).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.orgId, context.userId);

    let days = data.staleDays;
    if (days === undefined) {
      const { data: orgRow } = await context.supabase
        .from("organizations")
        .select("sla_enabled, sla_max_inactivity_hours")
        .eq("id", data.orgId)
        .maybeSingle();
      if (orgRow?.sla_enabled === false) return [];
      days = (orgRow?.sla_max_inactivity_hours ?? 24) / 24;
    }
    const cutoff = new Date(Date.now() - days * 86400000).toISOString();
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