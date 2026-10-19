/**
 * Endpoint interno do Cron de Segurança + Reconciliação Reversa (Kill-Switch).
 *
 * ARQUITETURA ISOLADA (§5 Backend Authority + Regra Emergente DT-XX):
 * • Este arquivo termina em .server.ts → bundler TanStack Start/Rolldown ignora
 *   automaticamente durante geração do bundle client-side. Zero risco de vazamento.
 * • Chamado EXCLUSIVAMENTE por /api/internal/cron-trigger.tsx (rota API pura).
 * • Nunca importado por componentes React ou server functions compartilhadas.
 *
 * FLUXO DE EXECUÇÃO DIÁRIO (00:00 UTC):
 * 1. Valida CRON_SECRET (header Authorization).
 * 2. Consulta billing_cron_config.enabled. Se FALSE → skip imediato (zero carga).
 * 3. FASE 1: Executa processPendingEvents(20) para drenar zumbis recentes (>2min).
 * 4. FASE 2: Executa reconcilePreapprovalsBatch() para corrigir fantasmas/dessincronias.
 * 5. FASE 3: Executa manutenção de tier_transitions (Fase 4.7 Item 1):
 *    - expira transições pending vencidas;
 *    - expira intents pending vinculados a transições vencidas;
 *    - cancela preapproval legado no MP após troca concluída;
 *    - controla retry/backoff e needs_manual.
 * 6. Grava resultado consolidado em billing_cron_config.last_run_* para auditoria.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
// Import direto seguro neste contexto (.server.ts não vaza pro client)
import { processPendingEvents } from "./mp-processor";
import { reconcilePreapprovalsBatch } from "./mp-reconcile-batch.server";
import { cancelPreapproval, MpApiError, searchAuthorizedPayments } from "./mp-api";

// ============================================================================
// FASE 4.7 ITEM 1 — MANUTENÇÃO DE TIER TRANSITIONS
// ============================================================================

const LEGACY_CANCEL_BATCH_LIMIT = 20;
const MAX_LEGACY_CANCEL_ATTEMPTS = 8;

interface TierSwitchMaintenanceTally {
  expired_pending: number;
  legacy_checked: number;
  legacy_canceled: number;
  legacy_failed: number;
  legacy_needs_manual: number;
  errors: number;
}

interface InvoiceReconcileTally {
  scanned: number;
  created: number;
  updated: number;
  errors: number;
}

/**
 * Expira transições pending vencidas.
 *
 * Isso destrava a organização para nova troca caso o usuário tenha iniciado
 * o checkout no MP e não tenha aprovado dentro da janela.
 *
 * Também marca como expired os billing_checkout_intents pending vinculados.
 */
async function expirePendingTierTransitions(): Promise<number> {
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from("tier_transitions")
    .update({
      status: "expired",
      completed_at: nowIso,
    } as never)
    .eq("status", "pending")
    .lt("expires_at", nowIso)
    .select("id");

  if (error) {
    console.error("[mp-cron] tier_switch_expire_error", {
      error: error.message,
    });
    throw error;
  }

  const ids = (data ?? []).map((row) => (row as { id: string }).id);

  if (ids.length > 0) {
    const { error: intentErr } = await supabaseAdmin
      .from("billing_checkout_intents")
      .update({
        status: "expired",
      } as never)
      .in("transition_id", ids)
      .eq("status", "pending");

    if (intentErr) {
      console.warn("[mp-cron] tier_switch_expire_intent_warning", {
        error: intentErr.message,
      });
    }
  }

  return ids.length;
}

/**
 * Processa cancelamento legado do preapproval antigo após troca concluída.
 *
 * A função SQL billing_complete_tier_switch() apenas registra a pendência:
 *
 *   legacy_mp_cancel_status = pending
 *   legacy_mp_cancel_next_attempt_at = now()
 *
 * Este cron executa o efeito externo no Mercado Pago.
 *
 * Regras:
 * - sucesso → canceled;
 * - 404 do MP é tratado como ok/idempotente;
 * - falha → failed + backoff;
 * - após MAX_LEGACY_CANCEL_ATTEMPTS → needs_manual.
 */
async function processLegacyTierSwitchCancellations(): Promise<
  Omit<TierSwitchMaintenanceTally, "expired_pending">
