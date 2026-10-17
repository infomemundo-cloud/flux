/**
 * Fase 4.5/4.6 — Processador de eventos de billing (Mercado Pago).
 * Pipeline: billing_events(received) → pull no MP → resolve org → transição D17 →
 * upsert subscriptions → mark processed. O webhook é gatilho; a verdade é o pull.
 *
 * CORREÇÃO 2026-10-12 (pós ciclo de testes compra+cancelamento):
 * ORDEM: subscription existente é a fonte da org; intent/UUID só para CRIAÇÃO.
 * (Eventos de ciclo de vida — cancelled/paused/renewal — não morrem mais em
 * org_unresolved_no_intent depois que o intent foi consumido.)
 *
 * sweepAuthorizedPayments DEFINIDO (estava chamado mas não existia).
 * applyPreapprovalTransition recebe o pull inteiro (status + períodos).
 * retry NÃO grava status='retry': mantém 'received' + attempts++ (zumbi-gate).
 * Claim condicional .eq('status','received') restaurado no mark final.
 *
 * ITEM 2 DA FASE 4.6 (Inadimplência - 2026-10-13):
 * GAP G1 CORRIGIDO: `paused` no Preapproval agora mapeia para `past_due`
 * (inadimplência real), não mais para `grace_period`. Isso permite bloqueio
 * imediato conforme política SaaS padrão quando o MP suspende por falha recorrente.
 *
 * GAP G2 CORRIGIDO: `rejected`/`cancelled` no Authorized Payment agora
 * transicionam a subscription viva para `past_due`, em vez de serem ignorados
 * silenciosamente. Estados intermediários (`in_process`) apenas logam.
 *
 * HOTFIX FASE 4.7.A (Renovação Automática - 2026-10-16):
 * GAP G3 CORRIGIDO: Quando chega `subscription_authorized_payment` com
 * status=`approved` E a subscription JÁ ESTAVA `active` (cenário de renovação
 * recorrente sem webhook de preapproval), fazemos um REFRESH leve consultando
 * GET /preapproval/{id} para obter o novo `next_payment_date` e atualizar
 * current_period_start/end no banco. Sem isso, as datas ficariam congeladas
 * na criação original para sempre.
 *
 * FASE 4.7 ITEM 1 (Troca de Tier - 2026-10-18):
 * • Detecta preapproval de troca via external_reference = switch:<transition_id>.
 * • Fallback: billing_checkout_intents.mp_preapproval_id + transition_id not null.
 * • Chama billing_complete_tier_switch(...) de forma atômica/idempotente.
 * • Eventos de troca NÃO caem no fluxo normal de upsert de subscription.
 * • Assinaturas antigas em canceled_by_upgrade nunca são reativadas por webhook.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getPreapproval,
  mpTokenFor,
  MpApiError,
  parseTierSwitchExternalReference,
  type PreapprovalPull,
} from "./mp-api";

export type ProcessOutcome = "processed" | "ignored" | "retry" | "failed";

interface EventRow {
  id: string;
  mp_event_id: string;
  topic: string;
  action: string;
  live_mode: boolean;
  payload: Record<string, unknown>;
  status: string;
  attempts: number;
}

// ✅ ATUALIZAÇÃO GAP G1/G2: Adicionado 'past_due' à união de tipos permitidos
export interface SubscriptionPatch {
  state:
    | "active"
    | "grace_period"
    | "past_due"
    | "canceled_by_user"
    | "canceled_by_dunning";
  current_period_start?: string | null;
  current_period_end?: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_ATTEMPTS = 10;
const INTENT_WINDOW_H = 24;
const SWEEP_WINDOW_H = 2;
const SWEEP_CAP = 10;

/** Anti-drift: espelho reverso de PLAN_IDS_TEST (mp-checkout.functions.ts). */
const PLAN_ID_TO_TIER: Record<string, string> = {
  "2ae043b092704c96b1e67b4238295c43": "operacao",
  "67b0eca317cc4e00a03ba0654bd7ff64": "crescimento",
  "5899e7efc405436995ef18cfea544747": "escala",
};

