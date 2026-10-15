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
 * 5. Grava resultado consolidado em billing_cron_config.last_run_* para auditoria.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
// Import direto seguro neste contexto (.server.ts não vaza pro client)
import { processPendingEvents } from "./mp-processor";
import { reconcilePreapprovalsBatch } from "./mp-reconcile-batch.server";

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
    console.warn("[mp-cron] 🔒 unauthorized_request", { hasHeader: !!authHeader });
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
    let reconcileResult = { scanned: 0, corrected: 0, created: 0, errors: 0 };
    try {
      reconcileResult = await reconcilePreapprovalsBatch();
      console.log("[mp-cron] 🔄 RECONCILIATION_BATCH_COMPLETED", reconcileResult);
    } catch (recErr) {
      console.error("[mp-cron] ❌ RECONCILIATION_BATCH_FAILED", recErr);
      // Flag de erro específico para reconciliação, mas não interrompe o retorno 200
      reconcileResult.errors = -1; 
    }

    const durationMs = Date.now() - start;

    // 4. Atualizar Configuração com Resumo Consolidado da Execução
    await supabaseAdmin
      .from("billing_cron_config")
      .update({
        last_run_at: new Date().toISOString(),
        // Status parcial se houve falhas em qualquer uma das fases
        last_run_status: (eventsResult.failed > 0 || reconcileResult.errors > 0) ? "partial" : "success",
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
          // Meta-dados
          duration_ms: durationMs,
        },
      } as never)
      .eq("id", "00000000-0000-0000-0000-000000000001");

    console.log("[mp-cron] ✅ EXECUTED", { eventsResult, reconcileResult, durationMs });

    return new Response(
      JSON.stringify({
        events: eventsResult,
        reconcile: reconcileResult,
        duration_ms: durationMs,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
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
