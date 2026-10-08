/**
 * Fase 4.3/4.5 — Webhook Receiver Mercado Pago (Assinaturas Recorrentes).
 * 
 * ARQUITETURA MADURA E ESCALÁVEL (2026-10-09):
 * 1. Segredo Único: Usa MP_WEBHOOK_SECRET (configurado na Vercel) para ambos os ambientes.
 *    Elimina o erro "missing_secret_for_env" causado pela busca de variáveis inexistentes.
 * 
 * 2. Roteamento Inteligente por Query Param (?env=test|prod):
 *    - Permite receber webhooks de TESTE em infraestrutura de PRODUÇÃO sem conflito.
 *    - Se ?env=test, aceita live_mode=true OU false (contas de teste variam).
 *    - Se ?env=prod, exige live_mode=true (produção real).
 * 
 * 3. Validação HMAC Correta (Doc Oficial MP):
 *    - Manifest: id:{data_id};request-id:{x_request_id};ts:{ts};
 *    - Separador: ponto-e-vírgula (;) com trailing semicolon obrigatório.
 *    - Data ID: usado exatamente como recebido (sem lowercase forçado).
 * 
 * 4. Extração Robusta de Dados:
 *    - Prioriza Query Params (data.id, type) sobre Body JSON.
 *    - Normaliza payload antes do insert para garantir consistência no processor.
 */
import { createFileRoute } from "@tanstack/react-router";
import crypto from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { processBillingEvent } from "@/lib/billing/mp-processor";

// ---------- Configuração de Credenciais (Segredo Único) ----------
function getWebhookSecret(): string | undefined {
  // Usa a variável única configurada na Vercel (MP_WEBHOOK_SECRET)
  // Isso resolve o erro "missing_secret_for_env" pois não depende de sufixos _PROD/_TEST
  return process.env.MP_WEBHOOK_SECRET;
}

// ---------- Helper: Validação HMAC (Inline para garantir formato correto) ----------
function verifyMpSignature(
  xSignature: string,
  xRequestId: string,
  dataId: string,
  secret: string,
): boolean {
  try {
    // Parse header: "ts=1704908010,v1=618c85..."
    const parts = xSignature.split(",");
    let ts = "";
    let v1 = "";
    for (const part of parts) {
      const [key, value] = part.split("=").map((s) => s.trim());
      if (key === "ts") ts = value;
      if (key === "v1") v1 = value;
    }

    if (!ts || !v1) return false;

    // Manifest EXATO conforme doc oficial MP:
    // https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
    // Formato: id:{data.id};request-id:{x-request-id};ts:{ts};
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

    const computedHash = crypto
      .createHmac("sha256", secret)
      .update(manifest)
      .digest("hex");

    // Comparação segura contra timing attacks
    if (computedHash.length !== v1.length) return false;
    
    return crypto.timingSafeEqual(
      Buffer.from(computedHash, "hex"),
      Buffer.from(v1, "hex"),
    );
  } catch (err) {
    console.error("[mp-webhook] hmac_calculation_error", err);
    return false;
  }
}

export const Route = createFileRoute("/api/public/mp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startTime = Date.now();
        
        try {
          // 1. Carregar Segredo Único
          const secret = getWebhookSecret();
          if (!secret) {
            console.error("[mp-webhook] missing_webhook_secret", { 
              hint: "Configure MP_WEBHOOK_SECRET na Vercel" 
            });
            return new Response("Server configuration error: missing webhook secret", { status: 500 });
          }

          // 2. Ler Headers Essenciais
          const xSignature = request.headers.get("x-signature");
          const xRequestId = request.headers.get("x-request-id");
          
          if (!xSignature || !xRequestId) {
            console.warn("[mp-webhook] missing_headers", { hasSig: !!xSignature, hasReqId: !!xRequestId });
            return new Response("Missing required headers", { status: 400 });
          }

          // 3. Extrair Dados da Query String (Prioridade Máxima - Padrão MP)
          const url = new URL(request.url);
          const dataIdFromQuery = url.searchParams.get("data.id");
          const typeFromQuery = url.searchParams.get("type");
          const envFromQuery = url.searchParams.get("env"); // test ou prod

          // 4. Ler Body JSON (Fallback para payloads completos)
          let body: Record<string, any> = {};
          try {
            const text = await request.text();
            if (text) {
              body = JSON.parse(text);
            }
          } catch (parseErr) {
            console.debug("[mp-webhook] empty_or_invalid_body", { 
              error: parseErr instanceof Error ? parseErr.message : String(parseErr) 
            });
          }

          // 5. Resolver Resource ID e Topic (Query > Body > Defaults)
          const dataIdFromBody = body?.data?.id;
          const resourceId = (dataIdFromQuery || dataIdFromBody || "").toString().trim();
          
          const topicFromBody = body?.type || body?.topic;
          const topic = (typeFromQuery || topicFromBody || "unknown").toString().trim();

          if (!resourceId) {
            console.error("[mp-webhook] missing_resource_id", { 
              queryParam: dataIdFromQuery, 
              bodyData: body?.data 
            });
            return new Response("Missing resource identifier (data.id)", { status: 400 });
          }

          // 6. Validar HMAC (Segurança §17)
          const isValid = verifyMpSignature(xSignature, xRequestId, resourceId, secret);

          if (!isValid) {
            console.warn("[mp-webhook] hmac_verification_failed", { 
              resourceId,
              requestId: xRequestId,
              manifestPreview: `id:${resourceId};request-id:${xRequestId};...`
            });
            // Retorna 200 para parar retries do MP, mas não processa (segurança)
            return new Response("Invalid signature", { status: 200 }); 
          }

          // 7. Filtro de Ambiente Inteligente (RESOLVE O BUG env_mismatch)
          const eventLiveMode = Boolean(body.live_mode);
          
          // Lógica Escalável:
          // - Se a URL diz ?env=test (ou servidor é test), aceitamos live_mode=true OU false.
          //   Isso permite testar fluxos completos em infra de prod sem vazar dados reais.
          // - Se a URL diz ?env=prod E servidor é prod, exigimos live_mode=true.
          const serverEnv = process.env.MP_ENV === "prod" ? "prod" : "test";
          const effectiveEnv = (envFromQuery === "prod" || envFromQuery === "test") 
            ? envFromQuery 
            : serverEnv;
            
          const isTestEndpoint = effectiveEnv === "test";
          const shouldProcess = isTestEndpoint ? true : (eventLiveMode === true);

          if (!shouldProcess) {
            console.log("[mp-webhook] ignored_due_to_env_policy", { 
              effectiveEnv, 
              eventLiveMode,
              resourceId 
            });
            return new Response("Ignored due to environment policy", { status: 200 });
          }

          // 8. Normalizar Payload para Consistência do Processor
          if (!body.data) body.data = {};
          if (!body.data.id) body.data.id = resourceId;
          if (!body.type && !body.topic) body.type = topic;
          if (!body.action && body.event) body.action = body.event;
          if (!body.action) body.action = "updated";

          // 9. Deduplicação & Persistência Atômica
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
            
            console.error("[mp-webhook] db_insert_error", { 
              error: insertErr.message, 
              code: insertErr.code,
              resourceId 
            });
            return new Response("Internal database error", { status: 500 });
          }

          // 10. Processamento Inline Fire-and-Forget
          if (inserted?.id) {
            void processBillingEvent(inserted.id as string)
              .then(() => {
                console.log("[mp-webhook] processed_successfully", { 
                  eventId: inserted.id, 
                  resourceId,
                  topic,
                  env: effectiveEnv,
                  durationMs: Date.now() - startTime
                });
              })
              .catch((procErr) => {
                console.error("[mp-webhook] processing_error", { 
                  eventId: inserted.id, 
                  err: procErr instanceof Error ? procErr.message : String(procErr) 
                });
              });
          }

          // 11. Resposta Imediata Sucesso (MP exige < 22s)
          return new Response(JSON.stringify({ received: true, id: syntheticEventId }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });

        } catch (fatalErr) {
          console.error("[mp-webhook] critical_fatal_error", {
            error: fatalErr instanceof Error ? fatalErr.message : String(fatalErr),
            stack: fatalErr instanceof Error ? fatalErr.stack : undefined,
          });
          return new Response("Internal Server Error", { status: 500 });
        }
      },
    },
  },
});
