import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const Body = z.object({
  title: z.string().min(1).max(200).optional(),
  message: z.string().min(1).max(4000),
  contact: z.object({
    name: z.string().max(120).optional(),
    phone: z.string().max(40).optional(),
    email: z.string().max(120).optional(),
    external_id: z.string().max(120).optional(),
  }).optional(),
  channel_kind: z.enum(["whatsapp","instagram","telegram","email","portal","api","manual"]).optional(),
  priority: z.enum(["baixa","media","alta","urgente"]).optional(),
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
    }),
    pushName: z.string().max(120).nullish(),
    message: z.object({
      conversation: z.string().max(4000).nullish(),
      extendedTextMessage: z.object({ text: z.string().max(4000).nullish() }).nullish(),
    }).nullish(),
  }),
});

function looksLikeEvolution(payload: any): boolean {
  if (!payload || typeof payload !== "object") return false;
  const ev = typeof payload.event === "string" ? payload.event.replace(/_/g, ".").toLowerCase() : "";
  if (ev === "messages.upsert") return true;
  return typeof payload?.data?.key?.remoteJid === "string";
}

/** Converte o corpo bruto do webhook (Evolution ou simulação) numa demanda normalizada. */
function normalize(payload: unknown):
  | { ok: true; value: Normalized }
  | { ok: false; status: number; body: unknown } {
  if (looksLikeEvolution(payload)) {
    const parsed = EvolutionPayload.safeParse(payload);
    if (!parsed.success) return { ok: false, status: 400, body: { error: "invalid_body", issues: parsed.error.flatten() } };
    const d = parsed.data.data;
    // Ignora mensagens enviadas por nós para não criar laço infinito.
    if (d.key.fromMe === true) return { ok: false, status: 200, body: { ok: true, ignored: "from_me" } };
    const text = d.message?.conversation ?? d.message?.extendedTextMessage?.text ?? "";
    if (!text.trim()) return { ok: false, status: 200, body: { ok: true, ignored: "unsupported_message_type" } };
    const jid = d.key.remoteJid;
    const phone = jid.replace(/@s\.whatsapp\.net$/i, "").replace(/@c\.us$/i, "").replace(/@g\.us$/i, "");
    return {
      ok: true,
      value: {
        message: text.slice(0, 4000),
        contact: { name: d.pushName ?? undefined, phone, external_id: jid },
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
  if (!parsed.success) return { ok: false, status: 400, body: { error: "invalid_body", issues: parsed.error.flatten() } };
  return { ok: true, value: { ...parsed.data, channel_type: "simulation" } };
}

export const Route = createFileRoute("/api/public/ingest/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const json = (body: unknown, status: number) =>
          new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: tok, error: te } = await supabaseAdmin
          .from("webhook_tokens").select("id, org_id, channel_id, organizations:org_id(name)").eq("token", params.token).maybeSingle();
        if (te) console.error("[ingest] token lookup failed", te);
        if (te || !tok) return json({ error: "invalid_token" }, 401);
        let payload: unknown;
        try { payload = await request.json(); } catch { return json({ error: "invalid_json" }, 400); }
        const norm = normalize(payload);
        if (!norm.ok) return json(norm.body, norm.status);
        const b = norm.value;

        // upsert contact by phone/external_id
        let contactId: string | null = null;
        if (b.contact?.phone || b.contact?.external_id || b.contact?.email) {
          const filter = b.contact.external_id
            ? { external_id: b.contact.external_id }
            : b.contact.phone ? { phone: b.contact.phone } : { email: b.contact.email! };
          const { data: found } = await supabaseAdmin.from("contacts").select("id")
            .eq("org_id", tok.org_id).match(filter).maybeSingle();
          if (found) {
            contactId = found.id;
          } else {
            const { data: c } = await supabaseAdmin.from("contacts").insert({
              org_id: tok.org_id, name: b.contact.name ?? null, phone: b.contact.phone ?? null,
              email: b.contact.email ?? null, external_id: b.contact.external_id ?? null,
            }).select("id").single();
            contactId = c?.id ?? null;
          }
        }
        // Reopen: if there's an open demanda for the same contact, append message; otherwise create
        let demandaId: string | null = null;
        let protocol: string | null = null;
        if (contactId && b.reopen_if_open !== false) {
          const { data: open } = await supabaseAdmin.from("demandas").select("id")
            .eq("org_id", tok.org_id).eq("contact_id", contactId)
            .in("state", ["novo","em_analise","aguardando_cliente"]).order("created_at", { ascending: false }).limit(1).maybeSingle();
          if (open) demandaId = open.id;
        }
        if (!demandaId) {
          const title = b.title ?? b.message.slice(0, 80);
          const { data: dem, error: de } = await supabaseAdmin.from("demandas").insert({
            org_id: tok.org_id, title, description: b.message,
            priority: b.priority ?? "media",
            contact_id: contactId, channel_id: tok.channel_id,
            channel_type: b.channel_type,
            whatsapp_jid: b.whatsapp_jid ?? null,
            instance_name: b.instance_name ?? null,
            last_message_id: b.message_id ?? null,
          }).select("id, protocol").single();
          if (de || !dem) {
            console.error("[ingest] demanda insert failed", de);
            return json({ error: "internal_error" }, 500);
          }

          demandaId = dem.id;
          protocol = dem.protocol as string | null;
        } else {
          const patch: Record<string, unknown> = { last_message_id: b.message_id ?? null };
          if (b.whatsapp_jid) {
            patch["whatsapp_jid"] = b.whatsapp_jid;
            patch["channel_type"] = b.channel_type;
            if (b.instance_name) patch["instance_name"] = b.instance_name;
          }
          await supabaseAdmin.from("demandas").update(patch as never).eq("id", demandaId);
        }
        if (!protocol && demandaId) {
          const { data: p } = await supabaseAdmin.from("demandas").select("protocol").eq("id", demandaId).maybeSingle();
          protocol = (p?.protocol as string | null) ?? null;
        }
        await supabaseAdmin.from("demanda_events").insert({
          org_id: tok.org_id, demanda_id: demandaId, kind: "message_in",
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
        await supabaseAdmin.from("webhook_tokens").update({ last_used_at: new Date().toISOString() }).eq("id", tok.id);
        return new Response(JSON.stringify({
          ok: true,
          demanda_id: demandaId,
          protocol,
          org: (tok as any).organizations?.name ?? null,
        }), { status: 200, headers: { "content-type": "application/json" } });
      },
    },
  },
});
