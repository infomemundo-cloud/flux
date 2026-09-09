import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  title: z.string().min(1).max(200).optional(),
  message: z.string().min(1).max(4000),
  contact: z
    .object({
      name: z.string().max(120).optional(),
      phone: z.string().max(40).optional(),
      email: z.string().max(120).optional(),
      external_id: z.string().max(120).optional(),
    })
    .optional(),
  channel_kind: z
    .enum(["whatsapp", "instagram", "telegram", "email", "portal", "api", "manual"])
    .optional(),
  priority: z.enum(["baixa", "media", "alta", "urgente"]).optional(),
  external_ref: z.string().max(120).optional(),
  reopen_if_open: z.boolean().optional(),
});

type Normalized = z.infer<typeof Body> & {
  channel_type: "simulation" | "evolution" | "whatsapp_official";
  whatsapp_jid?: string | null;
  instance_name?: string | null;
  message_id?: string | null;
};

const EvolutionPayload = z.object({
  event: z.string().optional(),
  instance: z.string().max(120).optional(),
  data: z.object({
    key: z.object({
      remoteJid: z.string().max(180),
      fromMe: z.boolean().optional(),
      id: z.string().max(180).optional(),
      participant: z.string().max(180).optional(), // ID do autor caso seja mensagem em grupo
    }),
    pushName: z.string().max(120).nullish(),
    message: z
      .object({
        conversation: z.string().max(4000).nullish(),
        extendedTextMessage: z.object({ text: z.string().max(4000).nullish() }).nullish(),
      })
      .nullish(),
  }),
});

function looksLikeEvolution(payload: any): boolean {
  if (!payload || typeof payload !== "object") return false;
  return (
    typeof payload.event === "string" ||
    (typeof payload.instance === "string" && Boolean(payload.data))
  );
}

function normalize(payload: unknown):
  | { ok: true; value: Normalized }
  | { ok: false; status: number; body: unknown } {
  if (looksLikeEvolution(payload)) {
    const raw = payload as any;
    const eventName = typeof raw?.event === "string"
      ? raw.event.replace(/_/g, ".").toLowerCase()
      : "";

    if (eventName && eventName !== "messages.upsert") {
      return { ok: false, status: 200, body: { ok: true, ignored: `event_${eventName}` } };
    }

    const parsed = EvolutionPayload.safeParse(payload);
    if (!parsed.success) {
      return { ok: false, status: 200, body: { ok: true, ignored: "non_message_or_invalid_structure" } };
    }

    const d = parsed.data.data;

    if (d.key.fromMe === true) {
      return { ok: false, status: 200, body: { ok: true, ignored: "from_me" } };
    }

    const text = d.message?.conversation ?? d.message?.extendedTextMessage?.text ?? "";
    if (!text.trim()) {
      return { ok: false, status: 200, body: { ok: true, ignored: "unsupported_message_type" } };
    }

    const jid = d.key.remoteJid;
    const isGroup = jid.endsWith("@g.us");

    // Formata o telefone/ID limpo
    const phone = jid
      .replace(/@s\.whatsapp\.net$/i, "")
      .replace(/@c\.us$/i, "")
      .replace(/@g\.us$/i, "");

    // Para grupos, monta um nome legível indicando o autor da mensagem no grupo
    const senderName = d.pushName ?? (isGroup ? "Participante de Grupo" : "Contato WhatsApp");
    const contactName = isGroup ? `[Grupo] ${senderName}` : senderName;

    return {
      ok: true,
      value: {
        message: text.slice(0, 4000),
        contact: {
          name: contactName,
          phone,
          external_id: jid, // Identificador único garantido para grupos e contatos individuais
        },
        channel_kind: "whatsapp",
        channel_type: "evolution",
        whatsapp_jid: jid,
        instance_name: parsed.data.instance ?? null,
        message_id: d.key.id ?? null,
        external_ref: d.key.id ?? undefined,
      },
    };
  }

  const parsed = Body.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      status: 400,
      body: { error: "invalid_body", issues: parsed.error.flatten() },
    };
  }
  return { ok: true, value: { ...parsed.data, channel_type: "simulation" } };
}

