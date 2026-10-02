import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPlatformAdmin } from "@/integrations/supabase/admin-middleware";
import { z } from "zod";

/** Janela de dedupe do audit de acesso ao portal (não polui por refetch). */
const PORTAL_ACCESS_DEDUPE_MIN = 15;

/**
 * Grava linha no admin_audit_log (fire-and-forget com log de falha:
 * auditoria não pode derrubar a operação que está sendo auditada).
 * ip/user_agent: captura REMOVIDA no MVP (API de headers instável).
 * metadata: cast `as never` é o padrão do projeto pra jsonb com tipos
 * gerados do Supabase (mesmo padrão do `patch as never` no updateDemanda).
 */
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

/**
 * Wrapper de handler pra mutations do admin (D10): executa a operação e
 * grava audit com outcome ok/error SEMPRE (erro também é auditoria).
 */
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

/**
 * Gate de papel (Fase 1.8): roles de platform_admins têm semântica REAL:
 * - superadmin: tudo, inclusive gestão de admins.
 * - support: operações de usuário (suspender/remover/recuperação).
 * - billing: leituras (ações de billing chegam na fase de billing).
 * - viewer: somente leitura.
 * Lança erro se o papel atual não estiver na lista permitida — o frontend
 * também esconde os botões, mas a autoridade é do backend.
 */
export function assertRole(adminRole: string, allowed: string[], actionLabel: string): void {
  if (!allowed.includes(adminRole)) {
    throw new Error(
      `Papel "${adminRole}" não pode executar: ${actionLabel} (permitido para: ${allowed.join(", ")}).`,
    );
  }
}

/** Matriz única de papéis por família de ação (não duplicar em handlers). */
export const ROLE_ACTIONS = {
  adminManagement: ["superadmin"],
  userManagement: ["superadmin", "support"],
} as const;

/**
 * Sonda a sessão admin pro guard de rota do shell. NÃO lança erro quando
 * não é admin (retorna null) — o guard decide o redirect. Quando é admin,
 * grava audit de acesso ao portal com dedupe de 15min (o layout refetcha
 * a query e não queremos uma linha de audit por refetch).
 */
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

/**
 * Contagem do audit log pro card de fumaça do dashboard.
 * `head: true` = COUNT sem baixar rows (mínimo custo no Postgres).
 */
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

/**
 * Ativar/desativar um admin. Guardrail: não pode desativar a si mesmo
 * (evita auto-lockout). Gate: somente superadmin (gestão de admins).
 */
export const setPlatformAdminActive = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ adminId: z.string().uuid(), active: z.boolean() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    assertRole(adminRole, [...ROLE_ACTIONS.adminManagement], "ativar/desativar admins");
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
 * Lista cross-tenant de usuários (Fase 1.8 OTIMIZADA).
 * Busca real no Postgres via `profiles` (índices B-Tree/GIN) + paginação
 * nativa `.range()` + count exato pra paginação infinita do frontend.
 * Enriquecimento em batch (1 query cada, sem N+1): memberships e
 * `platform_role` (badge da tabela). O status de banimento vem do
 * PRÓPRIO profiles (coluna espelho `banned_until`, sincronizada por
 * trigger) — zero consultas ao schema auth via PostgREST.
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

    let q = supabaseAdmin
      .from("profiles")
      .select("id, email, full_name, created_at, banned_until", { count: "exact" })
      .order("created_at", { ascending: false });

    if (data.search) {
      const searchLower = data.search.toLowerCase();
      q = q.or(`email.ilike.%${searchLower}%,full_name.ilike.%${searchLower}%`);
    }

    const { data: profiles, error, count } = await q.range(
      data.offset,
      data.offset + data.limit - 1,
    );
    if (error) throw new Error(error.message);

    const userIds = (profiles ?? []).map((p) => p.id);

    // Memberships em batch (1 query, não N+1)
    let memberships: any[] = [];
    if (userIds.length > 0) {
      const { data: mems } = await supabaseAdmin
        .from("memberships")
        .select("user_id, org_id, role, organizations:org_id(name)")
        .in("user_id", userIds);
      memberships = mems ?? [];
    }

    // Papel na plataforma (badge da tabela): 1 query batch, sem N+1
    let adminRoleMap = new Map<string, string>();
    if (userIds.length > 0) {
      const { data: admins } = await supabaseAdmin
        .from("platform_admins")
        .select("user_id, role")
        .in("user_id", userIds)
        .eq("active", true);
      for (const a of admins ?? []) {
        adminRoleMap.set(a.user_id, a.role);
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
      banned: !!p.banned_until,
      platform_role: adminRoleMap.get(p.id) ?? null,
      memberships: (memsByUser.get(p.id) ?? []).map((m) => ({
        org_id: m.org_id,
        org_name: m.organizations?.name ?? "Org removida",
        role: m.role,
      })),
    }));

    return { rows, total: count ?? 0 };
  });