// ============================================================================
// FASE 4.7 ITEM 1 — HELPERS DE TROCA DE TIER
// ============================================================================

export interface TierSwitchCompletionResult {
  outcome: string;
  retryable: boolean;
  transitionId: string | null;
  oldSubscriptionId: string | null;
  newSubscriptionId: string | null;
  alreadyCompleted: boolean;
}

export function isFatalTierSwitchOutcome(outcome: string): boolean {
  return (
    outcome === "multiple_live_subscriptions" ||
    outcome === "tier_not_found" ||
    outcome === "plan_code_unresolved" ||
    outcome === "transition_id_missing" ||
    outcome === "empty_rpc_result" ||
    outcome === "unknown" ||
    outcome.startsWith("rpc_fatal")
  );
}

/**
 * Resolve se um preapproval pertence a uma troca de tier.
 *
 * Caminho principal:
 *   external_reference = switch:<transition_id>
 *
 * Fallback defensivo:
 *   billing_checkout_intents.mp_preapproval_id = pull.id
 *   AND transition_id IS NOT NULL
 */
export async function resolveTierSwitchTransitionId(
  pull: PreapprovalPull,
): Promise<string | null> {
  const fromExternal = parseTierSwitchExternalReference(pull.external_reference);
  if (fromExternal) {
    return fromExternal;
  }

  const { data, error } = await supabaseAdmin
    .from("billing_checkout_intents")
    .select("transition_id")
    .eq("mp_preapproval_id", pull.id)
    .not("transition_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[mp-processor] tier_switch_intent_lookup_error", {
      preapprovalId: pull.id,
      error: error.message,
    });
    return null;
  }

  const transitionId = (data as { transition_id?: unknown } | null)
    ?.transition_id;

  return transitionId ? String(transitionId) : null;
}

/**
 * Executa a conclusão atômica da troca de tier via função SQL.
 *
 * Importante:
 * - não recria a lógica de troca no TypeScript;
 * - a função SQL é a autoridade da transação;
 * - resultados de negócio são mapeados para outcomes observáveis.
 */
export async function completeTierSwitchForTransition(
  pull: PreapprovalPull,
  transitionId: string,
): Promise<TierSwitchCompletionResult> {
  const normalizedTransitionId = String(transitionId ?? "").trim();

  const base: Omit<TierSwitchCompletionResult, "outcome" | "retryable"> = {
    transitionId: normalizedTransitionId || null,
    oldSubscriptionId: null,
    newSubscriptionId: null,
    alreadyCompleted: false,
  };

  if (!normalizedTransitionId) {
    return {
      ...base,
      outcome: "transition_id_missing",
      retryable: false,
    };
  }

  if (pull.status !== "authorized") {
    return {
      ...base,
      outcome: `not_authorized:${pull.status}`,
      retryable: pull.status === "pending",
    };
  }

  const planCode =
    PLAN_ID_TO_TIER[String(pull.preapproval_plan_id ?? "").trim()] ?? null;

  if (!planCode) {
    return {
      ...base,
      outcome: "plan_code_unresolved",
      retryable: false,
    };
  }

  const { data, error } = await supabaseAdmin.rpc(
      "billing_complete_tier_switch",
      {
        p_transition_id: normalizedTransitionId,
        p_new_mp_preapproval_id: String(pull.id),
        p_new_plan_code: planCode,
        p_period_start: pull.date_created ?? undefined,
        p_period_end: pull.next_payment_date ?? undefined,
        p_external_reference: pull.external_reference ?? undefined,
        p_preapproval_plan_id: pull.preapproval_plan_id ?? undefined,
      },
    );

  if (error) {
    const msg = error.message || "rpc_error";

    const fatalMarkers = [
      "transition_not_found",
      "old_subscription_not_found",
      "transition_org_mismatch",
      "_required",
    ];

    const retryable = !fatalMarkers.some((marker) => msg.includes(marker));

    return {
      ...base,
      outcome: retryable ? `rpc_retry:${msg}` : `rpc_fatal:${msg}`,
      retryable,
    };
  }

  const row = Array.isArray(data) ? data[0] : data;

  if (!row) {
    return {
      ...base,
      outcome: "empty_rpc_result",
      retryable: false,
    };
  }

  const r = row as {
    outcome?: unknown;
    transition_id?: unknown;
    old_subscription_id?: unknown;
    new_subscription_id?: unknown;
    already_completed?: unknown;
  };

  return {
    outcome: String(r.outcome ?? "unknown"),
    retryable: false,
    transitionId: r.transition_id ? String(r.transition_id) : normalizedTransitionId,
    oldSubscriptionId: r.old_subscription_id ? String(r.old_subscription_id) : null,
    newSubscriptionId: r.new_subscription_id ? String(r.new_subscription_id) : null,
    alreadyCompleted: Boolean(r.already_completed),
  };
}

