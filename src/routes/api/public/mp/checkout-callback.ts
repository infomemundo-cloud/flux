/**
 * Fase 4.5/4.6 — Checkout callback público (back_url handler).
 *
 * ITEM 1 DA 4.6 (2026-10-12) — ajustes finos aplicados:
 * 1. Resolução de org via resolveOrgForPreapproval (UUID OU intent) — elimina
 *    o 400 "Invalid preapproval data" do fluxo init_point (external_reference vazio).
 * 2. await obrigatório no processBillingEvent (contrato serverless; void congelava
 *    a promise — mesma lição que matou os eventos de 22:41 em 2026-10-10).
 * 3. live_mode definido pelo ambiente que RESPONDEU ao pull (test→prod), não por
 *    MP_ENV — coerente com o receiver, que deriva do env quando o payload não traz.
 * 4. Contrato de logs padronizado: ✅ sucesso · 🔸 ramo alternativo/degradado ·
 *    ❌ erro. Prefixo [mp-callback] para filtro na Vercel.
 *
 * Mantém decisão C1: endpoint público, reconciliação determinística por pull no MP,
 * nunca por query params. Zero dependência de sessão ativa no redirect.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getPreapproval, MpApiError } from "@/lib/billing/mp-api";
import {
  processBillingEvent,
  resolveOrgForPreapproval,
} from "@/lib/billing/mp-processor";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/mp/checkout-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const t0 = Date.now();
        const url = new URL(request.url);
        const preapprovalId = url.searchParams.get("preapproval_id");
        const mpStatus = url.searchParams.get("status") ?? "unknown";

        if (!preapprovalId) {
          console.warn("[mp-callback] ❌ missing_preapproval_id", { mpStatus });
          return new Response("Missing preapproval_id", { status: 400 });
        }

        try {
          // 1) Pull determinístico no MP (fonte da verdade): test → prod.
          //    live_mode = ambiente que respondeu, não MP_ENV.
          let pull: any = null;
          let liveMode = false;
          try {
            pull = await getPreapproval(preapprovalId, false);
            liveMode = false;
          } catch (firstErr) {
            if (firstErr instanceof MpApiError && firstErr.status === 404) {
              pull = await getPreapproval(preapprovalId, true);
              liveMode = true;
              console.log("[mp-callback] 🔸 pull_fallback_prod", { preapprovalId });
            } else {
              throw firstErr;
            }
          }

          // 2) Resolver org (UUID direto OU intent de checkout).
          //    No fluxo init_point o external_reference vem vazio → cai no ramo intent.
          const { orgId, source } = await resolveOrgForPreapproval(pull);
          if (!orgId) {
            console.error("[mp-callback] ❌ org_unresolved", {
              preapprovalId,
              externalReference: pull?.external_reference,
              planId: pull?.preapproval_plan_id,
            });
            return new Response("Organization not resolved", { status: 404 });
          }
          if (source === "intent") {
            console.log("[mp-callback] 🔸 org_via_intent", { preapprovalId, orgId });
          }

          const { data: org, error: orgErr } = await supabaseAdmin
            .from("organizations")
            .select("slug")
            .eq("id", orgId)
            .maybeSingle();
          if (orgErr || !org?.slug) {
            console.error("[mp-callback] ❌ org_not_found_or_invalid_slug", {
              orgId,
              error: orgErr?.message,
            });
            return new Response("Organization not found", { status: 404 });
          }

          // 3) Evento sintético + processamento inline AGUARDADO (serverless).
          const topic = "subscription_preapproval";
          const action = mapMpStatusToAction(mpStatus, String(pull.status ?? ""));
          const syntheticPayload = {
            id: `cb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            type: topic,
            topic,
            action,
            live_mode: liveMode,
            data: { id: preapprovalId },
            _source: "checkout_callback",
            _org_source: source,
            _original_mp_status: mpStatus,
            _pull_status: pull.status,
          };

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
              insertErr.code === "23505" ||
              /duplicate/i.test(insertErr.message ?? "");
            if (!isDuplicate) {
              console.error("[mp-callback] ❌ insert_error", {
                error: insertErr.message,
                code: insertErr.code,
                preapprovalId,
              });
            } else {
              console.log("[mp-callback] 🔸 duplicate_event", { preapprovalId });
            }
          } else if (inserted?.id) {
            const eventId = inserted.id as string;
            try {
              const outcome = await processBillingEvent(eventId);
              console.log("[mp-callback] ✅ inline_process_done", {
                eventId,
                outcome,
                ms: Date.now() - t0,
              });
            } catch (procErr) {
              console.error("[mp-callback] ❌ inline_process_error", {
                eventId,
                err: procErr,
              });
            }
          }

          // 4) Redirect 302 pra rota privada final.
          const redirectTo =
            `/app/o/${encodeURIComponent(org.slug)}/billing/success` +
            `?preapproval_id=${encodeURIComponent(preapprovalId)}` +
            `&status=${encodeURIComponent(mpStatus)}` +
            `&live_mode=${liveMode}`;

          console.log("[mp-callback] ✅ redirected", {
            preapprovalId,
            orgSlug: org.slug,
            orgSource: source,
            mpStatus,
            pullStatus: pull.status,
            liveMode,
            ms: Date.now() - t0,
          });
          return new Response(null, { status: 302, headers: { Location: redirectTo } });
        } catch (err) {
          console.error("[mp-callback] ❌ critical_error", {
            preapprovalId,
            mpStatus,
            error: err instanceof Error ? err.message : String(err),
          });
          return new Response(null, {
            status: 302,
            headers: {
              Location:
                `/app/billing/error?reason=callback_failure` +
                `&preapproval_id=${encodeURIComponent(preapprovalId ?? "")}`,
            },
          });
        }
      },
    },
  },
});

/** Mapeia status do MP (pull.status优先, query como fallback) para action D17. */
function mapMpStatusToAction(queryStatus: string, pullStatus: string): string {
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
          return "updated";
      }
  }
}