/**
 * Detalhe de usuário cross-tenant (Fase 1.8, REDUNDÂNCIA ELIMINADA).
 * Retorna SOMENTE identidade + memberships. O audit NÃO vem embutido:
 * a aba Audit consome `getPlatformUserAudit` (lazy, enabled por aba),
 * economizando 2 queries de 50 rows por abertura de detalhe.
 * Ban/último login vêm do espelho em profiles (trigger sincroniza).
 */
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
      .select("id, email, full_name, created_at, banned_until, last_sign_in_at")
      .eq("id", data.userId)
      .maybeSingle();
    if (profileErr || !profile) throw new Error("Usuário não encontrado.");

    const { data: mems } = await supabaseAdmin
      .from("memberships")
      .select("org_id, role, created_at, organizations:org_id(name)")
      .eq("user_id", data.userId);

    return {
      user: {
        id: profile.id,
        email: profile.email,
        name: profile.full_name ?? profile.email?.split("@")[0] ?? "Usuário",
        created_at: profile.created_at,
        last_sign_in_at: profile.last_sign_in_at,
        banned: !!profile.banned_until,
      },
      memberships: (mems ?? []).map((m) => ({
        org_id: m.org_id,
        org_name: m.organizations?.name ?? "Org removida",
        role: m.role,
        created_at: m.created_at,
      })),
    };
  });

/**
 * Logs de auditoria de um usuário (lazy): só é chamada quando a aba
 * Audit está ativa no frontend (enabled: tab === "audit").
 * Limits explícitos (50 por direção) pra nunca baixar tabela inteira.
 */
/**
 * Feed unificado de auditoria do usuário (sobre OU por ele), paginado
 * sob demanda: 1 única query com .or() + .range() (metade do custo das
 * 2 queries antigas) e limite máx. de 50 por requisição (UI usa 20).
 * A UI decide a direção pelo actor_id de cada row.
 */
export const getPlatformUserAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        offset: z.number().int().min(0).default(0),
        limit: z.number().int().min(1).max(50).default(20),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error, count } = await supabaseAdmin
      .from("admin_audit_log")
      .select("id, action, target_type, target_id, actor_id, metadata, created_at", {
        count: "exact",
      })
      .or(`target_id.eq.${data.userId},actor_id.eq.${data.userId}`)
      .order("created_at", { ascending: false })
      .range(data.offset, data.offset + data.limit - 1);
    if (error) throw new Error(error.message);
    return { rows: rows ?? [], total: count ?? 0 };
  });