// ---------- transição PURA D17 (testável sem I/O) ----------
export function applyPreapprovalTransition(
  pull: PreapprovalPull,
  cancelRequestedByUser: boolean,
): SubscriptionPatch | null {
  switch (pull.status) {
    case "authorized":
      return {
        state: "active",
        current_period_start: pull.date_created ?? null,
        current_period_end: pull.next_payment_date ?? null,
      };

    // ✅ GAP G1 CORRIGIDO:
    // Antes mapeava 'paused' -> 'grace_period'.
    // Agora mapeia 'paused' -> 'past_due', pois o MP pausa principalmente
    // por falha recorrente de cobrança ou inadimplência administrativa.
    case "paused":
      return { state: "past_due" };

    case "cancelled":
      return {
        state: cancelRequestedByUser ? "canceled_by_user" : "canceled_by_dunning",
      };

    case "pending":
    default:
      return null; // transitório/desconhecido → não inventa estado
  }
}

// ---------- resolução de org (external_reference UUID ou intent) ----------
export async function resolveOrgForPreapproval(pull: {
  external_reference?: unknown;
  preapproval_plan_id?: unknown;
}): Promise<{
  orgId: string | null;
  source: "external_reference" | "intent" | null;
  intentId?: string;
}> {
  const ext = String(pull?.external_reference ?? "").trim();
  if (UUID_RE.test(ext)) return { orgId: ext, source: "external_reference" };

  const planId = String(pull?.preapproval_plan_id ?? "").trim();
  if (planId) {
    const since = new Date(
      Date.now() - INTENT_WINDOW_H * 60 * 60 * 1000,
    ).toISOString();

    const { data } = await supabaseAdmin
      .from("billing_checkout_intents")
      .select("id, org_id")
      .eq("mp_plan_id", planId)
      .eq("status", "pending")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data?.org_id) {
      return {
        orgId: data.org_id as string,
        source: "intent",
        intentId: data.id as string,
      };
    }
  }

  return { orgId: null, source: null };
}

async function consumeIntent(
  intentId: string | undefined,
  preapprovalId: string,
) {
  if (!intentId) return;

  const { error } = await supabaseAdmin
    .from("billing_checkout_intents")
    .update({
      status: "consumed",
      mp_preapproval_id: preapprovalId,
      consumed_at: new Date().toISOString(),
    } as never)
    .eq("id", intentId);

  if (error) {
    console.warn("[mp-processor] intent_consume_error", {
      intentId,
      error: error.message,
    });
  }
}