> {
  const tally = {
    legacy_checked: 0,
    legacy_canceled: 0,
    legacy_failed: 0,
    legacy_needs_manual: 0,
    errors: 0,
  };

  const now = new Date();
  const nowIso = now.toISOString();

  const { data, error } = await supabaseAdmin
    .from("tier_transitions")
    .select(
      "id, from_mp_preapproval_id, legacy_mp_cancel_status, legacy_mp_cancel_attempts",
    )
    .eq("status", "completed")
    .in("legacy_mp_cancel_status", ["pending", "failed"])
    .lte("legacy_mp_cancel_next_attempt_at", nowIso)
    .lt("legacy_mp_cancel_attempts", MAX_LEGACY_CANCEL_ATTEMPTS)
    .order("legacy_mp_cancel_next_attempt_at", { ascending: true })
    .limit(LEGACY_CANCEL_BATCH_LIMIT);

  if (error) {
    console.error("[mp-cron] tier_switch_legacy_query_error", {
      error: error.message,
    });
    tally.errors++;
    return tally;
  }

  const liveMode = process.env.MP_ENV === "prod";

  for (const raw of data ?? []) {
    const row = raw as {
      id: string;
      from_mp_preapproval_id: string | null;
      legacy_mp_cancel_status: string | null;
      legacy_mp_cancel_attempts: number | null;
    };

    tally.legacy_checked++;

    // Se não houver preapproval antigo vinculado, não há o que cancelar.
    if (!row.from_mp_preapproval_id) {
      const { error: updErr } = await supabaseAdmin
        .from("tier_transitions")
        .update({
          legacy_mp_cancel_status: "not_required",
          legacy_mp_cancel_next_attempt_at: null,
          legacy_mp_cancel_error: null,
          legacy_mp_cancel_completed_at: nowIso,
          legacy_mp_cancel_attempts: row.legacy_mp_cancel_attempts ?? 0,
        } as never)
        .eq("id", row.id);

      if (updErr) {
        console.error("[mp-cron] tier_switch_legacy_not_required_error", {
          transitionId: row.id,
          error: updErr.message,
        });
        tally.errors++;
      } else {
        tally.legacy_canceled++;
      }

      continue;
    }

    try {
      const result = await cancelPreapproval({
        preapprovalId: row.from_mp_preapproval_id,
        liveMode,
      });

      if (result.ok) {
        const { error: updErr } = await supabaseAdmin
          .from("tier_transitions")
          .update({
            legacy_mp_cancel_status: "canceled",
            legacy_mp_cancel_next_attempt_at: null,
            legacy_mp_cancel_error: null,
            legacy_mp_cancel_completed_at: nowIso,
            legacy_mp_cancel_attempts: row.legacy_mp_cancel_attempts ?? 0,
          } as never)
          .eq("id", row.id);

        if (updErr) {
          console.error("[mp-cron] tier_switch_legacy_success_update_error", {
            transitionId: row.id,
            preapprovalId: row.from_mp_preapproval_id,
            error: updErr.message,
          });
          tally.errors++;
        } else {
          tally.legacy_canceled++;

          if (result.alreadyCancelled) {
            console.log(
              "[mp-cron] tier_switch_legacy_already_cancelled",
              {
                transitionId: row.id,
                preapprovalId: row.from_mp_preapproval_id,
              },
            );
          }
        }

        continue;
      }

      // cancelPreapproval lança em caso de falha não-idempotente.
      throw new Error("cancel_preapproval_not_ok");
    } catch (err) {
      const message =
        err instanceof MpApiError
          ? `${err.message} (status=${err.status})`
          : err instanceof Error
            ? err.message
            : String(err);

      const nextAttempts = Number(row.legacy_mp_cancel_attempts ?? 0) + 1;

      if (nextAttempts >= MAX_LEGACY_CANCEL_ATTEMPTS) {
        const { error: updErr } = await supabaseAdmin
          .from("tier_transitions")
          .update({
            legacy_mp_cancel_status: "needs_manual",
            legacy_mp_cancel_attempts: nextAttempts,
            legacy_mp_cancel_error: message,
            legacy_mp_cancel_next_attempt_at: null,
          } as never)
          .eq("id", row.id);

        if (updErr) {
          console.error(
            "[mp-cron] tier_switch_legacy_needs_manual_update_error",
            {
              transitionId: row.id,
              preapprovalId: row.from_mp_preapproval_id,
              error: updErr.message,
            },
          );
          tally.errors++;
        } else {
          tally.legacy_needs_manual++;

          console.error("[mp-cron] tier_switch_legacy_needs_manual", {
            transitionId: row.id,
            preapprovalId: row.from_mp_preapproval_id,
            attempts: nextAttempts,
            error: message,
          });
        }
      } else {
        // Backoff exponencial simples:
        // 10min, 20min, 40min, 80min, 160min, 320min, 640min, capped em 24h.
        const backoffMinutes = Math.min(
          10 * Math.pow(2, Math.max(0, nextAttempts - 1)),
          24 * 60,
        );

        const nextIso = new Date(
          Date.now() + backoffMinutes * 60_000,
        ).toISOString();

        const { error: updErr } = await supabaseAdmin
          .from("tier_transitions")
          .update({
            legacy_mp_cancel_status: "failed",
            legacy_mp_cancel_attempts: nextAttempts,
            legacy_mp_cancel_error: message,
            legacy_mp_cancel_next_attempt_at: nextIso,
          } as never)
          .eq("id", row.id);

        if (updErr) {
          console.error("[mp-cron] tier_switch_legacy_failed_update_error", {
            transitionId: row.id,
            preapprovalId: row.from_mp_preapproval_id,
            error: updErr.message,
          });
          tally.errors++;
        } else {
          tally.legacy_failed++;

          console.warn("[mp-cron] tier_switch_legacy_failed_retry", {
            transitionId: row.id,
            preapprovalId: row.from_mp_preapproval_id,
            attempts: nextAttempts,
            nextAttemptAt: nextIso,
            error: message,
          });
        }
      }
    }
  }

  return tally;
}

