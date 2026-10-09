/**
 * Rota pública de Ingestão de Webhooks Mercado Pago
 */
import { createFileRoute } from "@tanstack/react-router";
import type { MpWebhookPayload } from "@/lib/billing/mp-webhook";
import {
  observeEnvLiveMode,
  verifyMpManifestHmac,
} from "@/lib/billing/mp-webhook";

async function insertIgnored(args: {
  payload: MpWebhookPayload;
  liveMode?: boolean;
  error: string;
  fallbackId: string;
}) {
  const { payload, liveMode, error, fallbackId } = args;

  try {
    const mpEventId = String(payload?.id ?? "").trim() || fallbackId;

    const record = {
      mp_event_id: mpEventId,
      topic: String(payload?.topic ?? payload?.type ?? "").trim() || "unknown",
      action: String(payload?.action ?? "").trim() || "updated",
      live_mode: typeof liveMode === "boolean" ? liveMode : null,
      payload: payload as unknown as Record<string, unknown>,
      status: "ignored",
      error,
      processed_at: new Date().toISOString(),
    };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await supabaseAdmin.from("billing_events").insert(record as never);
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

        // 1) Contexto da URL
        const envParam = url.searchParams.get("env");
        const env: "test" | "prod" | null =
          envParam === "test" || envParam === "prod" ? envParam : null;

        const secret = process.env.MP_WEBHOOK_SECRET;
        if (!secret) {
          console.error("[mp-webhook] missing_webhook_secret_var");
          return new Response(null, { status: 500 });
        }

        // 2) Headers de Assinatura
        const xSignature = request.headers.get("x-signature");
        const xRequestId = request.headers.get("x-request-id");

        if (!xSignature) {
          return new Response(null, { status: 200 });
        }

        // 3) Leitura e Parse do Body
        const raw = await request.text();
        let payload: MpWebhookPayload;
        try {
          payload = JSON.parse(raw) as MpWebhookPayload;
        } catch {
          await insertIgnored({
            payload: { type: "invalid_json" } as MpWebhookPayload,
            liveMode: undefined,
            error: "invalid_json",
            fallbackId: `invalid_json_${t0}`,
          });
          return new Response(null, { status: 200 });
        }

        const liveMode =
          typeof payload.live_mode === "boolean" ? payload.live_mode : undefined;

        // LOG FORENSE DA IDENTIDADE DO EMISSOR
        console.log("[mp-webhook] payload_identity", {
          application_id: payload?.application_id,
          user_id: payload?.user_id,
          live_mode: liveMode,
          action: payload?.action,
          topic: payload?.topic ?? payload?.type,
        });

        observeEnvLiveMode({ env, liveMode });

        // 4) Resolução do dataId exclusivo da URL
        const rawQueryId =
          url.searchParams.get("data.id") || url.searchParams.get("id");
        const dataId = rawQueryId ? rawQueryId.toLowerCase().trim() : undefined;

        if (!dataId) {
          await insertIgnored({
            payload,
            liveMode,
            error: "missing_resource_id",
            fallbackId: `noid_${t0}`,
          });
          return new Response(null, { status: 200 });
        }

        const isTest = liveMode === false || env === "test";

        // 5) Verificação do HMAC
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

          await insertIgnored({
            payload,
            liveMode,
            error: `hmac_${hmac.reason}`,
            fallbackId: `${xRequestId ?? "noreqid"}_${dataId}`,
          });

          return new Response(null, { status: isTest ? 200 : hmac.status });
        }

        // 6) Inserção do Evento Válido
        const record = {
          mp_event_id:
            String(payload.id ?? "").trim() || `${xRequestId ?? "noreqid"}_${dataId}`,
          topic: String(payload.topic ?? payload.type ?? "").trim() || "unknown",
          action: String(payload.action ?? "").trim() || "updated",
          live_mode: liveMode ?? null,
          payload: payload as unknown as Record<string, unknown>,
          status: "received",
        };

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: inserted, error } = await supabaseAdmin
          .from("billing_events")
          .insert(record as never)
          .select("id")
          .single();

        if (error) {
          const isDuplicate =
            error.code === "23505" || /duplicate/i.test(error.message ?? "");

          if (!isDuplicate) {
            console.error("[mp-webhook] insert_error", { error: error.message });
          }

          return new Response(null, { status: 200 });
        }

        console.log("[mp-webhook] ingested", {
          env,
          notificationId: payload?.id,
          resource_id: dataId,
          live_mode: liveMode,
          ms: Date.now() - t0,
        });

        // 7) Invocação Assíncrona do Processador
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
