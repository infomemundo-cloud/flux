import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { assertMember } from "@/lib/demandas/demandas-guard";

/**
 * Perfis dos membros da org com nome real + foto do provedor de login
 * (Google OAuth traz `full_name` e `avatar_url` no user_metadata).
 *
 * IMPORTANTE: mora em arquivo de lib, NUNCA em arquivo de rota — server
 * functions criadas dentro de rotas com code-splitting do TanStack
 * (`tsr-split`) não entram no manifest do servidor e explodem em runtime
 * com "Cannot read properties of undefined (reading 'method')".
 *
 * Fallbacks: nome → prefixo do e-mail → pedaço do UUID; foto → null (iniciais).
 */
export const listMemberProfiles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertMember(context.supabase, data.orgId, context.userId);
    const { data: mems, error } = await context.supabase
      .from("memberships")
      .select("user_id, role")
      .eq("org_id", data.orgId);
    if (error) throw new Error(error.message);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const profiles = await Promise.all(
      (mems ?? []).map(async (m) => {
        const { data: u } = await supabaseAdmin.auth.admin.getUserById(m.user_id);
        const meta = (u.user?.user_metadata ?? {}) as Record<string, unknown>;
        const email = u.user?.email ?? null;
        const name =
          (typeof meta.full_name === "string" && meta.full_name) ||
          (typeof meta.name === "string" && meta.name) ||
          (email ? email.split("@")[0] : `Usuário ${m.user_id.slice(0, 6)}`);
        const avatar_url =
          (typeof meta.avatar_url === "string" && meta.avatar_url) ||
          (typeof meta.picture === "string" && meta.picture) ||
          null;
        return { user_id: m.user_id, role: m.role as string, email, name: name as string, avatar_url };
      }),
    );
    return profiles;
  });
