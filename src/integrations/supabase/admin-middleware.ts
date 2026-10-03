export type PlatformAdminRole = "superadmin" | "support" | "billing" | "viewer";

/**
 * Gate de AUTORIZAÇÃO do platform_admin (D7/D8): helper server-side chamado
 * no início de cada server function de admin. Explícito > middleware mágico:
 * à prova de mudanças de API do createMiddleware do TanStack Start (a forma
 * { type: "server" } não existe na 1.168.x) e sem casts de context.
 *
 * Lança erro quando o usuário não tem linha ATIVA em platform_admins.
 * A consulta usa service role porque platform_admins tem RLS default-deny
 * (sem policies → anon/authenticated não leem nada; service role bypassa).
 *
 * IMPORT DINÂMICO de client.server: este arquivo é alcançado pelo bundle
 * client (platform-admin.functions o importa e as rotas do shell/login
 * importam as server functions) — o plugin import-protection do TanStack
 * Start veta import estático de *.server.* nesse caminho.
 */
export async function assertPlatformAdmin(userId: string): Promise<PlatformAdminRole> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: admin, error } = await supabaseAdmin
    .from("platform_admins")
    .select("role")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!admin) throw new Error("Acesso restrito ao administrador da plataforma.");
  return admin.role as PlatformAdminRole;
}
