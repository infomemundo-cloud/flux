import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

export const listMyOrgs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("memberships")
      .select("role, organizations:org_id(id, name, slug, created_at)")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return (data ?? []).map((m: any) => ({
      role: m.role as string,
      org: m.organizations,
    })).filter((x) => x.org);
  });

const slugify = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 40) || "org";

export const createOrg = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().min(2).max(80) }).parse(d))
  .handler(async ({ data, context }) => {
    const base = slugify(data.name);
    let slug = base;
    for (let i = 0; i < 8; i++) {
      const { data: existing } = await context.supabase.from("organizations").select("id").eq("slug", slug).maybeSingle();
      if (!existing) break;
      slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
    }
    const { data: org, error } = await context.supabase
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
      .from("organizations").select("id, name, slug").eq("slug", data.slug).maybeSingle();
    if (error) throw new Error(error.message);
    if (!org) throw new Error("Organização não encontrada");
    const { data: mem } = await context.supabase
      .from("memberships").select("role").eq("org_id", org.id).eq("user_id", context.userId).maybeSingle();
    if (!mem) throw new Error("Sem acesso");
    return { ...org, role: mem.role as string };
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
    // Enrich with email via admin
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const enriched = await Promise.all(
      (rows ?? []).map(async (r) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(r.user_id);
        return { ...r, email: u.user?.email ?? null };
      }),
    );
    return enriched;
  });