/**
 * Fase 4.6 — Checkout callback público (back_url handler). SIMPLIFICADO 2026-10-12.
 *
 * CONFIRMAÇÃO OFICIAL MERCADO PAGO (2026-10-12):
 * No fluxo init_point de assinaturas, back_url é APENAS redirect de navegador
 * (GET do browser), NÃO notificação server-to-server. Webhooks assíncronos são
 * a única fonte de verdade do estado. Portanto este endpoint NÃO puxa o MP,
 * NÃO cria evento sintético e NÃO processa inline — ele só descobre o slug da
 * organização (para montar o destino autenticado) e redireciona. Todo o
 * processamento de estado continua sendo do webhook/processor.
 *
 * Descoberta do slug (ordem):
 *   1) subscriptions.mp_preapproval_id == preapproval_id → org_id (webhook já rodou)
 *   2) fallback billing_checkout_intents (mais recente pending/consumed por
 *      mp_preapproval_id ou criado há pouco) → org_id (webhook ainda não chegou)
 * Se nenhum achar → redirect genérico para /app (hub de orgs); nunca 404 duro,
 * porque o usuário não deve ver erro por uma corrida de webhook.
 */
import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/mp/checkout-callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const t0 = Date.now();
        const url = new URL(request.url);
        const preapprovalId = url.searchParams.get("preapproval_id");
        const status = url.searchParams.get("status") ?? "unknown";

        if (!preapprovalId) {
          console.warn("[mp-callback] ❌ missing_preapproval_id", { status });
          return new Response(null, {
            status: 302,
            headers: { Location: "/app" },
          });
        }

        try {
          // 1) Tentativa principal: subscription já criada pelo webhook.
          let orgId: string | null = null;
          let source: "subscription" | "intent" | null = null;

          const { data: sub } = await supabaseAdmin
            .from("subscriptions")
            .select("org_id")
            .eq("mp_preapproval_id", preapprovalId)
            .maybeSingle();
          if (sub?.org_id) {
            orgId = sub.org_id as string;
            source = "subscription";
          }

          // 2) Fallback: intent de checkout (webhook ainda não persistiu a sub).
          if (!orgId) {
            const { data: intent } = await supabaseAdmin
              .from("billing_checkout_intents")
              .select("org_id")
              .eq("mp_preapproval_id", preapprovalId)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (intent?.org_id) {
              orgId = intent.org_id as string;
              source = "intent";
            }
          }

          // 3) Resolve slug da org.
          if (orgId) {
            const { data: org } = await supabaseAdmin
              .from("organizations")
              .select("slug")
              .eq("id", orgId)
              .maybeSingle();
            if (org?.slug) {
              const redirectTo =
                `/app/o/${encodeURIComponent(org.slug)}/billing/success` +
                `?preapproval_id=${encodeURIComponent(preapprovalId)}` +
                `&status=${encodeURIComponent(status)}`;
              console.log("[mp-callback] ✅ redirected", {
                preapprovalId,
                orgSlug: org.slug,
                orgSource: source,
                status,
                ms: Date.now() - t0,
              });
              return new Response(null, {
                status: 302,
                headers: { Location: redirectTo },
              });
            }
          }

          // 4) Não achou org/slug → hub de organizações (nunca erro duro ao usuário).
          console.log("[mp-callback] 🔸 slug_not_found_redirect_hub", {
            preapprovalId,
            status,
            ms: Date.now() - t0,
          });
          return new Response(null, {
            status: 302,
            headers: { Location: "/app" },
          });
        } catch (err) {
          console.error("[mp-callback] ❌ critical_error", {
            preapprovalId,
            error: err instanceof Error ? err.message : String(err),
          });
          return new Response(null, {
            status: 302,
            headers: { Location: "/app" },
          });
        }
      },
    },
  },
});
