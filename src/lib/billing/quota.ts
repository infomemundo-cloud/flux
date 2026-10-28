import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Fase 4.9 / DT-09 Parte 2 — Cota de mensagens por período de cobrança (D1).
 *
 * POLÍTICA (D1, fechada 2026-10-28): estouro de cota = bloqueio SOFT de
 * RECEBIMENTO de demandas NOVAS; envio ativo e histórico permanecem
 * intactos; demandas existentes continuam recebendo (continuação de
 * conversa nunca é punida).
 *
 * JANELA DE APURAÇÃO (matriz D1):
 *   1. Subscription viva (active/grace_period/past_due) → current_period_start..end;
 *   2. Sem subscription e com trial → trial_ends_at - 7d .. trial_ends_at (tier 'free');
 *   3. Sem período resolvível (grandfathered, ex.: MK) → FAIL-OPEN (nunca enforce).
 *
 * TETO: lido de `tiers.limits->>'messages_mes'` NO BANCO em runtime — o
 * portal /platform_admin/tiers edita limits em produção (updateTier);
 * constante TS driftaria silenciosamente.
 *
 * CONTAGEM: COUNT em demanda_events (kind message_in/message_out) na
 * janela. Zero migration, zero coluna, zero tabela (decisão registrada).
 *
 * MEMO 60s/org (diretriz v2.4): 1 COUNT/min/org no caminho quente do
 * ingest. Corretude NUNCA depende do memo (o banco é a fonte de verdade).
 *
 * FAIL-OPEN em qualquer falha de leitura (org sem período, teto ausente,
 * erro de COUNT): cota é gate comercial, não de integridade — falha de
 * métrica nunca pode derrubar webhook ou envio.
 */

export type MessageQuota = {
  /** false = org fora do enforcement (grandfathered / sem período / sem teto). */
  enforced: boolean;
  /** current < limit (sempre true quando enforced=false). */
  allowed: boolean;
  current: number;
  limit: number | null;
  /** 0-999 (capado pra UI não quebrar em estouro grande). */
  percentage: number;
  windowStart: string | null;
  windowEnd: string | null;
  tierCode: string | null;
};

const quotaMemo = new Map<string, { at: number; value: MessageQuota }>();
const QUOTA_MEMO_TTL = 60_000;
const TRIAL_DAYS = 7;

const NOT_ENFORCED: MessageQuota = {
  enforced: false,
  allowed: true,
  current: 0,
  limit: null,
  percentage: 0,
  windowStart: null,
  windowEnd: null,
  tierCode: null,
};

export async function checkMessageQuota(
  admin: any,
  orgId: string,
  force = false,
): Promise<MessageQuota> {
  const hit = quotaMemo.get(orgId);
  if (!force && hit && Date.now() - hit.at < QUOTA_MEMO_TTL) return hit.value;

  const memo = (value: MessageQuota) => {
    quotaMemo.set(orgId, { at: Date.now(), value });
    return value;
  };

  // ── 1. Janela de cobrança + tier ─────────────────────────────────
  const { data: sub } = await admin
    .from("subscriptions")
    .select("plan_code, state, current_period_start, current_period_end")
    .eq("org_id", orgId)
    .in("state", ["active", "grace_period", "past_due"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let tierCode: string;
  let windowStart: Date;
  let windowEnd: Date | null;

  if (sub) {
    // Subscription viva: período real de cobrança (upgrade ancora novo período).
    if (!sub.current_period_start) {
      // Período não ancorado (edge de criação): não bloqueia por falta de dado.
      console.warn("[quota] subscription sem current_period_start — fail-open", {
        orgId,
        subscriptionId: sub.id,
      });
      return memo(NOT_ENFORCED);
    }
    tierCode = sub.plan_code;
    windowStart = new Date(sub.current_period_start);
    windowEnd = sub.current_period_end ? new Date(sub.current_period_end) : null;
  } else {
    // Sem subscription: trial (janela de 7 dias ancorada em trial_ends_at).
    const { data: org } = await admin
      .from("organizations")
      .select("trial_ends_at")
      .eq("id", orgId)
      .maybeSingle();
    const ends = org?.trial_ends_at ? new Date(org.trial_ends_at) : null;
    if (!ends) {
      // Grandfathered (trial_ends_at NULL, ex.: MK) ou org sem período:
      // nunca enforce (decisão registrada — não bloquear tester legado).
      return memo(NOT_ENFORCED);
    }
    tierCode = "free";
    windowStart = new Date(ends.getTime() - TRIAL_DAYS * 86_400_000);
    windowEnd = ends;
  }

  // ── 2. Teto: banco é a fonte de verdade (portal edita tiers.limits) ──
  const { data: tier } = await admin
    .from("tiers")
    .select("limits")
    .eq("code", tierCode)
    .maybeSingle();
  // Cast documentado (§7): limits é jsonb sem tipo forte no types gerado.
  const rawLimit = (tier?.limits as any)?.messages_mes;
  const limit = typeof rawLimit === "number" && rawLimit > 0 ? rawLimit : null;
  if (limit === null) {
    // Tier sem cota configurada (ou tier inexistente): não enforce.
    return memo(NOT_ENFORCED);
  }

  // ── 3. Consumo: eventos de mensagem na janela ──────────────────────
  let q = admin
    .from("demanda_events")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .in("kind", ["message_in", "message_out"])
    .gte("created_at", windowStart.toISOString());
  if (windowEnd) q = q.lt("created_at", windowEnd.toISOString());

  const { count, error } = await q;
  if (error) {
    // Falha de métrica nunca derruba webhook/envio: fail-open + log.
    console.error("[quota] count failed — fail-open", { orgId, message: error.message });
    return memo(NOT_ENFORCED);
  }

  const current = count ?? 0;
  return memo({
    enforced: true,
    allowed: current < limit,
    current,
    limit,
    percentage: Math.min(999, Math.round((current / limit) * 100)),
    windowStart: windowStart.toISOString(),
    windowEnd: windowEnd ? windowEnd.toISOString() : null,
    tierCode,
  });
}

/**
 * Server function pra UI (banner escalonado 80/95/100 — D1).
 * Guard de membership idêntico ao getAccountAccess: cota de uma org só
 * vaza pra membro dela (diretriz §5). O ingest NÃO usa esta fn — chama
 * checkMessageQuota direto (auth lá é o token, não a sessão).
 */
export const getMessageQuota = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: membership } = await supabaseAdmin
      .from("memberships")
      .select("id")
      .eq("org_id", data.orgId)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!membership) throw new Error("Sem acesso a esta organização.");
    return checkMessageQuota(supabaseAdmin, data.orgId);
  });
