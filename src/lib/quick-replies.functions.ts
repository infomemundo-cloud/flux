import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertMember } from "@/lib/demandas/demandas-guard";

/**
 * Macros / respostas rápidas da organização (tabela quick_replies, criada
 * na migration da Fase 2 — sem policies RLS: acesso só via server functions
 * com guard, padrão demanda_views).
 * Leitura: qualquer membro da org. Escrita (criar/excluir): papéis humanos
 * de operação (agente_ia fica fora).
 */
const HUMAN_OP_ROLES = ["owner", "admin", "gerente", "operador"] as const;

export type QuickReply = {
  id: string;
  org_id: string;
  label: string;
  content: string;
  created_by: string | null;
  created_at: string;
};

export const listQuickReplies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.orgId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin
      .from("quick_replies")
      .select("id, org_id, label, content, created_by, created_at")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return (rows ?? []) as QuickReply[];
  });

export const createQuickReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        label: z.string().trim().min(1).max(60),
        content: z.string().trim().min(1).max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const role = await assertMember(context.supabase, data.orgId, context.userId);
    if (!HUMAN_OP_ROLES.includes(role as (typeof HUMAN_OP_ROLES)[number]))
      throw new Error("Sem permissão para criar macros");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("quick_replies")
      .insert({
        org_id: data.orgId,
        label: data.label,
        content: data.content,
        created_by: context.userId,
      })
      .select("id, org_id, label, content, created_by, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row as QuickReply;
  });

export const updateQuickReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid(),
        label: z.string().trim().min(1).max(60),
        content: z.string().trim().min(1).max(4000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: fetchErr } = await supabaseAdmin
      .from("quick_replies")
      .select("org_id")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!row) throw new Error("Macro não encontrada");
    const role = await assertMember(context.supabase, row.org_id, context.userId);
    if (!HUMAN_OP_ROLES.includes(role as (typeof HUMAN_OP_ROLES)[number]))
      throw new Error("Sem permissão para editar macros");
    const { error } = await supabaseAdmin
      .from("quick_replies")
      .update({ label: data.label, content: data.content })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteQuickReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error: fetchErr } = await supabaseAdmin
      .from("quick_replies")
      .select("org_id")
      .eq("id", data.id)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!row) throw new Error("Macro não encontrada");
    const role = await assertMember(context.supabase, row.org_id, context.userId);
    if (!HUMAN_OP_ROLES.includes(role as (typeof HUMAN_OP_ROLES)[number]))
      throw new Error("Sem permissão para excluir macros");
    const { error } = await supabaseAdmin.from("quick_replies").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });