/**
 * Endpoint interno do Cron de Segurança (Kill-Switch).
 * 
 * ARQUITETURA ISOLADA (§5 Backend Authority + Regra Emergente DT-XX):
 * • Este arquivo termina em .server.ts → bundler TanStack Start/Rolldown ignora
 *   automaticamente durante geração do bundle client-side. Zero risco de vazamento.
 * • Chamado EXCLUSIVAMENTE por /api/internal/cron-trigger.tsx (rota API pura).
 * • Nunca importado por componentes React ou server functions compartilhadas.
 * 
 * FLUXO DE EXECUÇÃO:
 * 1. Valida CRON_SECRET (header Authorization).
 * 2. Consulta billing_cron_config.enabled. Se FALSE → skip imediato (zero carga).
 * 3. Se TRUE → executa processPendingEvents(20) com filtro temporal (>2min).
 * 4. Grava resultado em billing_cron_config.last_run_* para auditoria operacional.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
// Import direto seguro neste contexto (.server.ts não vaza pro client)
import { processPendingEvents } from "./mp-processor"; 

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
  
  // 3. Execução Real (lote conservador de 20 eventos)
  try {
    const start = Date.now();
    
    // Chama a função existente do processor. Ela já tem claim condicional (.eq('status','received'))
    // e zumbi-gate (MAX_ATTEMPTS=10), portanto é segura contra duplo processamento.
    const result = await processPendingEvents(20); 
    
    const durationMs = Date.now() - start;
    
    // 4. Atualizar Configuração com Resumo da Execução
    await supabaseAdmin
      .from("billing_cron_config")
      .update({
        last_run_at: new Date().toISOString(),
        last_run_status: result.failed > 0 ? "partial" : "success",
        last_run_summary: { ...result, duration_ms: durationMs },
      } as never)
      .eq("id", "00000000-0000-0000-0000-000000000001");
    
    console.log("[mp-cron] ✅ EXECUTED", { result, durationMs });
    
    return new Response(JSON.stringify(result), { 
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
    
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[mp-cron] ❌ FAILED", { error: errorMsg });
    
    // Registra falha na config para alerta futuro
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