/**
 * Suspender/reativar login via auth.admin.updateUserById.
 * Guardrail: não pode suspender a si mesmo. Gate: superadmin/support.
 */
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
    assertRole(adminRole, [...ROLE_ACTIONS.userManagement], "suspender/reativar usuários");
    return adminAction({
      context: { userId: context.userId, adminRole },
      action: data.banned ? "user_suspended" : "user_reactivated",
      targetType: "user",
      targetId: data.userId,
      metadata: { banned: data.banned, duration: data.banned ? data.duration : "none" },
      run: async () => {
        if (data.userId === context.userId)
          throw new Error("Você não pode suspender a si mesmo.");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        // GoTrue parseia ban_duration como Go duration (unidade máxima: h).
        // "7d"/"permanent" são inválidos lá ("time: invalid duration") — mapeia aqui.
        const BAN_DURATION_GO: Record<string, string> = {
          "24h": "24h",
          "7d": "168h",
          permanent: "87600h", // ~10 anos = banimento permanente no MVP
        };
        const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, {
          ban_duration: data.banned ? BAN_DURATION_GO[data.duration] : "none",
        });
        if (error) throw new Error(error.message);
        // O trigger on_auth_user_updated espelha banned_until em profiles:
        // o badge "suspenso" no portal atualiza no próximo invalidate.
        return { ok: true };
      },
    });
  });

/**
 * Remover usuário de uma org (delete da membership, auditado).
 * Gate: superadmin/support.
 */
export const removeUserFromOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid(), orgId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    assertRole(adminRole, [...ROLE_ACTIONS.userManagement], "remover usuário de org");
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

/**
 * Gerar link de recuperação de senha (email vem de `profiles`, O(1)).
 * Gate: superadmin/support. Link retornado 1x pro admin repassar
 * (sem infra de email no MVP).
 */
export const generateRecoveryLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ userId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    assertRole(adminRole, [...ROLE_ACTIONS.userManagement], "gerar link de recuperação");
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

/**
 * Convidar admin da plataforma: lookup O(1) em `profiles`; se existe,
 * promove direto; se não, cria token de convite com expiração 7d.
 * Gate: somente superadmin (gestão de admins). O papel escolhido na UI
 * chega via `role` — nunca mais hardcodado.
 */
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
    assertRole(adminRole, [...ROLE_ACTIONS.adminManagement], "convidar admins");
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

/**
 * Info pública do convite (o token É a credencial): a página de aceite
 * usa pra decidir o fluxo SEM expor nada além do que o token já permite.
 * status: open | accepted | revoked | expired | not_found.
 * accountExists via profiles (espelho exposto via PostgREST).
 */
export const getPlatformAdminInviteInfo = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite, error } = await supabaseAdmin
      .from("platform_admin_invites")
      .select("email, role, expires_at, accepted_at, accepted_by")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invite) return { status: "not_found" as const };
    if (invite.accepted_at && invite.accepted_by) return { status: "accepted" as const };
    if (invite.accepted_at && !invite.accepted_by) return { status: "revoked" as const };
    if (new Date(invite.expires_at).getTime() < Date.now())
      return { status: "expired" as const };
    // Conta já existe pra este email? (profiles espelha auth.users via trigger)
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", invite.email.toLowerCase())
      .maybeSingle();
    return {
      status: "open" as const,
      email: invite.email,
      role: invite.role,
      expiresAt: invite.expires_at,
      accountExists: !!existing,
    };
  });

/**
 * Aceite pra email NOVO (público): o token é a credencial, NÃO exige login
 * (login seria beco sem saída — a conta não existe ainda). Cria auth user
 * confirmado + platform_admin + marca aceite. O cliente então loga com
 * email+senha recém-definida pra obter sessão.
 */
export const acceptPlatformAdminInviteNew = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: z.string().uuid(), password: z.string().min(12) }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite, error } = await supabaseAdmin
      .from("platform_admin_invites")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invite) throw new Error("Convite não encontrado.");
    if (invite.accepted_at && invite.accepted_by) throw new Error("Convite já foi aceito.");
    if (invite.accepted_at && !invite.accepted_by)
      throw new Error("Convite revogado por um administrador.");
    if (new Date(invite.expires_at).getTime() < Date.now())
      throw new Error("Convite expirado.");
    // Se uma conta surgiu entre o convite e o aceite, cai no fluxo de login.
    const { data: existing } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("email", invite.email.toLowerCase())
      .maybeSingle();
    if (existing)
      throw new Error("Este e-mail já possui conta. Faça login e abra o convite novamente.");

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
      metadata: { role: invite.role, path: "new_user" },
    });
    return { ok: true, email: invite.email };
  });

