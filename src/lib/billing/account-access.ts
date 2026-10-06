import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Fase 3 + 4.2 — fundação de acesso (autoridade 100% backend, diretriz §5).
 * effective_state: 'active' (grandfathered | pago) | 'trial' | 'grace' | 'suspended'
 * access_level:    'full' | 'readonly' | 'blocked'
 *
 * Fase 4.2: a matriz D17 vive no SQL (view org_access_effective) — fonte
 * única pra ingest, sends, createDemanda, banner, página Tenants e (4.4+)
 * o processador de webhooks MP. Com `subscriptions` vazia, a view replica
 * EXATAMENTE a derivação de trial da Fase 3 (regressão zero por construção):
 *   trial_ends_at NULL → active/full · now < ends → trial/full ·
 *   ends ≤ now < ends+7d → grace/readonly · senão suspended/blocked.
 * Com subscription, a view aplica a matriz D17 (active/past_due → full ·
 * grace_period → readonly · suspended/canceled_by_dunning → blocked ·
 * canceled_by_user no período → full, pós-período → blocked).
 *
 * Memo 60s/org (diretriz v2.4): o gate roda no caminho quente do ingest —
 * 1 SELECT/min/org. Transição de estado aceita até 60s de latência.
 * Corretude NUNCA depende do memo (a view/banco é a fonte de verdade).
 */
export type AccountAccess = {
  effective_state: "active" | "trial" | "grace" | "suspended";
  access_level: "full" | "readonly" | "blocked";
  trial_ends_at: string | null;
  days_left: number | null;
};

const accessMemo = new Map<string, { at: number; value: AccountAccess }>();
const ACCESS_MEMO_TTL = 60_000;

/**
 * Resolver acesso de uma org — usado pelo ingest (autenticado por token)
 * e pelo serverFn público (autenticado por sessão).
 * Fase 4.2: lê a view org_access_effective (1 query; service role — a view
 * é revogada de anon/authenticated, então só o servidor a enxerga).
 */
export async function resolveAccountAccess(
  admin: any,
  orgId: string,
  force = false,
): Promise<AccountAccess> {
  const hit = accessMemo.get(orgId);
  if (!force && hit && Date.now() - hit.at < ACCESS_MEMO_TTL) return hit.value;

  const { data: row } = await admin
    .from("org_access_effective")
    .select("effective_state, access_level, days_left, trial_ends_at")
    .eq("org_id", orgId)
    .maybeSingle();

  let value: AccountAccess;
  if (!row) {
    // Org inexistente = bloqueada (nunca "full" por ausência de dados).
    value = {
      effective_state: "suspended",
      access_level: "blocked",
      trial_ends_at: null,
      days_left: null,
    };
  } else {
    value = {
      // effective_state na view é text (case SQL) → cast documentado (§7):
      // o case só produz os 4 rótulos do union, garantido pela matriz D17.
      effective_state: row.effective_state as AccountAccess["effective_state"],
      access_level: row.access_level,
      trial_ends_at: row.trial_ends_at,
      days_left: row.days_left,
    };
  }
  accessMemo.set(orgId, { at: Date.now(), value });
  return value;
}

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
