import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Server functions de organização (tenant).
 * - Leitura/lista: client de usuário (context.supabase), baseado em membership.
 * - Criação: supabaseAdmin (onboarding) com unicidade de slug.
 * - Identidade (nome/logo): supabaseAdmin + guard explícito owner/admin
 *   (defesa em profundidade; slug é IMUTÁVEL por decisão de produto).
 * - Exclusão: owner-only com confirmação re-validada no servidor (RPC atômica).
 * - Ingestão de grupos: setAllowGroupIngest (owner/admin).
 * - SLA de inatividade: updateSlaSettings (owner/admin) — regra consumida
 *   pela query slaAlerts, badge da sidebar e página de Alertas.
 * - Distribuição automática: updateAutoAssignSettings (owner/admin) — regra
 *   consumida pelo serviço em src/lib/demandas/assignment.ts, chamado pelo ingest.
 */

export const listMyOrgs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("memberships")
      .select("role, organizations:org_id(id, name, slug, logo_url, created_at)")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? [])
      .map((m: any) => ({
        role: m.role as string,
        org: m.organizations,
      }))
      .filter((x) => x.org);
  });

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 40) || "org";

export const createOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().min(2).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const base = slugify(data.name);
    let slug = base;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    for (let i = 0; i < 8; i++) {
      const { data: existing } = await supabaseAdmin
        .from("organizations")
        .select("id")
        .eq("slug", slug)
        .maybeSingle();
      if (!existing) break;
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }
    const { data: org, error } = await supabaseAdmin
      .from("organizations")
      .insert({ name: data.name, slug, created_by: context.userId })
      .select("id, name, slug")
      .single();
    if (error) throw new Error(error.message);
    return org;
  });

export const getOrgBySlug = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ slug: z.string() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: org, error } = await context.supabase
      .from("organizations")
      .select(
        "id, name, slug, logo_url, allow_group_ingest, sla_enabled, sla_max_inactivity_hours, auto_assign_enabled, auto_assign_mode, last_assigned_user_id",
      )
      .eq("slug", data.slug)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!org) throw new Error("Organização não encontrada");
    const { data: mem } = await context.supabase
      .from("memberships")
      .select("role")
      .eq("org_id", org.id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!mem) throw new Error("Sem acesso");
    return { ...org, role: mem.role as string, userId: context.userId };
  });

export const listMembers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await context.supabase
      .from("memberships")
      .select("id, user_id, role, created_at")
      .eq("org_id", data.orgId)
      .order("created_at");
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const enriched = await Promise.all(
      (rows ?? []).map(async (r) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
        return { ...r, email: u.user?.email ?? null };
      }),
    );
    return enriched;
  });

export const listOperators = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: mem } = await context.supabase
      .from("memberships")
      .select("role")
      .eq("org_id", data.orgId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!mem) throw new Error("Sem acesso");
    const { data: rows, error } = await context.supabase
      .from("memberships")
      .select("user_id, role")
      .eq("org_id", data.orgId)
      .in("role", ["owner", "admin", "gerente", "operador", "agente_ia"]);
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const enriched = await Promise.all(
      (rows ?? []).map(async (r: any) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
        return { user_id: r.user_id, role: r.role as string, email: u.user?.email ?? null };
      }),
    );
    return enriched;
  });

// ============================================================================
// Identidade da organização: nome + logotipo (slug é IMUTÁVEL por decisão)
// ============================================================================

async function assertOrgAdmin(
  supabase: any,
  orgId: string,
  userId: string,
): Promise<void> {
  const { data: mem } = await supabase
    .from("memberships")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!mem || !["owner", "admin"].includes(mem.role)) {
    throw new Error("Sem permissão para editar a organização");
  }
}

const LOGO_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/svg+xml": "svg",
  "image/webp": "webp",
};

export const uploadOrgLogo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        fileBase64: z.string().min(1),
        mimeType: z.enum(["image/png", "image/jpeg", "image/svg+xml", "image/webp"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOrgAdmin(context.supabase, data.orgId, context.userId);

    const base64 = data.fileBase64.replace(/^data:[^;]+;base64,/, "");
    const buffer = Buffer.from(base64, "base64");
    if (buffer.length > 2 * 1024 * 1024) {
      throw new Error("Arquivo excede o limite de 2MB.");
    }

    const path = `orgs/${data.orgId}/logo-${Date.now()}.${LOGO_EXT[data.mimeType]}`;
    const { error } = await supabaseAdmin.storage
      .from("org-assets")
      .upload(path, buffer, { contentType: data.mimeType, upsert: false });
    if (error) throw new Error(`Falha ao enviar logotipo: ${error.message}`);

    const { data: urlData } = supabaseAdmin.storage.from("org-assets").getPublicUrl(path);
    return { ok: true, url: urlData.publicUrl };
  });