export const Route = createFileRoute("/api/public/ingest/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const json = (body: unknown, status: number) =>
          new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
          });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: tok, error: te } = await supabaseAdmin
          .from("webhook_tokens")
          .select("id, org_id, channel_id, organizations:org_id(name)")
          .eq("token", params.token)
          .maybeSingle();

        if (te || !tok) return json({ error: "invalid_token" }, 401);

        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return json({ error: "invalid_json" }, 400);
        }

        const norm = normalize(payload);
        if (!norm.ok) return json(norm.body, norm.status);
        const b = norm.value;

        // 1. Busca ou cria o contato associado (grupo ou pessoa) pelo external_id
        let contactId: string | null = null;
        if (b.contact?.external_id || b.contact?.phone) {
          const { data: found } = await supabaseAdmin
            .from("contacts")
            .select("id")
            .eq("org_id", tok.org_id)
            .or(`external_id.eq.${b.contact.external_id},phone.eq.${b.contact.phone}`)
            .maybeSingle();

          if (found) {
            contactId = found.id;
          } else {
            const { data: c } = await supabaseAdmin
              .from("contacts")
              .insert({
                org_id: tok.org_id,
                name: b.contact.name ?? null,
                phone: b.contact.phone ?? null,
                email: b.contact.email ?? null,
                external_id: b.contact.external_id ?? null,
              })
              .select("id")
              .single();

            contactId = c?.id ?? null;
          }
        }

        // 2. Tenta encontrar uma demanda aberta para este contato
        let demandaId: string | null = null;
        let protocol: string | null = null;

        if (contactId && b.reopen_if_open !== false) {
          const { data: open } = await supabaseAdmin
            .from("demandas")
            .select("id")
            .eq("org_id", tok.org_id)
            .eq("contact_id", contactId)
            .in("state", ["novo", "em_analise", "aguardando_cliente"]) // APENAS ESTADOS ABERTOS
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (open) demandaId = open.id;
        }

        // 3. Se a demanda anterior já estava 'Concluído' ou 'Cancelado' (não achou demanda aberta), CRIA UMA NOVA DEMANDA
        if (!demandaId) {
          const title = b.title ?? b.message.slice(0, 80);
          const { data: dem, error: de } = await supabaseAdmin
            .from("demandas")
            .insert({
              org_id: tok.org_id,
              title,
              description: b.message,
              priority: b.priority ?? "media",
              contact_id: contactId,
              channel_id: tok.channel_id,
              channel_type: b.channel_type,
              whatsapp_jid: b.whatsapp_jid ?? null,
              instance_name: b.instance_name ?? null,
              last_message_id: b.message_id ?? null,
            })
            .select("id, protocol")
            .single();

          if (de || !dem) {
            console.error("[ingest] demanda insert failed", de);
            return json({ error: "internal_error" }, 500);
          }

          demandaId = dem.id;
          protocol = dem.protocol as string | null;
        } else {
          // Atualiza os metadados na demanda existente
          const patch: Record<string, unknown> = { last_message_id: b.message_id ?? null };
          if (b.whatsapp_jid) {
            patch["whatsapp_jid"] = b.whatsapp_jid;
            patch["channel_type"] = b.channel_type;
            if (b.instance_name) patch["instance_name"] = b.instance_name;
          }
          await supabaseAdmin.from("demandas").update(patch as never).eq("id", demandaId);
        }

        if (!protocol && demandaId) {
          const { data: p } = await supabaseAdmin
            .from("demandas")
            .select("protocol")
            .eq("id", demandaId)
            .maybeSingle();

          protocol = (p?.protocol as string | null) ?? null;
        }

        // 4. Registra a nova mensagem recebida no histórico de eventos
        await supabaseAdmin.from("demanda_events").insert({
          org_id: tok.org_id,
          demanda_id: demandaId,
          kind: "message_in",
          content: b.message,
          metadata: {
            external_ref: b.external_ref ?? null,
            channel_kind: b.channel_kind ?? null,
            channel_type: b.channel_type,
            whatsapp_jid: b.whatsapp_jid ?? null,
            instance_name: b.instance_name ?? null,
            message_id: b.message_id ?? null,
          },
        });

        await supabaseAdmin
          .from("webhook_tokens")
          .update({ last_used_at: new Date().toISOString() })
          .eq("id", tok.id);

        return new Response(
          JSON.stringify({
            ok: true,
            demanda_id: demandaId,
            protocol,
            org: (tok as any).organizations?.name ?? null,
          }),
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
    },
  },
});
