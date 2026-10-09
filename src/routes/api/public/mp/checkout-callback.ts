/**
 * Fase 4.5 — Checkout callback público (back_url handler).
 * 
 * ATUALIZAÇÃO 2026-10-09:
 * - Usa MP_ACCESS_TOKEN único (não mais MP_ACCESS_TOKEN_TEST/PROD separados)
 * - live_mode derivado do pull.status (não heurística de ID)
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

        if (!preapprovalId) {
          console.warn("[mp-callback] missing_preapproval_id", { mpStatus });
          return new Response("Missing preapproval_id", { status: 400 });
        }

        try {
          // Usa o token único (MP_ACCESS_TOKEN)
          const liveMode = process.env.MP_ENV === "prod";
          let pull;

          try {
            pull = await getPreapproval(preapprovalId, liveMode);
          } catch (err) {
            if (err instanceof MpApiError && err.status === 404) {
              // Tenta o outro ambiente como fallback
              try {
                pull = await getPreapproval(preapprovalId, !liveMode);
              } catch (fallbackErr) {
                throw fallbackErr;
              }
            } else {
              throw err;
            }
          }

          const orgId = String(pull.external_reference ?? "").trim();

          if (!orgId) {
            console.error("[mp-callback] missing_external_reference", {
              preapprovalId,
              pullStatus: pull.status,
            });
            return new Response("Invalid preapproval data", { status: 400 });
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
          }

          const topic = "subscription_preapproval";
          const action = mapMpStatusToAction(mpStatus, pull.status);

          const syntheticPayload = {
            id: `cb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            type: topic,
            topic,
            action,
            live_mode: liveMode,
            data: { id: preapprovalId },
            _source: "checkout_callback",
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
              insertErr.code === "23505" || /duplicate/i.test(insertErr.message ?? "");
            if (!isDuplicate) {
              console.error("[mp-callback] insert_error", {
                error: insertErr.message,
                code: insertErr.code,
                preapprovalId,
              });
            }
          } else if (inserted?.id) {
            const eventId = inserted.id as string;
            void processBillingEvent(eventId).catch((procErr) =>
              console.error("[mp-callback] inline_process_error", {
                eventId,
                err: procErr,
              }),
            );
          }

          const redirectTo = `/app/o/${encodeURIComponent(org.slug)}/billing/success?preapproval_id=${encodeURIComponent(preapprovalId)}&status=${encodeURIComponent(mpStatus)}&live_mode=${liveMode}`;

          console.log("[mp-callback] redirected", {
            preapprovalId,
            orgSlug: org.slug,
            mpStatus,
            pullStatus: pull.status,
            liveMode,
            ms: Date.now(),
          });

          return new Response(null, {
            status: 302,
            headers: { Location: redirectTo },
          });
        } catch (err) {
          console.error("[mp-callback] critical_error", {
            preapprovalId,
            mpStatus,
            error: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
          });

          return new Response(null, {
            status: 302,
            headers: {
              Location: `/app/billing/error?reason=callback_failure&preapproval_id=${encodeURIComponent(preapprovalId ?? "")}`,
            },
          });
        }
      },
    },
  },
});

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
