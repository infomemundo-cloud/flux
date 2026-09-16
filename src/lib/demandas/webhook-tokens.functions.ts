import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertMember } from "@/lib/demandas/demandas-guard";

/**
 * Configurações é área de owner/admin. A UI esconde os links, a rota
 * redireciona, e AQUI é onde a regra realmente vale: qualquer chamada
 * direta de server function por usuário sem permissão morre neste check.
 */
async function assertOrgAdmin(supabase: any, orgId: string, userId: string) {
  const role = await assertMember(supabase, orgId, userId);
  if (role !== "owner" && role !== "admin") {
    throw new Error("Acesso restrito a owners e admins");
  }
  return role;
}

export const listWebhookTokens = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertOrgAdmin(context.supabase, data.orgId, context.userId);
    const { data: rows, error } = await context.supabase
      .from("webhook_tokens")
      .select("id, name, token, last_used_at, created_at")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows ?? [];
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
    await assertOrgAdmin(context.supabase, data.orgId, context.userId);
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
    // O input só traz o id do token — busca a org dona dele pra validar o papel.
    const { data: row } = await context.supabase
      .from("webhook_tokens")
      .select("org_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row) throw new Error("Token não encontrado");
    await assertOrgAdmin(context.supabase, row.org_id, context.userId);
    const { error } = await context.supabase.from("webhook_tokens").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });