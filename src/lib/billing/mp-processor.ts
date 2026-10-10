/**
 * Fase 4.5/4.6 — Processador de eventos de billing (Mercado Pago).
 *
 * Pipeline: billing_events(status=received) → pull no MP → resolve org →
 * transição D17 → upsert em subscriptions → mark processed.
 *
 * ALINHAMENTO 2026-10-10 (pós-HMAC verde):
 * 1. Fluxo init_point (checkout hospedado do plano) NÃO carrega orgId no
 *    preapproval. Resolução de org em dois ramos:
 *    a) external_reference UUID (fluxo API/prod futuro) → direto;
 *    b) fallback: billing_checkout_intents (mp_plan_id + status=pending,
 *       janela de 2h, mais recente) → intent consumido no bind.
 * 2. subscription_authorized_payment: pull em /authorized_payments/{id} e
 *    ancora via preapproval_id; sem subscription ainda → "retry" (cron 4.6
 *    ou sweep imediato após o preapproval processar).
 * 3. live_mode do evento escolhe o token (mpTokenFor) — coerente com webhook.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getPreapproval,
  mpTokenFor,
  MpApiError,
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
}

export interface SubscriptionPatch {
  state:
    | "active"
    | "grace_period"
    | "canceled_by_user"
    | "canceled_by_dunning";
  current_period_start?: string | null;
  current_period_end?: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Anti-drift: espelho reverso de PLAN_IDS_TEST (mp-checkout.functions.ts). */
const PLAN_ID_TO_TIER: Record<string, string> = {
  "2ae043b092704c96b1e67b4238295c43": "operacao",
  "67b0eca317cc4e00a03ba0654bd7ff64": "crescimento",
  "5899e7efc405436995ef18cfea544747": "escala",
};

// ---------- transição PURA D17 (testável sem I/O) ----------
export function applyPreapprovalTransition(
  mpStatus: string,
  cancelRequestedByUser: boolean,
): SubscriptionPatch | null {
  switch (mpStatus) {
    case "authorized":
      return { state: "active" };
    case "paused":
      return { state: "grace_period" };
    case "cancelled":
      return {
        state: cancelRequestedByUser ? "canceled_by_user" : "canceled_by_dunning",
      };
    default:
      return null; // pending/unknown → sem transição (retry)
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
    const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
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
      return { orgId: data.org_id as string, source: "intent", intentId: data.id as string };
    }
  }
  return { orgId: null, source: null };
}

