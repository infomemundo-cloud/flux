/**
 * Fase 4.3 — Webhook receiver MP (handler POST).
 *
 * Rota pública: /api/public/mp/webhook?env=test|prod
 * CSRF desabilitado (endpoints de rota não passam pelo middleware de CSRF,
 * que filtra apenas `handlerType === 'serverFn'` em src/start.ts).
 *
 * Ordem de validação (custo crescente):
 *  1. env gate (query param válido)
 *  2. parse body (raw → JSON)
 *  3. live_mode × env (mismatch → 200 early, economiza CPU)
 *  4. HMAC (só se passou nos 3 acima)
 *  5. dedupe + insert em billing_events
 *  6. 200 <22s (SLA do MP)
 *
 * Decisões fechadas (D17):
 *  - Secret única compartilhada entre test/prod (MP_WEBHOOK_SECRET).
 *  - data.id vem do body (não da query).
 *  - Dedupe por payload.id (notification_id).
 *  - Mismatch = 200 silencioso (evita retries + vazamento entre ambientes).
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  extractBillingEventRecord,
  type MpWebhookPayload,
  validateEnvLiveMode,
  verifyMpManifestHmac,
} from "@/lib/billing/mp-webhook";

export const Route = createFileRoute("/api/public/mp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const t0 = Date.now();
        const url = new URL(request.url);

        // 1) env gate
        const envParam = url.searchParams.get("env");
        const env: "test" | "prod" | null =
          envParam === "test" || envParam === "prod" ? envParam : null;

        if (!env) {
          console.warn("[mp-webhook] invalid_env", { envParam });
          return new Response(null, { status: 400 });
        }

        // 2) parse body (raw → JSON)
        const raw = await request.text();
        let payload: MpWebhookPayload;
        try {
          payload = JSON.parse(raw) as MpWebhookPayload;
        } catch {
          console.warn("[mp-webhook] invalid_json");
          return new Response(null, { status: 400 });
        }

        // 3) live_mode × env (early exit em mismatch — economiza CPU + evita retries)
        const liveMode = Boolean(payload?.live_mode);
        const envCheck = validateEnvLiveMode({ env, liveMode });
        if (!envCheck.ok) {
          console.warn("[mp-webhook] env_mismatch", {
            env,
            liveMode,
            notificationId: payload?.id,
            topic: payload?.topic,
          });
          return new Response(null, { status: 200 });
        }

        // 4) validar HMAC (secret única compartilhada entre ambientes)
        const secret = process.env.MP_WEBHOOK_SECRET;
        const xSignature = request.headers.get("x-signature");
        const xRequestId = request.headers.get("x-request-id");

        // data.id vem SEMPRE do body (decisão fechada com consultoria MP)
        const dataId =
          payload?.data?.id != null ? String(payload.data.id) : undefined;

        const hmacResult = verifyMpManifestHmac({
          secret,
          xSignature,
          xRequestId,
          dataId,
        });

        if (!hmacResult.ok) {
          console.warn("[mp-webhook] hmac_failed", {
            reason: hmacResult.reason,
            env,
            liveMode,
            notificationId: payload?.id,
          });
          return new Response(null, { status: hmacResult.status });
        }

        // 5) dedupe + insert em billing_events
        const notificationId = String(payload?.id ?? "").trim();
        if (!notificationId) {
          console.warn("[mp-webhook] missing_notification_id", { env, liveMode });
          return new Response(null, { status: 400 });
        }

        const record = extractBillingEventRecord(payload, liveMode);

        const { supabaseAdmin } = await import(
          "@/integrations/supabase/client.server"
        );
        const { error } = await supabaseAdmin
          .from("billing_events")
          .insert(record);

        if (error) {
          // 23505 = unique violation (retry do MP) — tratar como OK
          const isDuplicate =
            error.code === "23505" || /duplicate/i.test(error.message ?? "");
          if (!isDuplicate) {
            console.error("[mp-webhook] insert_error", {
              error: error.message,
              code: error.code,
              notificationId,
              topic: record.topic,
            });
          } else {
            console.log("[mp-webhook] duplicate", { notificationId });
          }
          // Mesmo em erro, retorna 200 pra evitar retry infinito do MP
        } else {
          console.log("[mp-webhook] ingested", {
            env,
            liveMode,
            notificationId,
            topic: record.topic,
            action: record.action,
            ms: Date.now() - t0,
          });
        }

        // 6) 200 <22s (SLA do MP)
        return new Response(null, { status: 200 });
      },
    },
  },
});