/**
 * Aceite pra email JÁ EXISTENTE (autenticado): sessão deve bater com o
 * email do convite; promove via upsert e marca aceite. Auditado.
 */
export const acceptPlatformAdminInviteExisting = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: invite, error } = await supabaseAdmin
      .from("platform_admin_invites")
      .select("*")
      .eq("token", data.token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!invite) throw new Error("Convite não encontrado.");
    if (invite.accepted_at && invite.accepted_by) throw new Error("Convite já foi aceito.");
    if (invite.accepted_at && !invite.accepted_by)
      throw new Error("Convite revogado por um administrador.");
    if (new Date(invite.expires_at).getTime() < Date.now())
      throw new Error("Convite expirado.");
    const { data: sessionUser } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const sessionEmail = sessionUser.user?.email?.toLowerCase();
    if (invite.email.toLowerCase() !== sessionEmail)
      throw new Error("Email do convite não corresponde à sua sessão.");

    const { error: adminErr } = await supabaseAdmin.from("platform_admins").upsert(
      { user_id: context.userId, role: invite.role, active: true },
      { onConflict: "user_id" },
    );
    if (adminErr) throw new Error(adminErr.message);

    const { error: updateErr } = await supabaseAdmin
      .from("platform_admin_invites")
      .update({ accepted_at: new Date().toISOString(), accepted_by: context.userId })
      .eq("token", data.token);
    if (updateErr) throw new Error(updateErr.message);

    await recordAdminAudit({
      actorId: context.userId,
      action: "platform_admin_invite_accepted",
      targetType: "platform_admin_invite",
      targetId: invite.id,
      metadata: { role: invite.role, path: "existing_user" },
    });
    return { ok: true };
  });

/**
 * Promover usuário existente a admin da plataforma (lookup O(1) em profiles).
 * Gate: somente superadmin.
 */
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
    assertRole(adminRole, [...ROLE_ACTIONS.adminManagement], "promover usuários a admin");
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

/**
 * Revogar convite pendente (marca accepted_at sem accepted_by = morto,
 * e a rota de aceite distingue "revogado" de "aceito" por essa assinatura).
 * Gate: somente superadmin.
 */
export const revokeInvite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ inviteId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    assertRole(adminRole, [...ROLE_ACTIONS.adminManagement], "revogar convites");
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
 * Lista convites PENDENTES de admin da plataforma (DT-03): não aceitos
 * (accepted_at null), com flag `expired` calculada server-side pra UI
 * distinguir "aguardando" de "expirado", e `invited_by_name` (batch em
 * profiles, 1 query) pra coluna "Convidado por" da tabela de convites.
 * Inclui token pra UI oferecer "copiar link" (sem infra de email, o link
 * é o canal de entrega).
 */
export const listPendingInvites = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("platform_admin_invites")
      .select("id, token, email, role, expires_at, created_at, invited_by")
      .is("accepted_at", null)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    // Quem convidou (nome/email) em batch — 1 query, sem N+1
    const inviterIds = [...new Set((data ?? []).map((i) => i.invited_by))];
    let inviterMap = new Map<string, string>();
    if (inviterIds.length > 0) {
      const { data: inviters } = await supabaseAdmin
        .from("profiles")
        .select("id, email, full_name")
        .in("id", inviterIds);
      for (const p of inviters ?? []) {
        inviterMap.set(p.id, p.full_name ?? p.email);
      }
    }

    const now = Date.now();
    return (data ?? []).map((i) => ({
      id: i.id,
      token: i.token,
      email: i.email,
      role: i.role,
      expires_at: i.expires_at,
      created_at: i.created_at,
      invited_by_name: inviterMap.get(i.invited_by) ?? "—",
      expired: new Date(i.expires_at).getTime() < now,
    }));
  });