// ---------- mark (claim condicional + zumbi-gate por attempts) ----------
async function markEvent(
  eventId: string,
  outcome: ProcessOutcome,
  info: string | null,
  attempts = 0,
) {
  if (outcome === "retry") {
    // NÃO grava status='retry': mantém 'received' p/ cron/sweep re-puxarem.
    const next = attempts + 1;

    if (next > MAX_ATTEMPTS) {
      const { error } = await supabaseAdmin
        .from("billing_events")
        .update({
          status: "ignored",
          error: "retry_exhausted",
          processed_at: new Date().toISOString(),
        } as never)
        .eq("id", eventId)
        .eq("status", "received");

      console.warn("[mp-processor] retry_exhausted", {
        eventId,
        attempts: next,
        error: error?.message,
      });

      return;
    }

    const { error } = await supabaseAdmin
      .from("billing_events")
      .update({ attempts: next } as never)
      .eq("id", eventId)
      .eq("status", "received");

    console.log("[mp-processor] retry", {
      eventId,
      info,
      attempts: next,
      error: error?.message,
    });

    return;
  }

  const { error } = await supabaseAdmin
    .from("billing_events")
    .update({
      status: outcome, // processed | ignored | failed
      error: outcome === "processed" ? null : info,
      processed_at: outcome === "processed" ? new Date().toISOString() : null,
    } as never)
    .eq("id", eventId)
    .eq("status", "received"); // claim: só transiciona de received

  if (error) {
    console.error("[mp-processor] mark_error", {
      eventId,
      outcome,
      error: error.message,
    });
  }
}

// ---------- pull de authorized_payment ----------
type Pull = PreapprovalPull & Record<string, any>;

async function pullAuthorizedPayment(
  id: string,
  liveMode: boolean,
): Promise<Record<string, any> | null> {
  const token = mpTokenFor(liveMode);
  if (!token) throw new Error("missing_mp_token");

  const res = await fetch(
    `https://api.mercadopago.com/authorized_payments/${encodeURIComponent(id)}`,
    { headers: { Authorization: `Bearer ${token}` } },
  );

  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`authorized_payments_pull_${res.status}`);

  return (await res.json()) as Record<string, any>;
}

// ---------- sweep LIMITADO de authorized_payments pendentes ----------
async function sweepAuthorizedPayments(preapprovalId: string) {
  const since = new Date(
    Date.now() - SWEEP_WINDOW_H * 60 * 60 * 1000,
  ).toISOString();

  const { data } = await supabaseAdmin
    .from("billing_events")
    .select("id, payload")
    .eq("status", "received")
    .eq("topic", "subscription_authorized_payment")
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(SWEEP_CAP);

  for (const ev of data ?? []) {
    const apId = String((ev.payload as any)?.data?.id ?? "").trim();
    if (!apId) continue;

    // Só processa se o AP pertence AO preapproval recém-ancorado.
    const probe = await pullAuthorizedPayment(apId, false).catch(() => null);
    if (!probe || String(probe.preapproval_id ?? "") !== preapprovalId) continue;

    const out = await processBillingEvent(ev.id);
    console.log("[mp-processor] sweep_anchored", {
      apId,
      preapprovalId,
      out,
    });
  }
}

// ---------- handler: subscription_preapproval ----------
async function processSubscriptionPreapproval(
  event: EventRow,
): Promise<ProcessOutcome> {
  const dataId = String(
    (event.payload as { data?: { id?: unknown } })?.data?.id ?? "",
  ).trim();

  if (!dataId) {
    await markEvent(event.id, "failed", "missing_data_id", event.attempts);
    return "failed";
  }

  // (2) pull do recurso completo — ANTES de transicionar (D17)
  let pull: Pull;
  try {
    pull = (await getPreapproval(dataId, event.live_mode)) as Pull;
  } catch (err) {
    if (err instanceof MpApiError && err.status === 404) {
      try {
        pull = (await getPreapproval(dataId, !event.live_mode)) as Pull;
      } catch {
        await markEvent(
          event.id,
          "ignored",
          "resource_not_found",
          event.attempts,
        );
        return "ignored";
      }
    } else {
      await markEvent(
        event.id,
        "retry",
        err instanceof MpApiError ? err.message : "pull_error",
        event.attempts,
      );
      return "retry";
    }
  }

  // ========================================================================
  // FASE 4.7 ITEM 1 — RAMO DE TROCA DE TIER
  // ========================================================================
  // Se este preapproval pertence a uma tier_transition, a conclusão deve ser
  // feita exclusivamente pela função SQL atômica billing_complete_tier_switch().
  // Não podemos deixar cair no fluxo normal de upsert de subscription.
  // ========================================================================
  const switchTransitionId = await resolveTierSwitchTransitionId(pull);

  if (switchTransitionId) {
    const result = await completeTierSwitchForTransition(
      pull,
      switchTransitionId,
    );

    if (
      result.outcome === "completed" ||
      result.outcome === "already_completed"
    ) {
      console.log("[mp-processor] tier_switch_completed", {
        eventId: event.id,
        transitionId: result.transitionId,
        preapprovalId: pull.id,
        outcome: result.outcome,
        oldSubscriptionId: result.oldSubscriptionId,
        newSubscriptionId: result.newSubscriptionId,
      });

      await markEvent(event.id, "processed", null, event.attempts);
      return "processed";
    }

    if (result.retryable) {
      await markEvent(
        event.id,
        "retry",
        `switch_${result.outcome}`,
        event.attempts,
      );
      return "retry";
    }

    if (isFatalTierSwitchOutcome(result.outcome)) {
      console.error("[mp-processor] tier_switch_fatal", {
        eventId: event.id,
        transitionId: result.transitionId,
        preapprovalId: pull.id,
        outcome: result.outcome,
      });

      await markEvent(
        event.id,
        "failed",
        `switch_${result.outcome}`,
        event.attempts,
      );
      return "failed";
    }

    console.warn("[mp-processor] tier_switch_ignored", {
      eventId: event.id,
      transitionId: result.transitionId,
      preapprovalId: pull.id,
      outcome: result.outcome,
    });

    await markEvent(
      event.id,
      "ignored",
      `switch_${result.outcome}`,
      event.attempts,
    );
    return "ignored";
  }

  // (3) ORDEM CORRETA: subscription existente é a fonte da org (eventos de
  // ciclo de vida: cancelled/paused/renewal). Intent/UUID só para CRIAÇÃO.
  const { data: existing } = await supabaseAdmin
    .from("subscriptions")
    .select("id, org_id, plan_code, state, cancel_requested_by_user")
    .eq("mp_preapproval_id", pull.id)
    .maybeSingle();

  // ========================================================================
  // FASE 4.7 ITEM 1 — PROTEÇÃO CONTRA EVENTOS TARDIOS DA ASSINATURA ANTIGA
  // ========================================================================
  // Depois de uma troca concluída, a subscription antiga vira canceled_by_upgrade.
  // Webhooks antigos do preapproval antigo podem chegar atrasados, principalmente
  // se o cancelamento no MP ainda não foi confirmado. Esses eventos NÃO podem
  // reativar nem sobrescrever a assinatura histórica.
  // ========================================================================
  if (existing && String((existing as any).state) === "canceled_by_upgrade") {
    console.warn("[mp-processor] historical_subscription_event_ignored", {
      eventId: event.id,
      subscriptionId: (existing as any).id,
      orgId: (existing as any).org_id,
      preapprovalId: pull.id,
      mpStatus: pull.status,
    });

    await markEvent(
      event.id,
      "ignored",
      "historical_subscription_after_tier_switch",
      event.attempts,
    );

    return "ignored";
  }

  let orgId: string | null = (existing as any)?.org_id ?? null;
  let source: "existing" | "external_reference" | "intent" | null = existing
    ? "existing"
    : null;

  let intentId: string | undefined;

  if (!orgId) {
    const resolved = await resolveOrgForPreapproval(pull);
    orgId = resolved.orgId;
    source = resolved.source;
    intentId = resolved.intentId;

    if (!orgId) {
      await markEvent(
        event.id,
        "ignored",
        "org_unresolved_no_intent",
        event.attempts,
      );
      return "ignored";
    }
  }

  // (4) transição pura D17
  const patch = applyPreapprovalTransition(
    pull,
    Boolean((existing as any)?.cancel_requested_by_user),
  );

  if (!patch) {
    await markEvent(
      event.id,
      "retry",
      `not_ready:${pull.status}`,
      event.attempts,
    );
    return "retry";
  }

  const planCode =
    (existing as any)?.plan_code ??
    PLAN_ID_TO_TIER[String(pull.preapproval_plan_id ?? "")] ??
    null;

  if (existing) {
    const update: Record<string, unknown> = { state: patch.state };

    if (patch.current_period_start !== undefined)
      update.current_period_start = patch.current_period_start;

    if (patch.current_period_end !== undefined)
      update.current_period_end = patch.current_period_end;

    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update(update as never)
      .eq("id", (existing as any).id);

    if (error) {
      await markEvent(
        event.id,
        "failed",
        `sub_update:${error.message}`,
        event.attempts,
      );
      return "failed";
    }
  } else {
    if (!planCode) {
      await markEvent(
        event.id,
        "ignored",
        "plan_code_unresolved",
        event.attempts,
      );
      return "ignored";
    }

    const { error } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        org_id: orgId,
        plan_code: planCode,
        state: patch.state,
        mp_preapproval_id: pull.id,
        current_period_start: patch.current_period_start ?? null,
        current_period_end: patch.current_period_end ?? null,
        cancel_requested_by_user: false,
      } as never);

    if (error) {
      await markEvent(
        event.id,
        "failed",
        `sub_insert:${error.message}`,
        event.attempts,
      );
      return "failed";
    }
  }

  await consumeIntent(intentId, pull.id);

  console.log("[mp-processor] subscription_upserted", {
    orgId,
    preapprovalId: pull.id,
    state: patch.state,
    source,
    mpStatus: pull.status,
  });

  await sweepAuthorizedPayments(pull.id).catch((e) =>
    console.warn("[mp-processor] sweep_error", { err: String(e) }),
  );

  await markEvent(event.id, "processed", null, event.attempts);
  return "processed";
}

// ---------- handler: subscription_authorized_payment ----------
async function handleAuthorizedPayment(
  ev: EventRow,
): Promise<ProcessOutcome> {
  const apId = String((ev.payload as any)?.data?.id ?? "").trim();

  if (!apId) {
    await markEvent(ev.id, "failed", "missing_data_id", ev.attempts);
    return "failed";
  }

  let ap: Record<string, any> | null;

  try {
    ap = await pullAuthorizedPayment(apId, ev.live_mode);
    if (!ap) ap = await pullAuthorizedPayment(apId, !ev.live_mode);
  } catch (err) {
    await markEvent(
      ev.id,
      "retry",
      err instanceof Error ? err.message : "ap_pull_error",
      ev.attempts,
    );
    return "retry";
  }

  if (!ap) {
    await markEvent(ev.id, "ignored", "authorized_payment_not_found", ev.attempts);
    return "ignored";
  }

  const preapprovalId = String(ap.preapproval_id ?? "").trim();

  if (!preapprovalId) {
    await markEvent(ev.id, "ignored", "ap_without_preapproval", ev.attempts);
    return "ignored";
  }

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("id, state")
    .eq("mp_preapproval_id", preapprovalId)
    .maybeSingle();

  if (!sub) {
    // preapproval ainda não processado → retry (zumbi-gate limita tentativas)
    console.log("[mp-processor] authorized_payment_waiting_subscription", {
      apId,
      preapprovalId,
    });

    await markEvent(ev.id, "retry", "waiting_subscription", ev.attempts);
    return "retry";
  }

  // ========================================================================
  // FASE 4.7 ITEM 1 — PROTEÇÃO CONTRA PAGAMENTO TARDIO DA ASSINATURA ANTIGA
  // ========================================================================
  // Se a subscription já foi substituída por troca de tier, pagamentos antigos
  // do preapproval antigo não podem reativar, atualizar períodos nem transicionar
  // a assinatura histórica.
  // ========================================================================
  if (String((sub as any).state) === "canceled_by_upgrade") {
    console.warn("[mp-processor] historical_authorized_payment_ignored", {
      eventId: ev.id,
      subscriptionId: (sub as any).id,
      preapprovalId,
      apId,
      apStatus: ap.status,
    });

    await markEvent(
      ev.id,
      "ignored",
      "historical_subscription_after_tier_switch",
      ev.attempts,
    );

    return "ignored";
  }

  // ========================================================================
  // 🔥 HOTFIX GAP G3: RENOVAÇÃO AUTOMÁTICA COM ATUALIZAÇÃO DE PERÍODOS
  // ========================================================================
  // Cenário: A subscription JÁ ESTAVA active (renovação recorrente normal).
  // O MP cobrou a parcela nova e enviou este webhook de payment aprovado,
  // MAS pode NÃO ter enviado o webhook de atualização do preapproval inteiro.
  // Se dependermos só do preapproval webhook, as datas ficam congeladas.
  // Solução: Refresh leve consultando GET /preapproval/{id} para pegar o
  // novo next_payment_date fresco e atualizar current_period_start/end.
  // ========================================================================
  if (ap.status === "approved") {
    const wasAlreadyActive = (sub as any).state === "active";

    // CASO 1: Primeira aprovação pós-criação OU reativação após past_due
    if (!wasAlreadyActive) {
      const { error } = await supabaseAdmin
        .from("subscriptions")
        .update({
          state: "active",
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", (sub as any).id);

      if (error) {
        await markEvent(
          ev.id,
          "failed",
          `sub_reactivate:${error.message}`,
          ev.attempts,
        );
        return "failed";
      }

      console.log("[mp-processor] authorized_payment_reactivated", {
        apId,
        preapprovalId,
        previousState: (sub as any).state,
      });
    }
    // CASO 2: RENOVAÇÃO RECURRENTE NORMAL (já estava active)
    // Precisamos atualizar os períodos derivando do preapproval fresco.
    else {
      try {
        // Faz um GET rápido no preapproval para obter next_payment_date atualizado
        const freshPull = await getPreapproval(preapprovalId, ev.live_mode);

        if (freshPull.next_payment_date) {
          // Deriva início do novo ciclo: usa date_approved da parcela aprovada
          // (é o momento exato em que o dinheiro caiu para este mês específico)
          const periodStart =
            ap.date_approved ?? ap.date_of_creation ?? new Date().toISOString();

          const { error: updErr } = await supabaseAdmin
            .from("subscriptions")
            .update({
              current_period_start: periodStart,
              current_period_end: freshPull.next_payment_date,
              updated_at: new Date().toISOString(),
            } as never)
            .eq("id", (sub as any).id);

          if (updErr) {
            console.error("[mp-processor] renewal_period_update_failed", {
              apId,
              preapprovalId,
              error: updErr.message,
            });
            // Não falha o evento inteiro por causa disso — o pagamento foi aprovado
            // e a subscription continua active. Logamos para investigação futura.
          } else {
            console.log("[mp-processor] renewal_periods_updated_via_refresh", {
              apId,
              preapprovalId,
              newPeriodStart: periodStart,
              newPeriodEnd: freshPull.next_payment_date,
            });
          }
        }
      } catch (refreshErr) {
        // Non-blocking failure: se o refresh do preapproval falhar (timeout/rate limit),
        // mantemos a subscription como active sem atualizar as datas.
        // O próximo webhook de preapproval (se vier) ou o cron diário de reconciliação
        // corrigirão isso eventualmente.
        console.warn(
          "[mp-processor] renewal_refresh_non_blocking_failure",
          {
            apId,
            preapprovalId,
            error:
              refreshErr instanceof Error
                ? refreshErr.message
                : String(refreshErr),
          },
        );
      }
    }
  }
  // ✅ GAP G2 CORRIGIDO: Tratamento de Falha de Pagamento
  // Se o pagamento foi recusado ou cancelado pelo gateway, a assinatura
  // deve entrar em inadimplência (past_due), desde que ainda esteja viva.
  else if (["rejected", "cancelled", "canceled"].includes(ap.status)) {
    // Só transiciona se a sub estiver em estado vivo (evita sobrescrever cancelamento manual)
    if (
      ["active", "grace_period", "past_due"].includes((sub as any).state)
    ) {
      const { error } = await supabaseAdmin
        .from("subscriptions")
        .update({
          state: "past_due",
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id", (sub as any).id);

      if (error) {
        await markEvent(
          ev.id,
          "failed",
          `sub_past_due:${error.message}`,
          ev.attempts,
        );
        return "failed";
      }

      console.warn("[mp-processor] authorized_payment_rejected_transitioned", {
        apId,
        preapprovalId,
        apStatus: ap.status,
        newState: "past_due",
        reason: "payment_failure",
      });
    } else {
      console.log(
        "[mp-processor] authorized_payment_rejected_ignored_state",
        {
          apId,
          currentSubState: (sub as any).state,
        },
      );
    }
  }
  // Estados intermediários (in_process/pending): apenas logar, aguardar próximo webhook
  else if (["in_process", "pending"].includes(ap.status)) {
    console.log("[mp-processor] authorized_payment_in_process_pending", {
      apId,
      preapprovalId,
      apStatus: ap.status,
    });
  }

  console.log("[mp-processor] authorized_payment_linked", {
    apId,
    preapprovalId,
    apStatus: ap.status,
  });

  await markEvent(ev.id, "processed", null, ev.attempts);
  return "processed";
}

// ---------- roteador por tópico ----------
async function processOne(ev: EventRow): Promise<ProcessOutcome> {
  switch (ev.topic) {
    case "subscription_preapproval":
      return processSubscriptionPreapproval(ev);

    case "subscription_authorized_payment":
      return handleAuthorizedPayment(ev);

    default:
      await markEvent(
        ev.id,
        "ignored",
        `unsupported_topic:${ev.topic}`,
        ev.attempts,
      );
      return "ignored";
  }
}

// ---------- API pública ----------
export async function processBillingEvent(
  eventId: string,
): Promise<ProcessOutcome> {
  const { data: event, error } = await supabaseAdmin
    .from("billing_events")
    .select(
      "id, mp_event_id, topic, action, live_mode, payload, status, attempts",
    )
    .eq("id", eventId)
    .maybeSingle();

  if (error || !event) {
    console.warn("[mp-processor] event_not_found", {
      eventId,
      error: error?.message,
    });
    return "ignored";
  }

  if ((event as EventRow).status !== "received") return "ignored"; // já pego

  try {
    return await processOne(event as EventRow);
  } catch (err) {
    console.error("[mp-processor] unhandled", { eventId, err });

    await markEvent(
      eventId,
      "failed",
      err instanceof Error ? err.message : "unhandled",
      (event as EventRow).attempts,
    );

    return "failed";
  }
}

/** Batch do cron 15min da 4.6 (e chamável manualmente). */
export async function processPendingEvents(limit = 50) {
  const { data: events, error } = await supabaseAdmin
    .from("billing_events")
    .select(
      "id, mp_event_id, topic, action, live_mode, payload, status, attempts",
    )
    .eq("status", "received")
    .order("created_at", { ascending: true })
    .limit(limit);

  const tally = { processed: 0, ignored: 0, failed: 0, retry: 0 };

  if (error || !events) {
    console.error("[mp-processor] pending_query_error", error?.message);
    return tally;
  }

  for (const ev of events) {
    const out = await processBillingEvent((ev as EventRow).id);
    tally[out]++;
  }

  return tally;
}