/**
 * Orquestra a manutenção da Fase 4.7 Item 1.
 *
 * Falhas aqui não devem derrubar o cron principal, mas ficam registradas
 * no tally para auditoria.
 */
async function runTierSwitchMaintenance(): Promise<TierSwitchMaintenanceTally> {
  const tally: TierSwitchMaintenanceTally = {
    expired_pending: 0,
    legacy_checked: 0,
    legacy_canceled: 0,
    legacy_failed: 0,
    legacy_needs_manual: 0,
    errors: 0,
  };

  try {
    tally.expired_pending = await expirePendingTierTransitions();
  } catch (err) {
    console.error("[mp-cron] tier_switch_maintenance_expire_failure", {
      error: err instanceof Error ? err.message : String(err),
    });
    tally.errors++;
  }

  try {
    const legacy = await processLegacyTierSwitchCancellations();
    tally.legacy_checked = legacy.legacy_checked;
    tally.legacy_canceled = legacy.legacy_canceled;
    tally.legacy_failed = legacy.legacy_failed;
    tally.legacy_needs_manual = legacy.legacy_needs_manual;
    tally.errors += legacy.errors;
  } catch (err) {
    console.error("[mp-cron] tier_switch_maintenance_legacy_failure", {
      error: err instanceof Error ? err.message : String(err),
    });
    tally.errors++;
  }

  return tally;
}

/**
 * FASE 4.8 — Reconciliação de Faturas (Invoices)
 * 
 * Busca authorized_payments do MP para todas as subscriptions vivas
 * e faz upsert idempotente na tabela invoices.
 * 
 * Regras:
 * - Âncora de idempotência: mp_payment_id (UNIQUE)
 * - Ligação com billing_event quando possível
 * - Mapeamento de status: approved→paid, rejected/cancelled→failed, in_process/pending→processing
 * - Não insere se subscription não existir (evita órfãos)
 */
