/**
 * Fase 4.3/4.5 — Webhook Receiver Mercado Pago (Assinaturas Recorrentes).
 * 
 * CORREÇÕES CRÍTICAS (2026-10-09):
 * 1. Usa MP_WEBHOOK_SECRET (única) em vez de _TEST/_PROD.
 * 2. Gate env × live_mode observacional (não rejeita eventos legítimos).
 * 3. Persiste eventos ignorados para auditoria.
 * 4. Cast apropriado para Json do Supabase no payload.
 */
import { createFileRoute } from "@tanstack/react-router";
import {
  extractBillingEventRecord,
  observeEnvLiveMode,
  type MpWebhookPayload,
  verifyMpManifestHmac,
} from "@/lib/billing/mp-webhook";

async function insertIgnored(
  payload: MpWebhookPayload,
  liveMode: boolean,
  error: string,
  fallbackId: string,
) {
  try {
    const base = extractBillingEventRecord(payload, liveMode);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("billing_events").insert({
      ...base,
      mp_event_id: base.mp_event_id || fallbackId,
      topic: base.topic || "unknown",
      action: base.action || "updated",
      status: "ignored",
      error,
      processed_at: new Date().toISOString(),
      payload: base.payload as never, // Cast para Json do Supabase
    } as never);
  } catch (err) {
    console.error("[mp-webhook] failed_to_persist_ignored", {
      error: err instanceof Error ? err.message : String(err),
      reason: error,
    });
  }
}

export const Route = createFileRoute("/api/public/mp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const t0 = Date.now();
        const url = new URL(request.url);

        const envParam = url.searchParams.get("env");
        const env: "test" | "prod" | null =
          envParam === "test" || envParam === "prod" ? envParam : null;

        const secret = process.env.MP_WEBHOOK_SECRET;
        if (!secret) {
          console.error("[mp-webhook] missing_webhook_secret_var");
          return new Response(null, { status: 500 });
        }

        const xSignature = request.headers.get("x-signature");
        const xRequestId = request.headers.get("x-request-id");

        if (!xSignature || !xRequestId) {
          console.warn("[mp-webhook] missing_headers");
          return new Response(null, { status: 400 });
        }

        const raw = await request.text();
        let payload: MpWebhookPayload;
        try {
          payload = JSON.parse(raw) as MpWebhookPayload;
        } catch {
          console.warn("[mp-webhook] invalid_json");
          return new Response(null, { status: 400 });
        }

        const liveMode = Boolean(payload?.live_mode);

        const rawQueryId = url.searchParams.get("data.id") || url.searchParams.get("id");
        const dataId = rawQueryId ? rawQueryId.toLowerCase().trim() : undefined;

        if (!dataId) {
          console.error("[mp-webhook] missing_resource_id", { env });
          await insertIgnored(payload, liveMode, "missing_resource_id", `noid_${t0}`);
          return new Response(null, { status: 400 });
        }

        const hmac = verifyMpManifestHmac({
          secret,
          xSignature,
          xRequestId,
          dataId,
        });

        if (!hmac.ok) {
          console.warn("[mp-webhook] hmac_failed", {
            reason: hmac.reason,
            notificationId: payload?.id,
            env,
          });
          await insertIgnored(
            payload,
            liveMode,
            `hmac_${hmac.reason}`,
            `${xRequestId}_${dataId}`,
          );
          return new Response(null, { status: env === "test" ? 200 : hmac.status });
        }

        // Observacional apenas — não rejeita
        observeEnvLiveMode({ env, liveMode });

        const record = extractBillingEventRecord(payload, liveMode);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        
        // Cast apropriado para o tipo Json do Supabase
        const { data: inserted, error } = await supabaseAdmin
          .from("billing_events")
          .insert({
            mp_event_id: record.mp_event_id,
            topic: record.topic,
            action: record.action,
            live_mode: record.live_mode,
            payload: record.payload as never, // Cast para Json
            status: record.status,
          } as never)
          .select("id")
          .single();

        if (error) {
          const isDuplicate =
            error.code === "23505" || /duplicate/i.test(error.message ?? "");
          if (isDuplicate) {
            console.log("[mp-webhook] duplicate", { notificationId: payload?.id });
            return new Response(null, { status: 200 });
          }
          console.error("[mp-webhook] insert_error", { error: error.message });
          return new Response(null, { status: 500 });
        }

        console.log("[mp-webhook] ingested", {
          env,
          notificationId: payload?.id,
          resource_id: dataId,
          live_mode: liveMode,
          ms: Date.now() - t0,
        });

        if (inserted?.id) {
          const { processBillingEvent } = await import("@/lib/billing/mp-processor");
          processBillingEvent(inserted.id).catch((err) =>
            console.error("[mp-webhook] inline_processor_error", { err }),
          );
        }

        return new Response(null, { status: 200 });
      },
    },
  },
});
