import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPlatformAdmin } from "@/integrations/supabase/admin-middleware";
import { z } from "zod";

const PORTAL_ACCESS_DEDUPE_MIN = 15;

export async function recordAdminAudit(entry: {
  actorId: string;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
}) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin.from("admin_audit_log").insert({
    actor_id: entry.actorId,
    action: entry.action,
    target_type: entry.targetType ?? null,
    target_id: entry.targetId ?? null,
    metadata: (entry.metadata ?? {}) as never,
    ip: null,
    user_agent: null,
  });
  if (error) console.error("[admin-audit] falha ao gravar", error.message);
}

export async function adminAction<T>(opts: {
  context: { userId: string; adminRole?: string };
  action: string;
  targetType?: string;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
  run: () => Promise<T>;
}): Promise<T> {
  const base = {
    actorId: opts.context.userId,
    action: opts.action,
    targetType: opts.targetType ?? null,
    targetId: opts.targetId ?? null,
  };
  try {
    const result = await opts.run();
    await recordAdminAudit({
      ...base,
      metadata: { ...opts.metadata, outcome: "ok", role: opts.context.adminRole ?? null },
    });
    return result;
  } catch (e) {
    await recordAdminAudit({
      ...base,
      metadata: {
        ...opts.metadata,
        outcome: "error",
        error: String((e as Error)?.message ?? e),
        role: opts.context.adminRole ?? null,
      },
    });
    throw e;
  }
}

export const getPlatformAdminSession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: admin, error } = await supabaseAdmin
      .from("platform_admins")
      .select("role")
      .eq("user_id", context.userId)
      .eq("active", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!admin) return null;
    const since = new Date(Date.now() - PORTAL_ACCESS_DEDUPE_MIN * 60_000).toISOString();
    const { data: recent } = await supabaseAdmin
      .from("admin_audit_log")
      .select("id")
      .eq("actor_id", context.userId)
      .eq("action", "portal_accessed")
      .gte("created_at", since)
      .limit(1);
    if (!(recent ?? []).length) {
      await recordAdminAudit({ actorId: context.userId, action: "portal_accessed" });
    }
    return { role: admin.role as string };
  });

export const countAdminAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await assertPlatformAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count, error } = await supabaseAdmin
      .from("admin_audit_log")
      .select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return { count: count ?? 0, role };
  });

export const setPlatformAdminActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ adminId: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    return adminAction({
      context: { userId: context.userId, adminRole },
      action: "admin_active_changed",
      targetType: "platform_admin",
      targetId: data.adminId,
      metadata: { active: data.active },
      run: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: target, error } = await supabaseAdmin
          .from("platform_admins")
          .select("user_id")
          .eq("id", data.adminId)
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!target) throw new Error("Admin não encontrado.");
        if (target.user_id === context.userId && !data.active)
          throw new Error("Você não pode desativar a si mesmo.");
        const { error: upErr } = await supabaseAdmin
          .from("platform_admins")
          .update({ active: data.active })
          .eq("id", data.adminId);
        if (upErr) throw new Error(upErr.message);
        return { ok: true };
      },
    });
  });

/**
 * OTIMIZADO: Usa a tabela `profiles` com índices B-Tree/GIN para busca e paginação real no Postgres.
 * Elimina o filtro em memória da Vercel e o uso de `auth.admin.listUsers`.
 */
export const listPlatformUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        search: z.string().optional(),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(100).default(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1. Query na tabela profiles com busca real no banco (ilike) + paginação
    let q = supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, created_at", { count: "exact" })
      .order("created_at", { ascending: false });

    if (data.search) {
      const searchLower = data.search.toLowerCase();
      q = q.or(`email.ilike.%${searchLower}%,full_name.ilike.%${searchLower}%`);
    }

    const { data: profiles, error, count } = await q.range(data.offset, data.offset + data.limit - 1);
    if (error) throw new Error(error.message);

    // 2. Enriquecimento: memberships em batch (sem N+1)
    const userIds = (profiles ?? []).map((p) => p.id);
    let memberships: any[] = [];
    if (userIds.length > 0) {
      const { data: mems } = await supabaseAdmin
        .from("memberships")
        .select("user_id, org_id, role, organizations:org_id(name)")
        .in("user_id", userIds);
      memberships = mems ?? [];
    }

    // 3. Lookup de status de banimento (apenas para os IDs da página atual)
    let bannedMap = new Map<string, boolean>();
    if (userIds.length > 0) {
      const { data: authUsers } = await (supabaseAdmin as any)
        .from("auth.users")
        .select("id, banned_until")
        .in("id", userIds);
      
      for (const u of authUsers ?? []) {
        bannedMap.set(u.id, !!u.banned_until);
      }
    }

    const memsByUser = new Map<string, any[]>();
    for (const m of memberships) {
      const existing = memsByUser.get(m.user_id) ?? [];
      existing.push(m);
      memsByUser.set(m.user_id, existing);
    }

    const rows = (profiles ?? []).map((p) => ({
      id: p.id,
      email: p.email,
      name: p.full_name ?? p.email?.split("@")[0] ?? "Usuário",
      created_at: p.created_at,
      banned: bannedMap.get(p.id) ?? false,
      memberships: (memsByUser.get(p.id) ?? []).map((m) => ({
        org_id: m.org_id,
        org_name: m.organizations?.name ?? "Org removida",
        role: m.role,
      })),
    }));

    return { rows, total: count ?? 0 };
  });

