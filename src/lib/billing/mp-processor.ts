/**
 * Fase 4.4 — Processador de billing events (state machine D17).
 *
 * Pipeline (D17): (2) pull recurso completo → (3) resolver subscription →
 * (4) transição → (5) mark processed. O webhook é gatilho; a verdade é o pull.
 *
 * Trigger híbrido (decisão 2026-10-08): inline no receiver (latência mínima)
 * + cron 15min da 4.6 (rede de segurança). Claim sem estado `processing`:
 * mark final é condicional em `status='received'` + transições idempotentes.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getPreapproval,
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

// ---------- transição PURA (testável sem I/O) ----------
export interface SubscriptionPatch {
  state:
    | "active"
    | "grace_period"
    | "canceled_by_user"
    | "canceled_by_dunning";
  current_period_start?: string | null;
  current_period_end?: string | null;
}

/**
 * D17 — subscription_preapproval. `cancelRequestedByUser` vem da LINHA
 * existente (flag setado pela UI no cancelamento manual, 4.5). Retorna null
 * quando não deve transicionar (pending / status desconhecido → retry).
 */
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
    case "paused":
      return { state: "grace_period" };
    case "cancelled":
      return {
        state: cancelRequestedByUser
          ? "canceled_by_user"
          : "canceled_by_dunning",
      };
    case "pending":
    default:
      return null; // transitório/desconhecido → não inventa estado
  }
}

// ---------- resolver subscription existente (D16/D17) ----------
const SUB_SELECT =
  "id, org_id, plan_code, state, cancel_requested_by_user, mp_preapproval_id";

async function resolveSubscription(pull: PreapprovalPull) {
  // caminho principal: preapproval_id (determinístico)
  const { data: byPreapproval } = await supabaseAdmin
    .from("subscriptions")
    .select(SUB_SELECT)
    .eq("mp_preapproval_id", pull.id)
    .maybeSingle();
  if (byPreapproval) return byPreapproval;

  // fallback: external_reference = org_id (só subscriptions "vivas")
  if (pull.external_reference) {
    const { data: byExternal } = await supabaseAdmin
      .from("subscriptions")
      .select(SUB_SELECT)
      .eq("mp_external_reference", pull.external_reference)
      .in("state", ["active", "grace_period", "past_due"])
      .maybeSingle();
    return byExternal;
  }
  return null;
}

// ---------- mark (claim condicional) ----------
async function markEvent(
  id: string,
  outcome: ProcessOutcome,
  info: string | null,
) {
  if (outcome === "retry") {
    // deixa status='received'; o cron re-puxa. Não polui `error` (sugere falha).
    console.log("[mp-processor] retry", { id, info });
    return;
  }
  const status = outcome; // processed | ignored | failed
  const { error } = await supabaseAdmin
    .from("billing_events")
    .update({
      status,
      error: outcome === "processed" ? null : info,
      processed_at: outcome === "processed" ? new Date().toISOString() : null,
    })
    .eq("id", id)
    .eq("status", "received"); // claim: só transiciona de received
  if (error) {
    console.error("[mp-processor] mark_error", { id, error: error.message });
  }
}

// ---------- handlers por tópico ----------
async function processSubscriptionPreapproval(
  event: EventRow,
): Promise<ProcessOutcome> {
  const dataId = String(
    (event.payload as { data?: { id?: unknown } })?.data?.id ?? "",
  ).trim();
  if (!dataId) {
    await markEvent(event.id, "failed", "missing_data_id");
    return "failed";
  }

  // (2) pull do recurso completo — ANTES de transicionar (D17)
  let pull: PreapprovalPull;
  try {
    pull = await getPreapproval(dataId, event.live_mode);
  } catch (err) {
    if (err instanceof MpApiError && err.status === 404) {
      await markEvent(event.id, "ignored", "resource_not_found");
      return "ignored";
    }
    // rede/5xx/missing_token → retry (cron tenta de novo)
    await markEvent(
      event.id,
      "retry",
      err instanceof MpApiError ? err.message : "pull_error",
    );
    return "retry";
  }

  // (3) resolver subscription existente (criação é 4.5)
  const sub = await resolveSubscription(pull);
  if (!sub) {
    await markEvent(event.id, "ignored", "no_subscription");
    return "ignored";
  }

  // (4) transição pura
  const patch = applyPreapprovalTransition(
    pull,
    Boolean(sub.cancel_requested_by_user),
  );
  if (!patch) {
    await markEvent(event.id, "retry", `not_ready:${pull.status}`);
    return "retry";
  }

  // persistir (idempotente; updated_at via trigger set_updated_at)
  const update: Record<string, unknown> = { state: patch.state };
  if (patch.current_period_start !== undefined)
    update.current_period_start = patch.current_period_start;
  if (patch.current_period_end !== undefined)
    update.current_period_end = patch.current_period_end;

  const { error: updErr } = await supabaseAdmin
  .from("subscriptions")
  .update(update as never) // cast: gap do supabase gen types com Partial<Row>
  .eq("id", sub.id);
  if (updErr) {
    await markEvent(event.id, "failed", `sub_update:${updErr.message}`);
    return "failed";
  }

  // (5) mark processed
  await markEvent(event.id, "processed", null);
  return "processed";
}

async function processOne(event: EventRow): Promise<ProcessOutcome> {
  switch (event.topic) {
    case "subscription_preapproval":
      return processSubscriptionPreapproval(event);
    // próximos: subscription_authorized_payment, payment (iteração 4.4b)
    default:
      await markEvent(event.id, "ignored", `unsupported_topic:${event.topic}`);
      return "ignored";
  }
}

// ---------- API pública do processador ----------
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
