import { createFileRoute } from "@tanstack/react-router";

const STATE_LABEL: Record<string, string> = {
  novo: "Recebida",
  em_analise: "Em análise",
  aguardando_cliente: "Aguardando você",
  aguardando_revisao_humana: "Aguardando revisão humana",
  concluido: "Concluída",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const Route = createFileRoute("/api/public/status/$token")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: tok } = await supabaseAdmin
          .from("webhook_tokens")
          .select("id, org_id, organizations:org_id(name)")
          .eq("token", params.token)
          .maybeSingle();
        if (!tok) return json({ error: "invalid_token" }, 401);
        const org = (tok as any).organizations?.name ?? null;

        const url = new URL(request.url);
        const protocol = (url.searchParams.get("protocol") ?? "").trim().toUpperCase();
        if (!protocol) return json({ ok: true, org });
        if (!/^DM-[A-Z0-9]{6}$/.test(protocol)) return json({ error: "invalid_protocol", org }, 400);

        const { data: dem } = await supabaseAdmin
          .from("demandas")
          .select("id, protocol, title, state, priority, created_at, updated_at, closed_at")
          .eq("org_id", tok.org_id)
          .eq("protocol", protocol)
          .maybeSingle();
        if (!dem) return json({ error: "not_found", org }, 404);

        const { data: events } = await supabaseAdmin
          .from("demanda_events")
          .select("kind, from_value, to_value, created_at")
          .eq("demanda_id", dem.id)
          .in("kind", ["created", "state_changed", "message_in", "message_out", "closed"])
          .order("created_at");

        return json({
          ok: true,
          org,
          demanda: {
            protocol: dem.protocol,
            title: dem.title,
            state: dem.state,
            state_label: STATE_LABEL[dem.state as string] ?? dem.state,
            created_at: dem.created_at,
            updated_at: dem.updated_at,
            closed_at: dem.closed_at,
          },
          timeline: (events ?? []).map((e) => ({
            kind: e.kind,
            at: e.created_at,
            label:
              e.kind === "created"
                ? "Demanda registrada"
                : e.kind === "message_in"
                  ? "Nova mensagem sua registrada"
                  : e.kind === "state_changed"
                    ? `Status atualizado para “${STATE_LABEL[e.to_value as string] ?? e.to_value}”`
                    : "Demanda encerrada",
          })),
        });
      },
    },
  },
});
