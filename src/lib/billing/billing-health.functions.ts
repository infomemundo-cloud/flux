/**
 * Fase 4.6 Item 3 — Server Functions de Saúde do Billing.
 * 
 * CORREÇÃO CRÍTICA: assertPlatformAdmin agora usa supabaseAdmin (service role)
 * para bypassar RLS e garantir que a verificação de autoridade nunca falhe
 * por falta de permissão de leitura do próprio usuário.
 * 
 * REMOVIDO: import { logAuditAction } (não exportado em platform-admin.functions).
 * Auditoria mantida via logs de console (capturados pela Vercel).
 */

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ============================================================================
// TIPOS LOCAIS
// ============================================================================

type BillingEventStatus = "received" | "processed" | "failed" | "ignored";

// ============================================================================
// HELPERS INTERNOS
// ============================================================================

async function countEventsByStatus(status: BillingEventStatus): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("billing_events")
    .select("*", { count: "exact", head: true })
    .eq("status", status);
  
  if (error) throw new Error(`count_${status}: ${error.message}`);
  return count ?? 0;
}

async function countRetryingEvents(): Promise<number> {
  const { count, error } = await supabaseAdmin
    .from("billing_events")
    .select("*", { count: "exact", head: true })
    .eq("status", "received")
    .gt("attempts", 0);
  
  if (error) throw new Error(`count_retrying: ${error.message}`);
  return count ?? 0;
}

async function getOldestPendingAgeSeconds(): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("billing_events")
    .select("created_at")
    .eq("status", "received")
    .order("created_at", { ascending: true })
    .limit(1);
  
  if (error) throw new Error(`oldest_pending_query: ${error.message}`);
  if (!data?.length) return 0;
  
  const oldestTimestamp = new Date(data[0].created_at).getTime();
  return Math.floor((Date.now() - oldestTimestamp) / 1000);
}

async function getMaxAttemptsInWindow(since: Date): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from("billing_events")
    .select("attempts")
    .eq("status", "received")
    .gte("created_at", since.toISOString())
    .order("attempts", { ascending: false })
    .limit(1);
  
  if (error) throw new Error(`max_attempts_query: ${error.message}`);
  if (!data?.length) return 0;
  
  return Number(data[0].attempts) || 0;
}

// ============================================================================
// ASSERT HELPER (CORRIGIDO: USA SERVICE ROLE PARA BYPASSAR RLS)
// ============================================================================

async function assertPlatformAdmin(
  userId: string | null | undefined,
): Promise<void> {
  if (!userId) throw new Error("Usuário não autenticado.");
  
  // Usa supabaseAdmin (service role) para bypassar RLS e garantir leitura autoritativa
  const { data: admin, error } = await supabaseAdmin
    .from("platform_admins")
    .select("id, active, role")
    .eq("user_id", userId)
    .maybeSingle();
  
  if (error) {
    console.error("[billing-health] assert_admin_error", { userId, error: error.message });
    throw new Error(`Verificação de admin falhou: ${error.message}`);
  }
  
  if (!admin || !admin.active) {
    console.warn("[billing-health] access_denied", { userId, found: !!admin, active: admin?.active });
    throw new Error("Acesso restrito: apenas superadmins ativos podem visualizar métricas de billing.");
  }
}

// ============================================================================
// FUNÇÃO PÚBLICA 1: SNAPSHOT LEVE
// ============================================================================

const SnapshotInputSchema = z.object({
  limit: z.number().int().min(1).max(50).optional().default(10),
});

export const getBillingHealthSnapshot = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SnapshotInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    // Passa apenas o userId, a função interna usa supabaseAdmin
    await assertPlatformAdmin(context.userId);
    
    const { limit } = data;
    
    const { data: metrics, error } = await supabaseAdmin
      .from("billing_health_metrics")
      .select("*")
      .order("window_start", { ascending: false })
      .limit(limit);
    
    if (error) throw new Error(`snapshot_query: ${error.message}`);
    
    return metrics ?? [];
  });

// ============================================================================
// FUNÇÃO PÚBLICA 2: HEALTH CHECK MANUAL
// ============================================================================

const HealthCheckInputSchema = z.object({
  triggeredBy: z.enum(["manual", "debug"]).optional().default("manual"),
});

export const runBillingHealthCheck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => HealthCheckInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    
    const t0 = Date.now();
    const now = new Date();
    const windowStart = new Date(now.getTime() - 15 * 60 * 1000);
    
    console.log("[billing-health] ▶️ starting_check", {
      userId: context.userId,
      triggeredBy: data.triggeredBy,
    });
    
    try {
      const [
        received, processed, retrying, failed, ignored,
        oldestPendingAgeSec, maxAttemptsSeen,
      ] = await Promise.all([
        countEventsByStatus("received"),
        countEventsByStatus("processed"),
        countRetryingEvents(),
        countEventsByStatus("failed"),
        countEventsByStatus("ignored"),
        getOldestPendingAgeSeconds(),
        getMaxAttemptsInWindow(windowStart),
      ]);
      
      const totalZombiesNow = received;
      const durationMs = Date.now() - t0;
      
      console.log("[billing-health] ✅ collected_metrics", {
        received, processed, retrying, failed, ignored,
        oldestPendingAgeSec, maxAttemptsSeen, durationMs,
      });
      
      const { error: insertErr } = await supabaseAdmin
        .from("billing_health_metrics")
        .insert({
          window_start: windowStart.toISOString(),
          window_end: now.toISOString(),
          events_received: received,
          events_processed: processed,
          events_retrying: retrying,
          events_failed: failed,
          events_ignored: ignored,
          max_attempts_seen: maxAttemptsSeen,
          oldest_pending_age_sec: oldestPendingAgeSec,
          total_zombies_now: totalZombiesNow,
          triggered_by: data.triggeredBy,
          duration_ms: durationMs,
        } as never);
      
      if (insertErr) {
        throw new Error(`Falha ao registrar snapshot: ${insertErr.message}`);
      }
      
      if (oldestPendingAgeSec > 900) {
        console.warn("[billing-health] ⚠️ stale_event_detected", {
          age_seconds: oldestPendingAgeSec,
        });
      }
      
      return {
        ok: true,
        metrics: {
          received, processed, retrying, failed, ignored,
          maxAttemptsSeen, oldestPendingAgeSec, totalZombiesNow, durationMs,
        },
      };
      
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("[billing-health] ❌ critical_error", { error: errorMsg });
      throw err;
    }
  });

// ============================================================================
// FUNÇÕES PÚBLICAS 3 & 4: GERENCIAMENTO DO KILL-SWITCH (CRUD LEVE)
// ============================================================================

/**
 * Lê o estado atual do cron de segurança.
 * Retorna { enabled: boolean, lastRunAt?: string } ou null se não configurado.
 */
export const getCronStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.userId);
    
    const { data, error } = await supabaseAdmin
      .from("billing_cron_config")
      .select("id, enabled, last_run_at, last_run_status")
      .eq("id", "00000000-0000-0000-0000-000000000001")
      .maybeSingle();
    
    if (error) throw new Error(`getCronStatus_error: ${error.message}`);
    
    return data ?? { id: null, enabled: false, last_run_at: null, last_run_status: null };
  });

const SetCronInputSchema = z.object({
  enabled: z.boolean(),
});

/**
 * Ativa ou desativa o cron de segurança.
 * Input: { enabled: boolean }
 */
export const setCronEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => SetCronInputSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    
    const { enabled } = data;
    
    const { error } = await supabaseAdmin
      .from("billing_cron_config")
      .update({ 
        enabled,
        updated_at: new Date().toISOString() 
      } as never)
      .eq("id", "00000000-0000-0000-0000-000000000001");
    
    if (error) throw new Error(`setCronEnabled_error: ${error.message}`);
    
    console.log("[billing-cron] 🔀 toggled", { userId: context.userId, enabled });
    
    return { ok: true, enabled };
  });
