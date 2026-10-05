import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Fase 3 — fundação de acesso (autoridade 100% backend, diretriz §5).
 *
 * effective_state: 'active' (grandfathered | pago Fase 4) | 'trial' | 'grace' | 'suspended'
 * access_level:    'full' | 'readonly' | 'blocked'
 *
 * Regra de negócio: readonly/blocked barram message_in NOVO (ingest) e
 * envio (tenant). contacts.update segue liberado (sincronização de perfil
 * não é operação de negócio).
 *
 * Política de trial (migration 20261005120000):
 * - orgs pré-billing com trial_ends_at NULL = grandfathered ('active', full);
 * - inserts novos ganham now()+7d via default de coluna;
 * - grace = +7d após o fim do trial (readonly); depois, suspended (blocked).
 *
 * Memo 60s/org (diretriz v2.4): o gate roda no caminho quente do ingest —
 * 1 SELECT/min/org. Transição de estado aceita até 60s de latência.
 * Corretude NUNCA depende do memo (banco é a fonte de verdade).
 */
export type AccountAccess = {
  effective_state: "active" | "trial" | "grace" | "suspended";
  access_level: "full" | "readonly" | "blocked";
  trial_ends_at: string | null;
  days_left: number | null;
};

const GRACE_MS = 7 * 86400_000;
const DAY_MS = 86400_000;

const accessMemo = new Map<string, { at: number; value: AccountAccess }>();
const ACCESS_MEMO_TTL = 60_000;

/**
 * Resolver acesso de uma org — usado pelo ingest (autenticado por token)
 * e pelo serverFn público (autenticado por sessão).
 */
export async function resolveAccountAccess(
  admin: any,
  orgId: string,
  force = false,
): Promise<AccountAccess> {
  const hit = accessMemo.get(orgId);
  if (!force && hit && Date.now() - hit.at < ACCESS_MEMO_TTL) return hit.value;

  const { data: org } = await admin
    .from("organizations")
    .select("trial_ends_at")
    .eq("id", orgId)
    .maybeSingle();

  let value: AccountAccess;
  if (!org) {
    // Org inexistente = bloqueada (nunca "full" por ausência de dados).
    value = {
      effective_state: "suspended",
      access_level: "blocked",
      trial_ends_at: null,
      days_left: null,
    };
  } else {
    // EXTENSION POINT (Fase 4.2): subscription ativa/past_due/cancelada
    // sobrescreve ANTES do clock de trial; a view org_access_effective
    // encapsulará esta mesma lógica no SQL.
    const t = org.trial_ends_at as string | null;
    if (t == null) {
      value = {
        effective_state: "active",
        access_level: "full",
        trial_ends_at: null,
        days_left: null,
      };
    } else {
      const end = new Date(t).getTime();
      const now = Date.now();
      if (now < end) {
        value = {
          effective_state: "trial",
          access_level: "full",
          trial_ends_at: t,
          days_left: Math.ceil((end - now) / DAY_MS),
        };
      } else if (now < end + GRACE_MS) {
        value = {
          effective_state: "grace",
          access_level: "readonly",
          trial_ends_at: t,
          days_left: Math.ceil((end + GRACE_MS - now) / DAY_MS),
        };
      } else {
        value = {
          effective_state: "suspended",
          access_level: "blocked",
          trial_ends_at: t,
          days_left: 0,
        };
      }
    }
  }
  accessMemo.set(orgId, { at: Date.now(), value });
  return value;
}

/**
 * Server function pra UI (banner de acesso / countdown de trial).
 * Fase 3: guard simples — exige user logado E membro da org consultada
 * (tabela `memberships`). O ingest NÃO usa esta fn — usa resolveAccountAccess
 * direto (autenticação lá é o token, não a sessão).
 */
/**
 * Server function pra UI (banner de acesso / countdown de trial).
 * Guard de membership: estado de billing de uma org só vaza pra membro dela
 * (diretriz §5). O ingest NÃO usa esta fn — usa resolveAccountAccess direto
 * (autenticação lá é o token, não a sessão).
 * Padrão idêntico ao listWebhookLogs: middleware requireSupabaseAuth +
 * supabaseAdmin via import dinâmico + context.userId pra gate.
 */
export const getAccountAccess = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: membership } = await supabaseAdmin
      .from("memberships")
      .select("id")
      .eq("org_id", data.orgId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!membership) throw new Error("Sem acesso a esta organização.");
    return resolveAccountAccess(supabaseAdmin, data.orgId);
  });