async function reconcileInvoicesBatch(): Promise<InvoiceReconcileTally> {
  const tally: InvoiceReconcileTally = {
    scanned: 0,
    created: 0,
    updated: 0,
    errors: 0,
  };

  // 1. Buscar todas as subscriptions vivas
  const { data: subs, error: subsErr } = await supabaseAdmin
    .from("subscriptions")
    .select("id, org_id, mp_preapproval_id, current_period_start, current_period_end")
    .in("state", ["active", "grace_period", "past_due"]);

  if (subsErr || !subs) {
    console.error("[mp-cron] invoices_subs_query_error", subsErr?.message);
    tally.errors++;
    return tally;
  }

  const liveMode = process.env.MP_ENV === "prod";

  // 2. Para cada subscription, puxar authorized_payments do MP
  for (const sub of subs) {
    if (!sub.mp_preapproval_id) continue;

    try {
      const response = await searchAuthorizedPayments(
        sub.mp_preapproval_id,
        liveMode,
        0,
        50,
      );

      tally.scanned += response.results.length;

      // 3. Upsert idempotente para cada pagamento
      for (const ap of response.results) {
        const mpPaymentId = String(ap.id);
        const amountCents = Math.round((ap.transaction_amount ?? 0) * 100);
        const paidAt = ap.date_approved ?? ap.date_of_creation ?? null;
        const status = mapMpStatusToInvoiceStatus(ap.status) as 
          "scheduled" | "processing" | "retrying" | "paid" | "failed";

        // Buscar billing_event correspondente (se existir)
        const { data: event } = await supabaseAdmin
          .from("billing_events")
          .select("id")
          .eq("topic", "subscription_authorized_payment")
          .eq("payload->data->>id", mpPaymentId)
          .maybeSingle();

        // Upsert idempotente (âncora: mp_payment_id)
        const { error: upsertErr, data: upsertData } = await supabaseAdmin
          .from("invoices")
          .upsert(
            {
              org_id: sub.org_id,
              subscription_id: sub.id,
              mp_payment_id: mpPaymentId,
              mp_preapproval_id: sub.mp_preapproval_id,
              billing_event_id: event?.id ?? null,
              amount_cents: amountCents,
              currency: ap.currency_id ?? "BRL",
              status,
              paid_at: paidAt ? new Date(paidAt).toISOString() : null,
              period_start: sub.current_period_start,
              period_end: sub.current_period_end,
            },
            { onConflict: "mp_payment_id" },
          )
          .select("id");

        const count = upsertData?.length ?? 0;

        if (upsertErr) {
          console.error("[mp-cron] invoice_upsert_error", {
            mpPaymentId,
            error: upsertErr.message,
          });
          tally.errors++;
        } else {
          // Se count > 0, foi insert; senão foi update
          if (count && count > 0) {
            tally.created++;
          } else {
            tally.updated++;
          }
        }
      }
    } catch (err) {
      console.error("[mp-cron] invoices_reconcile_error", {
        subscriptionId: sub.id,
        preapprovalId: sub.mp_preapproval_id,
        error: err instanceof Error ? err.message : String(err),
      });
      tally.errors++;
    }
  }

  return tally;
}

/**
 * Mapeia status do MP para enum local de invoice_status.
 */
function mapMpStatusToInvoiceStatus(
  mpStatus: string,
): "scheduled" | "processing" | "retrying" | "paid" | "failed" {
  switch (mpStatus) {
    case "approved":
      return "paid";
    case "rejected":
    case "cancelled":
    case "canceled":
      return "failed";
    case "in_process":
    case "pending":
      return "processing";
    default:
      return "scheduled";
  }
}

// ============================================================================
// HANDLER PRINCIPAL DO CRON
// ============================================================================

