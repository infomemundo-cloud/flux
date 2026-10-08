/**
 * Fase 4.3/4.5 — Webhook Receiver Mercado Pago (Assinaturas Recorrentes).
 * 
 * ARQUITETURA MADURA E ESCALÁVEL (2026-10-09):
 * 1. Roteamento Inteligente por Query Param (?env=test|prod):
 *    - Permite receber webhooks de TESTE em infraestrutura de PRODUÇÃO sem conflito.
 *    - Seleciona automaticamente o SEGREDО correto baseado no 'env' da URL.
 *    - Elimina o erro "env_mismatch" visto nos logs ao alinhar validação com a origem real.
 * 
 * 2. Extração Robusta de Dados:
 *    - Prioriza Query Params (data.id, type) sobre Body JSON (padrão MP para notificações leves).
 *    - Normaliza payload antes do insert para garantir consistência no processor.
 * 
 * 3. Segurança (§17):
 *    - Validação HMAC estrita usando o segredo específico do ambiente detectado.
 *    - Deduplicação via unique constraint (mp_event_id).
 *    - Resposta imediata 200 OK para evitar retries infinitos do MP (< 22s timeout).
 * 
 * 4. Variáveis de Ambiente Suportadas:
 *    - MP_ACCESS_TOKEN_TEST / MP_ACCESS_TOKEN_PROD (usados pelo processor downstream)
 *    - MP_WEBHOOK_SECRET_TEST / MP_WEBHOOK_SECRET_PROD (selecionados dinamicamente aqui)
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyMpSignature } from "@/lib/billing/mp-webhook";
import { processBillingEvent } from "@/lib/billing/mp-processor";

// ---------- Configuração Dinâmica de Credenciais ----------
function getEnvConfig(requestUrl: string) {
  const url = new URL(requestUrl);
  // Fonte de verdade: query param ?env=test ou ?env=prod
  // Fallback: variável de servidor MP_ENV (para compatibilidade retroativa)
  const queryEnv = url.searchParams.get("env");
  const serverEnv = process.env.MP_ENV === "prod" ? "prod" : "test";
  const effectiveEnv = (queryEnv === "prod" || queryEnv === "test") ? queryEnv : serverEnv;

  return {
    env: effectiveEnv,
    secret: effectiveEnv === "prod" 
      ? process.env.MP_WEBHOOK_SECRET_PROD 
      : process.env.MP_WEBHOOK_SECRET_TEST,
  };
}

export const Route = createFileRoute("/api/public/mp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startTime = Date.now();
        
        try {
          // 1. Detectar Ambiente e Carregar Segredo Correspondente
          const config = getEnvConfig(request.url);
          
          if (!config.secret) {
            console.error("[mp-webhook] missing_secret_for_env", { env: config.env });
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
          const typeFromQuery = url.searchParams.get("type"); // Ex: subscription_preapproval

          // 4. Ler Body JSON (Fallback para payloads completos)
          let body: Record<string, any> = {};
          try {
            const text = await request.text();
            if (text) {
              body = JSON.parse(text);
            }
          } catch (parseErr) {
            // Não aborta — notificações MP frequentemente vêm só com query params + headers
            console.debug("[mp-webhook] empty_or_invalid_body", { error: parseErr instanceof Error ? parseErr.message : String(parseErr) });
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

          // 6. Normalizar Payload para Consistência do Processor
          if (!body.data) body.data = {};
          if (!body.data.id) body.data.id = resourceId;
          if (!body.type && !body.topic) body.type = topic;
          if (!body.action && body.event) body.action = body.event;
          if (!body.action) body.action = "updated"; // Default seguro

          // 7. Validar HMAC (Segurança §17) com Segredo Específico do Ambiente
          const isValid = await verifyMpSignature(
            xSignature, 
            xRequestId, 
            resourceId, 
            config.secret
          );

          if (!isValid) {
            console.warn("[mp-webhook] hmac_verification_failed", { 
              env: config.env, 
              resourceId,
              requestId: xRequestId 
            });
            // Retorna 200 para parar retries do MP, mas não processa (segurança)
            return new Response("Invalid signature", { status: 200 }); 
          }

          // 8. Filtro de Ambiente Inteligente (RESOLVE O BUG env_mismatch)
          const eventLiveMode = Boolean(body.live_mode);
          
          // Lógica Escalável:
          // - Se a URL diz ?env=test, aceitamos live_mode=true OU false (contas de teste podem variar).
          // - Se a URL diz ?env=prod, exigimos live_mode=true (produção real).
          // Isso permite testar fluxos completos em infra de prod sem vazar dados reais.
          const isTestEndpoint = config.env === "test";
          const shouldProcess = isTestEndpoint ? true : (eventLiveMode === true);

          if (!shouldProcess) {
            console.log("[mp-webhook] ignored_due_to_env_policy", { 
              endpointEnv: config.env, 
              eventLiveMode,
              resourceId 
            });
            return new Response("Ignored due to environment policy", { status: 200 });
          }

          // 9. Deduplicação & Persistência Atômica
          const syntheticEventId = `${xRequestId}_${resourceId}`;
          
          const { data: inserted, error: insertErr } = await supabaseAdmin
            .from("billing_events")
            .insert({
              mp_event_id: syntheticEventId,
              topic,
              action: body.action,
              live_mode: eventLiveMode,
              payload: body, // Payload normalizado
              status: "received",
            } as never)
            .select("id")
            .single();

          if (insertErr) {
            // Duplicate key (23505) = já processamos este evento anteriormente
            if (insertErr.code === "23505") {
              console.log("[mp-webhook] duplicate_event_skipped", { syntheticEventId });
              return new Response("Already processed", { status: 200 });
            }
            
            console.error("[mp-webhook] db_insert_error", { 
              error: insertErr.message, 
              code: insertErr.code,
              resourceId 
            });
            // Erro de DB crítico → 500 força retry do MP (resiliência)
            return new Response("Internal database error", { status: 500 });
          }

          // 10. Processamento Inline Fire-and-Forget (Não bloqueia resposta HTTP)
          if (inserted?.id) {
            void processBillingEvent(inserted.id as string)
              .then(() => {
                console.log("[mp-webhook] processed_successfully", { 
                  eventId: inserted.id, 
                  resourceId,
                  topic,
                  env: config.env,
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
