import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const RoleEnum = z.enum(["admin", "gerente", "operador", "agente_ia"]);
const MANAGER_ROLES = ["owner", "admin", "gerente"] as const;

function isManager(role: string) {
  return (MANAGER_ROLES as readonly string[]).includes(role);
}

async function getMemberRole(supabase: any, orgId: string, userId: string) {
  const { data, error } = await supabase
    .from("memberships").select("role").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.role as string | undefined;
}

function randomToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export const createInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({
      orgId: z.string().uuid(),
      suggestedRole: RoleEnum.default("operador"),
      email: z.string().email().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const role = await getMemberRole(context.supabase, data.orgId, context.userId);
    if (!role || !isManager(role)) throw new Error("Somente gestores podem criar convites.");
    const token = randomToken();
    const { data: row, error } = await context.supabase
      .from("invites")
      .insert({
        org_id: data.orgId,
        token,
        email: data.email ?? null,
        suggested_role: data.suggestedRole,
        invited_by: context.userId,
      })
      .select("id, token, suggested_role, email, status, created_at")
      .single();
    if (error) throw new Error(error.message);
    return row;
  });

export const listInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const role = await getMemberRole(context.supabase, data.orgId, context.userId);
    if (!role || !isManager(role)) throw new Error("Sem permissão.");
    const { data: rows, error } = await context.supabase
      .from("invites")
      .select("id, token, email, suggested_role, status, requested_by, approved_role, created_at, updated_at")
      .eq("org_id", data.orgId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const enriched = await Promise.all(
      (rows ?? []).map(async (r: any) => {
        let requester_email: string | null = null;
        if (r.requested_by) {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.requested_by);
          requester_email = u.user?.email ?? null;
        }
        return { ...r, requester_email };
      }),
    );
    return enriched;
  });

export const viewInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().min(10) }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv, error } = await supabaseAdmin
      .from("invites")
      .select("id, org_id, status, suggested_role, requested_by, approved_role, organizations:org_id(name, slug)")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) throw new Error("Convite inválido ou removido.");
    let alreadyMember = false;
    const { data: mem } = await supabaseAdmin
      .from("memberships").select("role").eq("org_id", inv.org_id).eq("user_id", context.userId).maybeSingle();
    if (mem) alreadyMember = true;
    // Auto-claim: if pending and has no requester yet, mark requested_by=self.
    if (inv.status === "pending" && !inv.requested_by && !alreadyMember) {
      await supabaseAdmin.from("invites")
        .update({ requested_by: context.userId })
        .eq("id", inv.id);
      inv.requested_by = context.userId;
    }
    return {
      status: inv.status as string,
      suggested_role: inv.suggested_role as string,
      approved_role: inv.approved_role as string | null,
      requested_by_self: inv.requested_by === context.userId,
      already_member: alreadyMember,
      org: inv.organizations as { name: string; slug: string } | null,
    };
  });

export const approveInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ inviteId: z.string().uuid(), role: RoleEnum }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv, error } = await supabaseAdmin
      .from("invites").select("id, org_id, status, requested_by").eq("id", data.inviteId).maybeSingle();
    if (error || !inv) throw new Error("Convite não encontrado.");
    const role = await getMemberRole(context.supabase, inv.org_id, context.userId);
    if (!role || !isManager(role)) throw new Error("Sem permissão.");
    if (inv.status !== "pending") throw new Error("Convite já processado.");
    if (!inv.requested_by) throw new Error("Aguardando o convidado acessar o link.");
    const { error: memErr } = await supabaseAdmin.from("memberships")
      .insert({ org_id: inv.org_id, user_id: inv.requested_by, role: data.role });
    if (memErr && !/duplicate key/i.test(memErr.message)) throw new Error(memErr.message);
    const { error: upErr } = await supabaseAdmin.from("invites").update({
      status: "approved", approved_by: context.userId, approved_at: new Date().toISOString(), approved_role: data.role,
    }).eq("id", inv.id);
    if (upErr) throw new Error(upErr.message);
    return { ok: true };
  });

export const rejectInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ inviteId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: inv } = await supabaseAdmin.from("invites").select("id, org_id, status").eq("id", data.inviteId).maybeSingle();
    if (!inv) throw new Error("Convite não encontrado.");
    const role = await getMemberRole(context.supabase, inv.org_id, context.userId);
    if (!role || !isManager(role)) throw new Error("Sem permissão.");
    if (inv.status !== "pending") throw new Error("Convite já processado.");
    const { error } = await supabaseAdmin.from("invites")
      .update({ status: "rejected", approved_by: context.userId, approved_at: new Date().toISOString() })
      .eq("id", inv.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateMemberRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ orgId: z.string().uuid(), userId: z.string().uuid(), role: RoleEnum }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const role = await getMemberRole(context.supabase, data.orgId, context.userId);
    if (!role || !isManager(role)) throw new Error("Sem permissão.");
    if (data.userId === context.userId) throw new Error("Você não pode alterar seu próprio papel.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin.from("memberships").select("role").eq("org_id", data.orgId).eq("user_id", data.userId).maybeSingle();
    if (target?.role === "owner") throw new Error("Não é possível alterar o papel do owner.");
    const { error } = await supabaseAdmin.from("memberships").update({ role: data.role }).eq("org_id", data.orgId).eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const removeMember = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid(), userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const role = await getMemberRole(context.supabase, data.orgId, context.userId);
    if (!role || !isManager(role)) throw new Error("Sem permissão.");
    if (data.userId === context.userId) throw new Error("Você não pode se remover.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin.from("memberships").select("role").eq("org_id", data.orgId).eq("user_id", data.userId).maybeSingle();
    if (target?.role === "owner") throw new Error("Owner não pode ser removido.");
    const { error } = await supabaseAdmin.from("memberships").delete().eq("org_id", data.orgId).eq("user_id", data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });