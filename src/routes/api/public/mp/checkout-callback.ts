/**
 * Fase 4.5 — Checkout callback público (back_url handler).
 *
 * ALINHAMENTO 2026-10-10:
 * - Resolução de org via resolveOrgForPreapproval (external_reference UUID
 *   OU billing_checkout_intents), mesmo resolver do processor (DRY).
 * - live_mode definido pelo ambiente que respondeu ao pull (test → prod).
 * - Mantém decisão C1: endpoint público, reconciliação determinística por
 *   pull no MP, nunca por query params.
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
        const url = new URL(request.url);
        const preapprovalId = url.searchParams.get("preapproval_id");
        const mpStatus = url.searchParams.get("status") ?? "unknown";

        if (!preapprovalId) {
          console.warn("[mp-callback] missing_preapproval_id", { mpStatus });
          return new Response("Missing preapproval_id", { status: 400 });
        }

        try {
          // 1) Pull determinístico no MP (fonte da verdade), test → prod
          let pull: any = null;
          let liveMode = false;
          try {
            pull = await getPreapproval(preapprovalId, false);
            liveMode = false;
          } catch (firstErr) {
            if (firstErr instanceof MpApiError && firstErr.status === 404) {
              pull = await getPreapproval(preapprovalId, true);
              liveMode = true;
            } else {
              throw firstErr;
            }
          }

          // 2) Resolver org (UUID direto ou intent de checkout)
          const { orgId, source } = await resolveOrgForPreapproval(pull);
          if (!orgId) {
            console.error("[mp-callback] org_unresolved", {
              preapprovalId,
              externalReference: pull?.external_reference,
              planId: pull?.preapproval_plan_id,
            });
            return new Response("Organization not resolved", { status: 404 });
          }

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

          // 3) Evento sintético + processamento inline
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
              console.error("[mp-callback] insert_error", {
                error: insertErr.message,
                code: insertErr.code,
                preapprovalId,
              });
            }
          } else if (inserted?.id) {
          // 9) Processar inline AGUARDADO (serverless congela promises soltas após o response)
          const eventId = inserted.id as string;
            try {
              const outcome = await processBillingEvent(eventId);
              console.log("[mp-callback] inline_process_done", { eventId, outcome });
            } catch (procErr) {
              console.error("[mp-callback] inline_process_error", {
                eventId,
                err: procErr,
              });
            }
          }

          // 4) Redirect 302 pra rota privada final
          const redirectTo =
            `/app/o/${encodeURIComponent(org.slug)}/billing/success` +
            `?preapproval_id=${encodeURIComponent(preapprovalId)}` +
            `&status=${encodeURIComponent(mpStatus)}` +
            `&live_mode=${liveMode}`;

          console.log("[mp-callback] redirected", {
            preapprovalId,
            orgSlug: org.slug,
            orgSource: source,
            mpStatus,
            pullStatus: pull.status,
            liveMode,
          });

          return new Response(null, { status: 302, headers: { Location: redirectTo } });
        } catch (err) {
          console.error("[mp-callback] critical_error", {
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
