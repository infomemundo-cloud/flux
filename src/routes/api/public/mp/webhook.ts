/**
 * Fase 4.3/4.5 — Webhook Receiver Mercado Pago (Assinaturas Recorrentes).
 *
 * ARQUITETURA FINAL (2026-10-09, pós-evidência de duas aplicações):
 * 1. Segredo ÚNICO: MP_WEBHOOK_SECRET = segredo ATUAL do app dono dos recursos
 *    (hoje app de teste 46866664961523154 / Flux Vendedor). Salvar/Redefinir no
 *    painel renova o segredo → sempre recopiar para a Vercel + redeploy.
 * 2. HMAC com validação dupla de manifest (semicolons oficial + spaces consultoria);
 *    log forense indica qual formato venceu.
 * 3. Gate env × live_mode SOMENTE observacional: token produtivo de usuário de
 *    teste entrega tudo em ?env=prod com live_mode misto; rejeitar perdia eventos.
 * 4. Todo early-return 200 de segurança grava auditoria (status='ignored').
 * 5. Resposta < 22s sempre (MP espera 200/201; senão retry a cada 15min).
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  extractBillingEventRecord,
  observeEnvLiveMode,
  verifyMpManifestHmac,
  type MpWebhookPayload,
} from "@/lib/billing/mp-webhook";

/** Auditoria: todo descarte de segurança vira linha 'ignored' no ledger. */
async function insertIgnored(
  payload: MpWebhookPayload,
  liveMode: boolean,
  error: string,
  fallbackId: string,
) {
  try {
    const base = extractBillingEventRecord(payload, liveMode);
    await supabaseAdmin.from("billing_events").insert({
      ...base,
      mp_event_id: base.mp_event_id || fallbackId,
      topic: base.topic || "unknown",
      action: base.action || "updated",
      status: "ignored",
      error,
      processed_at: new Date().toISOString(),
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

        // 1) Env param: roteamento/log (e futuro segredo por ambiente). Não rejeita.
        const envParam = url.searchParams.get("env");
        const env: "test" | "prod" | null =
          envParam === "test" || envParam === "prod" ? envParam : null;

        // 2) Segredo único (app dono dos recursos)
        const secret = process.env.MP_WEBHOOK_SECRET;
        if (!secret) {
          console.error("[mp-webhook] missing_webhook_secret_var");
          return new Response(null, { status: 500 });
        }

        // 3) Headers obrigatórios
        const xSignature = request.headers.get("x-signature");
        const xRequestId = request.headers.get("x-request-id");
        if (!xSignature || !xRequestId) {
          console.warn("[mp-webhook] missing_headers", {
            hasSig: !!xSignature,
            hasReqId: !!xRequestId,
          });
          return new Response(null, { status: 400 });
        }

        // 4) Body JSON
        const raw = await request.text();
        let payload: MpWebhookPayload;
        try {
          payload = JSON.parse(raw) as MpWebhookPayload;
        } catch {
          console.warn("[mp-webhook] invalid_json");
          return new Response(null, { status: 400 });
        }
        const liveMode = Boolean(payload?.live_mode);

        // 5) data.id ESTRITAMENTE da query string, lowercase (doc oficial)
        const rawQueryId =
          url.searchParams.get("data.id") || url.searchParams.get("id");
        const dataId = rawQueryId ? rawQueryId.toLowerCase().trim() : undefined;

        if (!dataId) {
          console.error("[mp-webhook] missing_resource_id", { env });
          await insertIgnored(payload, liveMode, "missing_resource_id", `noid_${t0}`);
          return new Response(null, { status: 400 });
        }

        // 6) HMAC (validação dupla de manifest; log forense interno)
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
          // 200 sempre em teste para evitar tempestade de retries; em prod, 401
          return new Response(null, { status: env === "test" ? 200 : hmac.status });
        }

        // 7) Env × live_mode: observacional apenas (não rejeita)
        observeEnvLiveMode({ env, liveMode });

        // 8) Insert como 'received' (dedupe por unique em mp_event_id)
        const record = extractBillingEventRecord(payload, liveMode);
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
            return new Response(null, { status: 200 });
          }
          console.error("[mp-webhook] insert_error", { error: error.message });
          return new Response(null, { status: 500 }); // força retry do MP
        }

        console.log("[mp-webhook] ingested", {
          env,
          notificationId: payload?.id,
          resource_id: dataId,
          hmac_format: hmac.ok ? hmac.format : undefined,
          ms: Date.now() - t0,
        });

        // 9) Processor inline fire-and-forget (token escolhido por live_mode lá)
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