export const updateOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        name: z.string().trim().min(1).max(120),
        logoUrl: z.string().url().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOrgAdmin(context.supabase, data.orgId, context.userId);

    const { data: before } = await supabaseAdmin
      .from("organizations")
      .select("logo_url")
      .eq("id", data.orgId)
      .maybeSingle();

    const { error } = await supabaseAdmin
      .from("organizations")
      .update({ name: data.name, logo_url: data.logoUrl })
      .eq("id", data.orgId);
    if (error) throw new Error(error.message);

    const oldUrl = before?.logo_url ?? null;
    if (oldUrl && oldUrl !== data.logoUrl) {
      const path = oldUrl.split("/org-assets/")[1];
      if (path) {
        await supabaseAdmin.storage.from("org-assets").remove([path]);
      }
    }
    return { ok: true };
  });

export const deleteOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        confirm: z.string().trim().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: mem } = await context.supabase
      .from("memberships")
      .select("role")
      .eq("org_id", data.orgId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!mem || mem.role !== "owner") {
      throw new Error("Sem permissão: apenas o owner pode excluir a organização");
    }

    const { data: org } = await supabaseAdmin
      .from("organizations")
      .select("name, slug")
      .eq("id", data.orgId)
      .maybeSingle();
    if (!org) throw new Error("Organização não encontrada");
    if (data.confirm !== org.name && data.confirm !== org.slug) {
      throw new Error("Confirmação não confere com o nome ou slug da organização");
    }

    const { error } = await supabaseAdmin.rpc("delete_organization_cascade", {
      p_org_id: data.orgId,
    });
    if (error) throw new Error(error.message);

    return { ok: true };
  });

// ============================================================================
// Regras de ingestão: atendimento em grupos (@g.us)
// ============================================================================

export const setAllowGroupIngest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        enabled: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOrgAdmin(context.supabase, data.orgId, context.userId);

    const { error } = await supabaseAdmin
      .from("organizations")
      .update({ allow_group_ingest: data.enabled })
      .eq("id", data.orgId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

// ============================================================================
// Regras de atendimento: SLA de inatividade (autosave por campo)
// ============================================================================

const SLA_HOURS = [1, 4, 8, 24, 48, 168] as const;

export const updateSlaSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        enabled: z.boolean().optional(),
        maxInactivityHours: z
          .number()
          .int()
          .refine((h) => (SLA_HOURS as readonly number[]).includes(h), {
            message: "Valor de SLA inválido (use 1, 4, 8, 24, 48 ou 168 horas)",
          })
          .optional(),
      })
      .refine((v) => v.enabled !== undefined || v.maxInactivityHours !== undefined, {
        message: "Nada para atualizar",
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOrgAdmin(context.supabase, data.orgId, context.userId);

    const patch: { sla_enabled?: boolean; sla_max_inactivity_hours?: number } = {};
    if (data.enabled !== undefined) patch.sla_enabled = data.enabled;
    if (data.maxInactivityHours !== undefined)
      patch.sla_max_inactivity_hours = data.maxInactivityHours;

    const { error } = await supabaseAdmin
      .from("organizations")
      .update(patch)
      .eq("id", data.orgId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });

// ============================================================================
// Regras de atendimento: Distribuição automática (Plano Pro — gating futuro)
// ============================================================================

const ASSIGNMENT_MODES = ["round_robin", "least_busy"] as const;

export const updateAutoAssignSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        enabled: z.boolean().optional(),
        mode: z.enum(ASSIGNMENT_MODES).optional(),
      })
      .refine((v) => v.enabled !== undefined || v.mode !== undefined, {
        message: "Nada para atualizar",
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertOrgAdmin(context.supabase, data.orgId, context.userId);

    const patch: { auto_assign_enabled?: boolean; auto_assign_mode?: string } = {};
    if (data.enabled !== undefined) patch.auto_assign_enabled = data.enabled;
    if (data.mode !== undefined) patch.auto_assign_mode = data.mode;

    const { error } = await supabaseAdmin
      .from("organizations")
      .update(patch)
      .eq("id", data.orgId);
    if (error) throw new Error(error.message);

    return { ok: true };
  });