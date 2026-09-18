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
  participant_name?: string | null;
  evolution_server_url?: string | null;
  evolution_apikey?: string | null;
};

// Schema para o evento contacts.update da Evolution.
const ContactsUpdatePayload = z.object({
  event: z.string().optional(),
  instance: z.string().max(120).optional(),
  data: z.union([
    z.array(
      z.object({
        remoteJid: z.string().max(180),
        pushName: z.string().max(120).nullish(),
        profilePicUrl: z.string().max(500).nullable().optional(),
        instanceId: z.string().max(180).optional(),
      }),
    ),
    z.object({
      remoteJid: z.string().max(180),
      pushName: z.string().max(120).nullish(),
      profilePicUrl: z.string().max(500).nullable().optional(),
      instanceId: z.string().max(180).optional(),
    }),
  ]),
});

const EvolutionPayload = z.object({
  event: z.string().optional(),
  instance: z.string().max(120).optional(),
  data: z.object({
    key: z.object({
      remoteJid: z.string().max(180),
      fromMe: z.boolean().optional(),
      id: z.string().max(180).optional(),
      participant: z.string().max(180).optional(),
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

async function fetchGroupSubject(
  serverUrl: string,
  apikey: string,
  groupJid: string,
  instance: string,
): Promise<string | null> {
  const base = serverUrl.replace(/\/+$/, "");
  const candidates = [
    `${base}/group/info/${encodeURIComponent(groupJid)}/${encodeURIComponent(instance)}`,
    `${base}/group/info/${encodeURIComponent(instance)}/${encodeURIComponent(groupJid)}`,
  ];
  for (const url of candidates) {
    try {
      const res = await fetch(url, { headers: { apikey } });
      if (!res.ok) continue;
      const json: any = await res.json();
      const subject = json?.subject ?? json?.data?.subject;
      if (typeof subject === "string" && subject.trim()) return subject.trim();
    } catch {
      // segue pro próximo candidato
    }
  }
  console.error("[ingest] não consegui buscar o assunto do grupo", { groupJid, instance });
  return null;
}

// Trata eventos contacts.update da Evolution: atualiza o avatar e o nome do contato no banco.
async function handleContactsUpdate(
  orgId: string,
  payload: z.infer<typeof ContactsUpdatePayload>,
): Promise<void> {
  const items = Array.isArray(payload.data) ? payload.data : [payload.data];
  for (const item of items) {
    const hasPhoto = typeof item.profilePicUrl === "string" || item.profilePicUrl === null;
    const hasName = typeof item.pushName === "string" && item.pushName.trim().length > 0;

    // Se não houver nada relevante para atualizar, ignora
    if (!hasPhoto && !hasName) continue;

    const { data: found, error: findErr } = await (
      await import("@/integrations/supabase/client.server")
    ).supabaseAdmin
      .from("contacts")
      .select("id")
      .eq("org_id", orgId)
      .eq("external_id", item.remoteJid)
      .maybeSingle();

    if (findErr) {
      console.error("[ingest] falha ao buscar contato para atualização", {
        org_id: orgId,
        remoteJid: item.remoteJid,
        error: findErr,
      });
      continue;
    }
    if (!found) {
      continue;
    }

    const patch: Record<string, any> = {};

    if (hasPhoto) {
      patch.avatar_fetched_at = new Date().toISOString();
      if (typeof item.profilePicUrl === "string" && item.profilePicUrl.trim()) {
        patch.avatar_url = item.profilePicUrl.trim();
      }
    }

    if (hasName) {
      patch.name = item.pushName!.trim();
    }

    const { error: updErr } = await (
      await import("@/integrations/supabase/client.server")
    ).supabaseAdmin
      .from("contacts")
      .update(patch as never)
      .eq("id", found.id);

    if (updErr) {
      console.error("[ingest] falha ao atualizar contato", {
        contact_id: found.id,
        remoteJid: item.remoteJid,
        error: updErr,
      });
    }
  }
}

function normalize(payload: unknown):
  | { ok: true; value: Normalized }
  | { ok: false; status: number; body: unknown } {
  if (looksLikeEvolution(payload)) {
    const raw = payload as any;
    const eventName =
      typeof raw?.event === "string" ? raw.event.replace(/_/g, ".").toLowerCase() : "";
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
    const phone = isGroup
      ? undefined
      : jid.replace(/@s\.whatsapp\.net$/i, "").replace(/@c\.us$/i, "");
    const contactName = isGroup ? "Grupo" : d.pushName?.trim() || "Contato WhatsApp";
    const participantName = isGroup ? d.pushName?.trim() || null : null;
    return {
      ok: true,
      value: {
        message: text.slice(0, 4000),
        contact: {
          name: contactName,
          phone,
          external_id: jid,
        },
        channel_kind: "whatsapp",
        channel_type: "evolution",
        whatsapp_jid: jid,
        instance_name: parsed.data.instance ?? null,
        message_id: d.key.id ?? null,
        external_ref: d.key.id ?? undefined,
        participant_name: participantName,
        evolution_server_url: typeof raw.server_url === "string" ? raw.server_url : null,
        evolution_apikey: typeof raw.apikey === "string" ? raw.apikey : null,
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

        console.log("[EVOLUTION PAYLOAD CRU]:", JSON.stringify(payload, null, 2));

        const looksLikeContactsUpdate =
          looksLikeEvolution(payload) &&
          typeof (payload as any).event === "string" &&
          (payload as any).event.replace(/_/g, ".").toLowerCase() === "contacts.update";

        if (looksLikeContactsUpdate) {
          const parsed = ContactsUpdatePayload.safeParse(payload);
          if (parsed.success) {
            await handleContactsUpdate(tok.org_id, parsed.data);
          } else {
            console.error("[ingest] contacts.update inválido", parsed.error.flatten());
          }
          return new Response(
            JSON.stringify({ ok: true, event: "contacts.update" }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        const norm = normalize(payload);
        if (!norm.ok) return json(norm.body, norm.status);
        const b = norm.value;

        // 1. Busca ou cria o contato associado
        let contactId: string | null = null;
        if (b.contact?.external_id || b.contact?.phone) {
          const orParts = [
            b.contact.external_id ? `external_id.eq.${b.contact.external_id}` : null,
            b.contact.phone ? `phone.eq.${b.contact.phone}` : null,
          ]
            .filter(Boolean)
            .join(",");
          const { data: found, error: findErr } = await supabaseAdmin
            .from("contacts")
            .select("id, name")
            .eq("org_id", tok.org_id)
            .or(orParts)
            .maybeSingle();

          if (findErr) {
            console.error("[ingest] falha ao buscar contato", {
              org_id: tok.org_id,
              external_id: b.contact.external_id,
              phone: b.contact.phone,
              error: findErr,
            });
          }

          if (b.contact) {
            const isGroup = !!b.whatsapp_jid?.endsWith("@g.us");
            const savedName = found?.name ?? null;
            const savedIsGeneric = !savedName || savedName === "Grupo" || savedName === "Contato WhatsApp";
            
            if (isGroup && !savedIsGeneric) {
              b.contact.name = savedName;
            } else if (
              isGroup &&
              savedIsGeneric &&
              b.evolution_server_url &&
              b.evolution_apikey &&
              b.instance_name
            ) {
              const subject = await fetchGroupSubject(
                b.evolution_server_url,
                b.evolution_apikey,
                b.whatsapp_jid as string,
                b.instance_name,
              );
              if (subject) b.contact.name = subject;
            }
          }

          if (found) {
            contactId = found.id;
            const incomingNameIsGeneric = !b.contact.name || b.contact.name === "Contato WhatsApp";
            const savedNameIsGeneric = !found.name || found.name === "Contato WhatsApp";

            // Só atualiza se o nome recebido for válido e diferente do cadastrado,
            // ou se o cadastrado for genérico e o recebido não for.
            if (
              b.contact.name &&
              b.contact.name !== found.name &&
              (!incomingNameIsGeneric || savedNameIsGeneric)
            ) {
              const { error: updateErr } = await supabaseAdmin
                .from("contacts")
                .update({ name: b.contact.name })
                .eq("id", contactId);

              if (updateErr) {
                console.error("[ingest] falha ao atualizar nome do contato", {
                  contact_id: contactId,
                  novo_nome: b.contact.name,
                  error: updateErr,
                });
              }
            }
          } else if (!findErr) {
            const { data: c, error: insertErr } = await supabaseAdmin
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

            if (insertErr) {
              console.error("[ingest] falha ao criar contato", {
                org_id: tok.org_id,
                external_id: b.contact.external_id,
                phone: b.contact.phone,
                error: insertErr,
              });
            }
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
            .neq("state", "concluido")
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (open) demandaId = open.id;
        }

        // 3. Cria uma nova demanda se necessário
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

        // 4. Registra evento de mensagem e trata idempotência
        if (b.message_id) {
          const { data: already } = await supabaseAdmin
            .from("demanda_events")
            .select("id")
            .eq("org_id", tok.org_id)
            .eq("metadata->>message_id", b.message_id)
            .limit(1)
            .maybeSingle();
          if (already) {
            return new Response(
              JSON.stringify({ ok: true, demanda_id: demandaId, protocol, duplicate: true }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          }
        }

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
            participant_name: b.participant_name ?? null,
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
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