export const getPlatformUserDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile, error: profileErr } = await supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, created_at")
      .eq("id", data.userId)
      .maybeSingle();
    if (profileErr || !profile) throw new Error("Usuário não encontrado.");

    const { data: authUser } = await (supabaseAdmin as any)
      .from("auth.users")
      .select("banned_until, last_sign_in_at")
      .eq("id", data.userId)
      .maybeSingle();

    const { data: mems } = await supabaseAdmin
      .from("memberships")
      .select("org_id, role, created_at, organizations:org_id(name)")
      .eq("user_id", data.userId);

    const { data: auditAsTarget } = await supabaseAdmin
      .from("admin_audit_log")
      .select("id, action, target_type, target_id, metadata, created_at")
      .eq("target_id", data.userId)
      .order("created_at", { ascending: false })
      .limit(50);

    const { data: auditAsActor } = await supabaseAdmin
      .from("admin_audit_log")
      .select("id, action, target_type, target_id, metadata, created_at")
      .eq("actor_id", data.userId)
      .order("created_at", { ascending: false })
      .limit(50);

    return {
      user: {
        id: profile.id,
        email: profile.email,
        name: profile.full_name ?? profile.email?.split("@")[0] ?? "Usuário",
        created_at: profile.created_at,
        last_sign_in_at: authUser?.last_sign_in_at ?? null,
        banned: !!authUser?.banned_until,
      },
      memberships: (mems ?? []).map((m) => ({
        org_id: m.org_id,
        org_name: m.organizations?.name ?? "Org removida",
        role: m.role,
        created_at: m.created_at,
      })),
      audit: {
        asTarget: auditAsTarget ?? [],
        asActor: auditAsActor ?? [],
      },
    };
  });

export const setUserBanned = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        banned: z.boolean(),
        duration: z.enum(["24h", "7d", "permanent"]).default("permanent"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    return adminAction({
      context: { userId: context.userId, adminRole },
      action: data.banned ? "user_suspended" : "user_reactivated",
      targetType: "user",
      targetId: data.userId,
      metadata: { banned: data.banned, duration: data.banned ? data.duration : "none" },
      run: async () => {
        if (data.userId === context.userId) throw new Error("Você não pode suspender a si mesmo.");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
          ban_duration: data.banned ? data.duration : "none",
        });
        if (error) throw new Error(error.message);
        return { ok: true };
      },
    });
  });

export const removeUserFromOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), orgId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    return adminAction({
      context: { userId: context.userId, adminRole },
      action: "user_removed_from_org",
      targetType: "membership",
      targetId: data.userId,
      metadata: { org_id: data.orgId },
      run: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("memberships")
          .delete()
          .eq("user_id", data.userId)
          .eq("org_id", data.orgId);
        if (error) throw new Error(error.message);
        return { ok: true };
      },
    });
  });

export const generateRecoveryLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    return adminAction({
      context: { userId: context.userId, adminRole },
      action: "recovery_link_generated",
      targetType: "user",
      targetId: data.userId,
      metadata: {},
      run: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: profile, error: profileErr } = await supabaseAdmin
          .from("profiles")
          .select("email")
          .eq("id", data.userId)
          .maybeSingle();
        if (profileErr || !profile) throw new Error("Usuário não encontrado.");
        
        const { data: linkData, error } = await supabaseAdmin.auth.admin.generateLink({
          type: "recovery",
          email: profile.email,
        });
        if (error) throw new Error(error.message);
        return { recoveryLink: linkData.properties?.action_link ?? null, email: profile.email };
      },
    });
  });