export async function handleCronTrigger(request: Request): Promise<Response> {
  // 1. Autenticação: só aceita requisições da Vercel Cron com secret válido
  const authHeader = request.headers.get("authorization");
  const expectedSecret = process.env.CRON_SECRET;

  if (!expectedSecret) {
    console.error("[mp-cron] ❌ CRON_SECRET not configured in environment");
    return new Response(JSON.stringify({ error: "CRON_SECRET_MISSING" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (authHeader !== `Bearer ${expectedSecret}`) {
    console.warn("[mp-cron] 🔒 unauthorized_request", {
      hasHeader: !!authHeader,
    });

    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 2. Kill-Switch Check (leitura leve via service role)
  const { data: config, error: cfgErr } = await supabaseAdmin
    .from("billing_cron_config")
    .select("enabled")
    .eq("id", "00000000-0000-0000-0000-000000000001")
    .single();

  if (cfgErr || !config?.enabled) {
    console.log("[mp-cron] ⏸️ SKIPPED_BY_ADMIN (disabled or missing config)");

    return new Response(JSON.stringify({ skipped: true, reason: "disabled" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 3. Execução Real (Orquestração das Fases)
  try {
    const start = Date.now();

    // --- FASE 1: Processamento de Eventos Pendentes (Item 3) ---
    // Lote conservador de 20 eventos para caber no timeout do Hobby Plan
    const eventsResult = await processPendingEvents(20);

    // --- FASE 2: Reconciliação Reversa em Massa (Item 4) ---
    // Varredura proativa comparando MP vs DB local
    let reconcileResult = {
      scanned: 0,
      corrected: 0,
      created: 0,
      errors: 0,
    };

    try {
      reconcileResult = await reconcilePreapprovalsBatch();
      console.log(
        "[mp-cron] 🔄 RECONCILIATION_BATCH_COMPLETED",
        reconcileResult,
      );
    } catch (recErr) {
      console.error("[mp-cron] ❌ RECONCILIATION_BATCH_FAILED", recErr);
      // Flag de erro específico para reconciliação, mas não interrompe o retorno 200
      reconcileResult.errors = -1;
    }

    // --- FASE 3: Manutenção de Tier Transitions (Fase 4.7 Item 1) ---
    let tierSwitchResult: TierSwitchMaintenanceTally = {
      expired_pending: 0,
      legacy_checked: 0,
      legacy_canceled: 0,
      legacy_failed: 0,
      legacy_needs_manual: 0,
      errors: 0,
    };

    try {
      tierSwitchResult = await runTierSwitchMaintenance();
      console.log(
        "[mp-cron] 🧾 TIER_SWITCH_MAINTENANCE_COMPLETED",
        tierSwitchResult,
      );
    } catch (tsErr) {
      console.error(
        "[mp-cron] ❌ TIER_SWITCH_MAINTENANCE_FAILED",
        tsErr,
      );

      tierSwitchResult = {
        ...tierSwitchResult,
        errors: -1,
      };
    }

    // --- FASE 4: Reconciliação de Faturas (Fase 4.8) ---
    let invoicesResult: InvoiceReconcileTally = {
      scanned: 0,
      created: 0,
      updated: 0,
      errors: 0,
    };

    try {
      invoicesResult = await reconcileInvoicesBatch();
      console.log(
        "[mp-cron] 🧾 INVOICES_RECONCILIATION_COMPLETED",
        invoicesResult,
      );
    } catch (invErr) {
      console.error("[mp-cron] ❌ INVOICES_RECONCILIATION_FAILED", invErr);
      invoicesResult.errors = -1;
    }

    const durationMs = Date.now() - start;

    const hasPartialFailure =
      eventsResult.failed > 0 ||
      reconcileResult.errors > 0 ||
      tierSwitchResult.errors > 0 ||
      invoicesResult.errors > 0;

    // 4. Atualizar Configuração com Resumo Consolidado da Execução
    await supabaseAdmin
      .from("billing_cron_config")
      .update({
        last_run_at: new Date().toISOString(),
        last_run_status: hasPartialFailure ? "partial" : "success",
        last_run_summary: {
          // Métricas da Fase 1 (Eventos)
          events_processed: eventsResult.processed,
          events_ignored: eventsResult.ignored,
          events_failed: eventsResult.failed,
          events_retry: eventsResult.retry,

          // Métricas da Fase 2 (Reconciliação)
          reconcile_scanned: reconcileResult.scanned,
          reconcile_corrected: reconcileResult.corrected,
          reconcile_created: reconcileResult.created,
          reconcile_errors: reconcileResult.errors,

          // Métricas da Fase 3 (Tier Switch Maintenance)
          tier_switch_expired_pending: tierSwitchResult.expired_pending,
          tier_switch_legacy_checked: tierSwitchResult.legacy_checked,
          tier_switch_legacy_canceled: tierSwitchResult.legacy_canceled,
          tier_switch_legacy_failed: tierSwitchResult.legacy_failed,
          tier_switch_legacy_needs_manual:
            tierSwitchResult.legacy_needs_manual,
          tier_switch_errors: tierSwitchResult.errors,

          // Métricas da Fase 4 (Invoices Reconciliation)
          invoices_scanned: invoicesResult.scanned,
          invoices_created: invoicesResult.created,
          invoices_updated: invoicesResult.updated,
          invoices_errors: invoicesResult.errors,

          // Meta-dados
          duration_ms: durationMs,
        },
      } as never)
      .eq("id", "00000000-0000-0000-0000-000000000001");

    console.log("[mp-cron] ✅ EXECUTED", {
      eventsResult,
      reconcileResult,
      tierSwitchResult,
      durationMs,
    });

    return new Response(
      JSON.stringify({
        events: eventsResult,
        reconcile: reconcileResult,
        tier_switch: tierSwitchResult,
        invoices: invoicesResult,
        duration_ms: durationMs,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);

    console.error("[mp-cron] ❌ CRITICAL_FAILURE", { error: errorMsg });

    // Registra falha crítica na config para alerta futuro
    try {
      await supabaseAdmin
        .from("billing_cron_config")
        .update({
          last_run_at: new Date().toISOString(),
          last_run_status: "failed",
          last_run_summary: { error: errorMsg },
        } as never)
        .eq("id", "00000000-0000-0000-0000-000000000001");
    } catch (_) {
      // Ignora falha secundária de logging — o log principal já registrou o erro crítico
    }

    // Retorna 200 para evitar retry infinito da Vercel, mas loga erro
    return new Response(JSON.stringify({ error: errorMsg }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
}
