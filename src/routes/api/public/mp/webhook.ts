/**
 * Rota pública de Ingestão de Webhooks Mercado Pago
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

        // 2) Parse do Body
        const raw = await request.text();
        let payload: MpWebhookPayload;
        try {
          payload = JSON.parse(raw) as MpWebhookPayload;
        } catch {
          console.warn("[mp-webhook] invalid_json");
          return new Response(null, { status: 400 });
        }

        // 3) Validação Env x LiveMode
        const liveMode = Boolean(payload?.live_mode);
        const envCheck = validateEnvLiveMode({ env, liveMode });
        if (!envCheck.ok) {
          console.warn("[mp-webhook] env_mismatch", {
            env,
            liveMode,
            notificationId: payload?.id,
          });
          return new Response(null, { status: 200 });
        }

        // 4) Resolução do data.id (Prioridade: URL query param > body payload.data.id)
        const dataIdFromQuery = url.searchParams.get("data.id") || url.searchParams.get("id");
        const dataIdFromBody = payload?.data?.id != null ? String(payload.data.id) : undefined;
        
        const dataId = dataIdFromQuery || dataIdFromBody;
        const dataIdOrigin: "query" | "body" | "none" = dataIdFromQuery
          ? "query"
          : dataIdFromBody
          ? "body"
          : "none";

        // 5) Validação do HMAC
        const secret = process.env.MP_WEBHOOK_SECRET;
        const xSignature = request.headers.get("x-signature");
        const xRequestId = request.headers.get("x-request-id");

        const hmacResult = verifyMpManifestHmac({
          secret,
          xSignature,
          xRequestId,
          dataId,
          dataIdOrigin,
        });

        const record = extractBillingEventRecord(payload, liveMode);
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        if (!hmacResult.ok) {
          console.warn("[mp-webhook] hmac_failed", {
            reason: hmacResult.reason,
            notificationId: payload?.id,
          });

          // Grava evento como ignored para auditoria
          await supabaseAdmin.from("billing_events").insert({
            ...record,
            status: "ignored",
            error: `hmac_${hmacResult.reason}`,
          });

          return new Response(null, { status: hmacResult.status });
        }

        // 6) Fluxo Normal: Inserção como 'received'
        const { data: inserted, error } = await supabaseAdmin
          .from("billing_events")
          .insert(record)
          .select("id")
          .single();

        if (error) {
          const isDuplicate =
            error.code === "23505" || /duplicate/i.test(error.message ?? "");
          if (isDuplicate) {
            console.log("[mp-webhook] duplicate", { notificationId: payload?.id });
          } else {
            console.error("[mp-webhook] insert_error", { error: error.message });
          }
        } else {
          console.log("[mp-webhook] ingested", {
            env,
            notificationId: payload?.id,
            ms: Date.now() - t0,
          });

          // Disparo inline do processor
          if (inserted?.id) {
            const { processBillingEvent } = await import("@/lib/billing/mp-processor");
            processBillingEvent(inserted.id).catch((err) => {
              console.error("[mp-webhook] inline_processor_error", { err });
            });
          }
        }

        return new Response(null, { status: 200 });
      },
    },
  },
});