async function consumeIntent(intentId: string | undefined, preapprovalId: string) {
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

// ---------- helpers DB ----------
async function markEvent(eventId: string, status: string, errorMsg?: string | null) {
  const { error } = await supabaseAdmin
    .from("billing_events")
    .update({
      status,
      error: errorMsg ?? null,
      processed_at: new Date().toISOString(),
    } as never)
    .eq("id", eventId);
  if (error) {
    console.error("[mp-processor] mark_event_error", {
      eventId,
      status,
      error: error.message,
    });
  }
}

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

// ---------- handler: subscription_preapproval ----------
async function handlePreapproval(ev: EventRow): Promise<ProcessOutcome> {
  const resourceId = String((ev.payload as any)?.data?.id ?? "").trim();
  if (!resourceId) {
    await markEvent(ev.id, "ignored", "missing_resource_id");
    return "ignored";
  }

  let pull: Pull;
  try {
    pull = (await getPreapproval(resourceId, ev.live_mode)) as Pull;
  } catch (err) {
    if (err instanceof MpApiError && err.status === 404) {
      try {
        pull = (await getPreapproval(resourceId, !ev.live_mode)) as Pull;
      } catch {
        await markEvent(ev.id, "ignored", "preapproval_not_found_both_envs");
        return "ignored";
      }
    } else {
      throw err; // sobe para o caller (failed/retry)
    }
  }

  const { orgId, source, intentId } = await resolveOrgForPreapproval(pull);
  if (!orgId) {
    await markEvent(ev.id, "ignored", "org_unresolved_no_intent");
    return "ignored";
  }

  const { data: existing } = await supabaseAdmin
    .from("subscriptions")
    .select("id, state, cancel_requested_by_user, plan_code")
    .eq("mp_preapproval_id", resourceId)
    .maybeSingle();

  const cancelFlag = Boolean((existing as any)?.cancel_requested_by_user);
  const patch = applyPreapprovalTransition(String(pull.status ?? ""), cancelFlag);

  if (!patch) {
    console.log("[mp-processor] preapproval_pending_no_transition", {
      resourceId,
      status: pull.status,
    });
    return "retry";
  }

  const planCode =
    PLAN_ID_TO_TIER[String(pull.preapproval_plan_id ?? "")] ??
    (existing as any)?.plan_code ??
    null;

  if (existing) {
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({
        state: patch.state,
        current_period_start:
          patch.current_period_start ?? (pull as any).current_period_start ?? null,
        current_period_end:
          patch.current_period_end ?? (pull as any).current_period_end ?? null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", (existing as any).id);
    if (error) throw new Error(`subscription_update:${error.message}`);
  } else {
    if (!planCode) {
      await markEvent(ev.id, "ignored", "plan_code_unresolved");
      return "ignored";
    }
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        org_id: orgId,
        plan_code: planCode,
        state: patch.state,
        mp_preapproval_id: resourceId,
        current_period_start: (pull as any).current_period_start ?? null,
        current_period_end: (pull as any).current_period_end ?? null,
        cancel_requested_by_user: false,
      } as never);
    if (error) throw new Error(`subscription_insert:${error.message}`);
  }

  await consumeIntent(intentId, resourceId);

  console.log("[mp-processor] subscription_upserted", {
    orgId,
    preapprovalId: resourceId,
    state: patch.state,
    source,
    mpStatus: pull.status,
  });

  // Sweep imediato: ancora authorized_payments pendentes deste preapproval
  const { data: pendingAps } = await supabaseAdmin
    .from("billing_events")
    .select("id")
    .eq("status", "received")
    .eq("topic", "subscription_authorized_payment")
    .filter("payload->data->>id", "neq", "")
    .limit(10);
  for (const p of pendingAps ?? []) {
    await processBillingEvent(p.id).catch((e) =>
      console.warn("[mp-processor] sweep_error", { eventId: p.id, err: String(e) }),
    );
  }

  await markEvent(ev.id, "processed", null);
  return "processed";
}

// ---------- handler: subscription_authorized_payment ----------
async function handleAuthorizedPayment(ev: EventRow): Promise<ProcessOutcome> {
  const apId = String((ev.payload as any)?.data?.id ?? "").trim();
  if (!apId) {
    await markEvent(ev.id, "ignored", "missing_resource_id");
    return "ignored";
  }

  const ap = await pullAuthorizedPayment(apId, ev.live_mode);
  if (!ap) {
    await markEvent(ev.id, "ignored", "authorized_payment_not_found");
    return "ignored";
  }

  const preapprovalId = String(ap.preapproval_id ?? "").trim();
  if (!preapprovalId) {
    await markEvent(ev.id, "ignored", "authorized_payment_without_preapproval");
    return "ignored";
  }

  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("id, state")
    .eq("mp_preapproval_id", preapprovalId)
    .maybeSingle();

  if (!sub) {
    // Evento preapproval ainda não processado → retry (cron 4.6 ou sweep)
    console.log("[mp-processor] authorized_payment_waiting_subscription", {
      apId,
      preapprovalId,
    });
    return "retry";
  }

  if (ap.status === "approved" && (sub as any).state !== "active") {
    const { error } = await supabaseAdmin
      .from("subscriptions")
      .update({ state: "active", updated_at: new Date().toISOString() } as never)
      .eq("id", (sub as any).id);
    if (error) throw new Error(`subscription_reactivate:${error.message}`);
  }

  console.log("[mp-processor] authorized_payment_linked", {
    apId,
    preapprovalId,
    apStatus: ap.status,
  });
  await markEvent(ev.id, "processed", null);
  return "processed";
}

// ---------- roteador por tópico ----------
async function processOne(ev: EventRow): Promise<ProcessOutcome> {
  if (ev.topic === "subscription_preapproval") return handlePreapproval(ev);
  if (ev.topic === "subscription_authorized_payment")
    return handleAuthorizedPayment(ev);
  await markEvent(ev.id, "ignored", `unsupported_topic:${ev.topic}`);
  return "ignored";
}

// ---------- API pública ----------
export async function processBillingEvent(
  eventId: string,
): Promise<ProcessOutcome> {
  const { data: event, error } = await supabaseAdmin
    .from("billing_events")
    .select("id, mp_event_id, topic, action, live_mode, payload, status")
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
    );
    return "failed";
  }
}

/** Batch usado pelo cron 15min da 4.6 (e chamável manualmente). */
export async function processPendingEvents(limit = 50) {
  const { data: events, error } = await supabaseAdmin
    .from("billing_events")
    .select("id, mp_event_id, topic, action, live_mode, payload, status")
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
