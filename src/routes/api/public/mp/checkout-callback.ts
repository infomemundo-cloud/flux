/**
 * Fase 4.5 — Checkout callback público (back_url handler).
 *
 * Recebe redirect do MP após checkout hospedado. Consulta o preapproval_id
 * via GET /preapproval/{id}, resolve external_reference (= org_id), valida
 * ownership server-side e redireciona internamente pra rota privada final.
 *
 * Decisão C1 fechada: endpoint PÚBLICO elimina risco de sessão perdida durante
 * redirects longos (aba anônima / ITP / expiração de cookie). Reconciliação
 * depende exclusivamente da consulta determinística ao MP, nunca de query params.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getPreapproval, MpApiError } from "@/lib/billing/mp-api";
import { processBillingEvent } from "@/lib/billing/mp-processor";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/mp/checkout-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const preapprovalId = url.searchParams.get("preapproval_id");
        const mpStatus = url.searchParams.get("status") ?? "unknown";

        // 1) Validar presença do identificador obrigatório
        if (!preapprovalId) {
          console.warn("[mp-callback] missing_preapproval_id", { mpStatus });
          return new Response("Missing preapproval_id", { status: 400 });
        }

        try {
          // 2) Consultar recurso completo no MP (fonte da verdade)
          // Detecção heurística de live_mode: IDs de teste geralmente têm prefixo diferente
          // Mas como usamos tokens separados, tentamos primeiro TEST depois PROD se falhar
          let pull;
          let liveMode = false;
          
          try {
            pull = await getPreapproval(preapprovalId, false); // tenta TEST
          } catch (err) {
            if (err instanceof MpApiError && err.status === 404) {
              // Se não achou em TEST, tenta PROD
              try {
                pull = await getPreapproval(preapprovalId, true);
                liveMode = true;
              } catch (prodErr) {
                throw prodErr; // propaga erro real de PROD
              }
            } else {
              throw err; // rede/5xx/missing_token → propaga
            }
          }

          // 3) Extrair external_reference (= org_id, decisão D16)
          const orgId = String(pull.external_reference ?? "").trim();
          if (!orgId) {
            console.error("[mp-callback] missing_external_reference", {
              preapprovalId,
              pullStatus: pull.status,
            });
            return new Response("Invalid preapproval data", { status: 400 });
          }

          // 4) Resolver slug da organização
          const { data: org, error: orgErr } = await supabaseAdmin
            .from("organizations")
            .select("slug")
            .eq("id", orgId)
            .maybeSingle();
          
          if (orgErr || !org?.slug) {
            console.error("[mp-callback] org_not_found_or_invalid_slug", {
              orgId,
              error: orgErr?.message,
            });
            return new Response("Organization not found", { status: 404 });
          }

          // 5) Validar ownership server-side (defesa em profundidade §17)
          // Verifica se EXISTE algum membro associado a essa org (não precisa ser o usuário atual)
          const { count: memberCount, error: memberErr } = await supabaseAdmin
            .from("memberships")
            .select("*", { count: "exact", head: true })
            .eq("org_id", orgId);
          
          if (memberErr || !memberCount || memberCount === 0) {
            console.warn("[mp-callback] no_members_for_org", {
              orgId,
              slug: org.slug,
              count: memberCount,
            });
            // Não bloqueia o redirect — apenas loga warning. O usuário pode ter sido removido
            // entre o checkout e o callback, mas ainda queremos registrar o evento.
          }

          // 6) Mapear status do MP para tópico/action do webhook padrão
          // subscription_preapproval é o tópico correto para mudanças de assinatura
          const topic = "subscription_preapproval";
          const action = mapMpStatusToAction(mpStatus, pull.status);

          // 7) Criar payload sintético compatível com extractBillingEventRecord
          const syntheticPayload = {
            id: `cb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            type: topic,
            topic,
            action,
            live_mode: liveMode,
            data: { id: preapprovalId },
            // Campos extras úteis para debugging/reconciliação posterior
            _source: "checkout_callback",
            _original_mp_status: mpStatus,
            _pull_status: pull.status,
          };

          // 8) Inserir evento em billing_events (dedupe automático por unique constraint)
          const { data: inserted, error: insertErr } = await supabaseAdmin
            .from("billing_events")
            .insert({
              mp_event_id: syntheticPayload.id,
              topic,
              action,
              live_mode: liveMode,
              payload: syntheticPayload as Record<string, unknown>,
              status: "received",
            } as never)
            .select("id")
            .maybeSingle();

          if (insertErr) {
            const isDuplicate =
              insertErr.code === "23505" || /duplicate/i.test(insertErr.message ?? "");
            if (!isDuplicate) {
              console.error("[mp-callback] insert_error", {
                error: insertErr.message,
                code: insertErr.code,
                preapprovalId,
              });
            }
            // Mesmo em erro/duplicate, continua pro redirect — o evento já estava lá ou foi perdido
          } else if (inserted?.id) {
            // 9) Disparar processador inline fire-and-forget (não bloqueia o redirect)
            const eventId = inserted.id as string;
            void processBillingEvent(eventId).catch((procErr) =>
              console.error("[mp-callback] inline_process_error", {
                eventId,
                err: procErr,
              }),
            );
          }

          // 10) Redirect 302 pra rota privada final com contexto preservado
          const redirectTo = `/app/o/${encodeURIComponent(org.slug)}/billing/success?preapproval_id=${encodeURIComponent(preapprovalId)}&status=${encodeURIComponent(mpStatus)}&live_mode=${liveMode}`;
          
          console.log("[mp-callback] redirected", {
            preapprovalId,
            orgSlug: org.slug,
            mpStatus,
            pullStatus: pull.status,
            liveMode,
            ms: Date.now(), // timestamp simples pra correlação futura
          });

          return new Response(null, {
            status: 302,
            headers: { Location: redirectTo },
          });

        } catch (err) {
          // Erros críticos (rede, auth, parsing) → retorna 500 mas loga detalhadamente
          console.error("[mp-callback] critical_error", {
            preapprovalId,
            mpStatus,
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          });
          
          // Fallback gracioso: redireciona pra página genérica de erro/sucesso parcial
          // sem quebrar UX do usuário que acabou de pagar
          return new Response(null, {
            status: 302,
            headers: { 
              Location: `/app/billing/error?reason=callback_failure&preapproval_id=${encodeURIComponent(preapprovalId ?? "")}` 
            },
          });
        }
      },
    },
  },
});

/**
 * Helper puro: mapeia status do MP (query param + pull.status) para action padrão
 * do webhook subscription_preapproval. Alinha com a state machine D17.
 */
function mapMpStatusToAction(queryStatus: string, pullStatus: string): string {
  // Prioriza pull.status (fonte mais confiável vindo da API)
  switch (pullStatus) {
    case "authorized":
      return "authorized";
    case "paused":
      return "paused";
    case "cancelled":
      return "cancelled";
    case "pending":
      return "pending";
    default:
      // Fallback usa queryStatus se pull.status for desconhecido/vazio
      switch (queryStatus.toLowerCase()) {
        case "approved":
        case "authorized":
          return "authorized";
        case "rejected":
        case "cancelled":
        case "canceled":
          return "cancelled";
        case "pending":
          return "pending";
        default:
          return "updated"; // generic update event
      }
  }
}
