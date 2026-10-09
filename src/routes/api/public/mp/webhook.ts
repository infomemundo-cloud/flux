/**
 * Fase 4.3/4.5 — Webhook Receiver Mercado Pago (Assinaturas Recorrentes).
 * 
 * CORREÇÕES CRÍTICAS (2026-10-09):
 * 1. Usa MP_WEBHOOK_SECRET (única) em vez de _TEST/_PROD (resolve missing_secret).
 * 2. Loga qual branch de saída foi tomado (hmac_fail, env_mismatch, etc).
 * 3. Persiste eventos ignorados no banco (status='ignored') para auditoria.
 * 4. Manifest HMAC correto (ponto-e-vírgula) via verifyMpSignature atualizado.
 */
import { createFileRoute } from "@tanstack/react-router";
import crypto from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyMpSignature } from "@/lib/billing/mp-webhook";
import { processBillingEvent } from "@/lib/billing/mp-processor";

// ---------- Helper: Persistir evento ignorado para auditoria ----------
async function insertIgnoredEvent(
  body: Record<string, any>,
  resourceId: string,
  xRequestId: string,
  reason: string
) {
  try {
    const mpEventId = String(body?.id ?? `${xRequestId}_${resourceId}`);
    await supabaseAdmin.from("billing_events").insert({
      mp_event_id: mpEventId,
      topic: String(body?.type ?? body?.topic ?? "unknown"),
      action: String(body?.action ?? "updated"),
      live_mode: Boolean(body?.live_mode),
      payload: body,
      status: "ignored",
      error: reason,
      processed_at: new Date().toISOString(),
    } as never);
    console.log("[mp-webhook] ignored_event_persisted", { mpEventId, reason });
  } catch (err) {
    console.error("[mp-webhook] failed_to_persist_ignored", {
      reason,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export const Route = createFileRoute("/api/public/mp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startTime = Date.now();
        const url = new URL(request.url);
        
        // Log inicial para diagnóstico
        console.log("[mp-webhook] request_received", {
          envParam: url.searchParams.get("env"),
          typeParam: url.searchParams.get("type"),
          dataIdParam: url.searchParams.get("data.id"),
          hasSecret: !!process.env.MP_WEBHOOK_SECRET,
        });

        try {
          // 1. Carregar Segredo Único (resolve missing_secret_for_env)
          const secret = process.env.MP_WEBHOOK_SECRET;
          if (!secret) {
            console.error("[mp-webhook] missing_webhook_secret_var");
            return new Response("Server configuration error", { status: 500 });
          }

          // 2. Ler Headers
          const xSignature = request.headers.get("x-signature");
          const xRequestId = request.headers.get("x-request-id");
          
          if (!xSignature || !xRequestId) {
            console.warn("[mp-webhook] missing_headers");
            return new Response("Missing headers", { status: 400 });
          }

          // 3. Extrair Dados
          const dataIdFromQuery = url.searchParams.get("data.id");
          const typeFromQuery = url.searchParams.get("type");

          let body: Record<string, any> = {};
          try {
            const text = await request.text();
            if (text) body = JSON.parse(text);
          } catch (e) {
            console.debug("[mp-webhook] invalid_json_body");
          }

          const dataIdFromBody = body?.data?.id;
          const resourceId = (dataIdFromQuery || dataIdFromBody || "").toString().trim();
          const topic = (typeFromQuery || body?.type || body?.topic || "unknown").toString().trim();

          if (!resourceId) {
            console.error("[mp-webhook] missing_resource_id");
            await insertIgnoredEvent(body, "unknown", xRequestId, "missing_resource_id");
            return new Response("Missing resource ID", { status: 400 });
          }

          // Normalizar payload
          if (!body.data) body.data = {};
          if (!body.data.id) body.data.id = resourceId;
          if (!body.type && !body.topic) body.type = topic;
          if (!body.action) body.action = body.event || "updated";

          // 4. Validar HMAC
          const isValid = await verifyMpSignature(xSignature, xRequestId, resourceId, secret);

          if (!isValid) {
            console.warn("[mp-webhook] hmac_verification_failed_branch", {
              resourceId,
              envParam: url.searchParams.get("env"),
            });
            // PERSISTIR COMO IGNORADO PARA AUDITORIA
            await insertIgnoredEvent(body, resourceId, xRequestId, "hmac_invalid");
            return new Response("Invalid signature", { status: 200 });
          }

          // 5. Filtro de Ambiente Inteligente
          const eventLiveMode = Boolean(body.live_mode);
          const queryEnv = url.searchParams.get("env");
          const serverEnv = process.env.MP_ENV === "prod" ? "prod" : "test";
          const effectiveEnv = (queryEnv === "prod" || queryEnv === "test") ? queryEnv : serverEnv;
          
          const isTestEndpoint = effectiveEnv === "test";
          const shouldProcess = isTestEndpoint ? true : (eventLiveMode === true);

          if (!shouldProcess) {
            console.log("[mp-webhook] env_policy_rejected_branch", {
              effectiveEnv,
              eventLiveMode,
              resourceId,
            });
            // PERSISTIR COMO IGNORADO PARA AUDITORIA
            await insertIgnoredEvent(body, resourceId, xRequestId, `env_policy_rejected:${effectiveEnv}/live:${eventLiveMode}`);
            return new Response("Ignored due to env policy", { status: 200 });
          }

          // 6. Persistir Evento Válido
          const syntheticEventId = `${xRequestId}_${resourceId}`;
          
          const { data: inserted, error: insertErr } = await supabaseAdmin
            .from("billing_events")
            .insert({
              mp_event_id: syntheticEventId,
              topic,
              action: body.action,
              live_mode: eventLiveMode,
              payload: body,
              status: "received",
            } as never)
            .select("id")
            .single();

          if (insertErr) {
            if (insertErr.code === "23505") {
              console.log("[mp-webhook] duplicate_event_skipped", { syntheticEventId });
              return new Response("Already processed", { status: 200 });
            }
            console.error("[mp-webhook] db_insert_error", { error: insertErr.message });
            return new Response("DB Error", { status: 500 });
          }

          // 7. Processar Inline
          if (inserted?.id) {
            void processBillingEvent(inserted.id as string)
              .then(() => {
                console.log("[mp-webhook] processed_successfully", {
                  eventId: inserted.id,
                  resourceId,
                  durationMs: Date.now() - startTime,
                });
              })
              .catch((err) => {
                console.error("[mp-webhook] processing_error", {
                  eventId: inserted.id,
                  err: err instanceof Error ? err.message : String(err),
                });
              });
          }

          return new Response(JSON.stringify({ received: true, id: syntheticEventId }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });

        } catch (fatalErr) {
          console.error("[mp-webhook] critical_fatal_error", {
            error: fatalErr instanceof Error ? fatalErr.message : String(fatalErr),
          });
          return new Response("Internal Server Error", { status: 500 });
        }
      },
    },
  },
});