export const invitePlatformAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email(),
        role: z.enum(["superadmin", "support", "billing", "viewer"]).default("superadmin"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    return adminAction({
      context: { userId: context.userId, adminRole },
      action: "platform_admin_invited",
      targetType: "platform_admin_invite",
      targetId: null,
      metadata: { email: data.email, role: data.role },
      run: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        
        const { data: existingProfile, error: lookupErr } = await supabaseAdmin
          .from("profiles")
          .select("id, email")
          .eq("email", data.email.toLowerCase())
          .maybeSingle();
        if (lookupErr) throw new Error(lookupErr.message);

        if (existingProfile) {
          const { error: insertErr } = await supabaseAdmin.from("platform_admins").upsert(
            { user_id: existingProfile.id, role: data.role, active: true },
            { onConflict: "user_id" },
          );
          if (insertErr) throw new Error(insertErr.message);
          return { type: "promoted", userId: existingProfile.id };
        }

        const token = crypto.randomUUID();
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
        const { error: inviteErr } = await supabaseAdmin.from("platform_admin_invites").insert({
          token,
          email: data.email,
          role: data.role,
          invited_by: context.userId,
          expires_at: expiresAt,
        });
        if (inviteErr) throw new Error(inviteErr.message);

        return { type: "invited", token };
      },
    });
  });

export const acceptPlatformAdminInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        token: z.string().uuid(),
        password: z.string().min(12),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite, error: inviteErr } = await supabaseAdmin
      .from("platform_admin_invites")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();
    if (inviteErr) throw new Error(inviteErr.message);
    if (!invite) throw new Error("Convite não encontrado.");
    if (invite.accepted_at) throw new Error("Convite já foi aceito.");
    if (new Date(invite.expires_at) < new Date()) throw new Error("Convite expirado.");
    
    const { data: sessionUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const sessionEmail = sessionUser.user?.email?.toLowerCase();
    if (invite.email.toLowerCase() !== sessionEmail)
      throw new Error("Email do convite não corresponde à sua sessão.");

    const { data: userData, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: invite.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: invite.email.split("@")[0] },
    });
    if (createErr) throw new Error(createErr.message);

    const { error: adminErr } = await supabaseAdmin.from("platform_admins").insert({
      user_id: userData.user.id,
      role: invite.role,
      active: true,
    });
    if (adminErr) throw new Error(adminErr.message);

    const { error: updateErr } = await supabaseAdmin
      .from("platform_admin_invites")
      .update({ accepted_at: new Date().toISOString(), accepted_by: userData.user.id })
      .eq("token", data.token);
    if (updateErr) throw new Error(updateErr.message);

    await recordAdminAudit({
      actorId: userData.user.id,
      action: "platform_admin_invite_accepted",
      targetType: "platform_admin_invite",
      targetId: invite.id,
      metadata: { role: invite.role },
    });

    return { ok: true };
  });

export const promoteExistingUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email(),
        role: z.enum(["superadmin", "support", "billing", "viewer"]).default("superadmin"),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    return adminAction({
      context: { userId: context.userId, adminRole },
      action: "user_promoted_to_platform_admin",
      targetType: "platform_admin",
      targetId: null,
      metadata: { email: data.email, role: data.role },
      run: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: existingProfile, error: lookupErr } = await supabaseAdmin
          .from("profiles")
          .select("id, email")
          .eq("email", data.email.toLowerCase())
          .maybeSingle();
        if (lookupErr) throw new Error(lookupErr.message);
        if (!existingProfile) throw new Error("Usuário não encontrado.");
        
        const { error } = await supabaseAdmin.from("platform_admins").upsert(
          { user_id: existingProfile.id, role: data.role, active: true },
          { onConflict: "user_id" },
        );
        if (error) throw new Error(error.message);
        return { userId: existingProfile.id };
      },
    });
  });

export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ inviteId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    return adminAction({
      context: { userId: context.userId, adminRole },
      action: "platform_admin_invite_revoked",
      targetType: "platform_admin_invite",
      targetId: data.inviteId,
      metadata: {},
      run: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("platform_admin_invites")
          .update({ accepted_at: new Date().toISOString() })
          .eq("id", data.inviteId)
          .is("accepted_by", null);
        if (error) throw new Error(error.message);
        return { ok: true };
      },
    });
  });

/**
 * Busca apenas os logs de auditoria de um usuário (Fase 1.8 OTIMIZADA).
 * Separado de getPlatformUserDetail para permitir Lazy Loading na aba de Auditoria.
 */
export const getPlatformUserAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: auditAsTarget } = await supabaseAdmin
      .from("admin_audit_log")
      .select("id, action, target_type, target_id, metadata, created_at")
      .eq("target_id", data.userId)
      .order("created_at", { ascending: false })
      .limit(50);

    const { data: auditAsActor } = await supabaseAdmin
      .from("admin_audit_log")
      .select("id, action, target_type, target_id, metadata, created_at")
      .eq("actor_id", data.userId)
      .order("created_at", { ascending: false })
      .limit(50);

    return {
      asTarget: auditAsTarget ?? [],
      asActor: auditAsActor ?? [],
    };
  });
