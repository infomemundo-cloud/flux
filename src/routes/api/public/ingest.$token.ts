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
  // Nome de quem mandou a mensagem, só relevante em grupos (o "contato" ali é
  // o grupo, não a pessoa — mas não queremos perder essa informação).
  participant_name?: string | null;
  // NOVO: o envelope do webhook da Evolution já vem com server_url e apikey —
  // usamos SOMENTE pra buscar o assunto (nome real) do grupo quando necessário.
  evolution_server_url?: string | null;
  evolution_apikey?: string | null;
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

// NOVO: busca o assunto (nome real) do grupo na Evolution API. O messages.upsert
// não traz o subject do grupo — só o pushName de quem mandou — então fazemos uma
// consulta pontual em /group/info. Tenta as duas ordens de parâmetro da rota por
// segurança; qualquer falha vira null (silencioso) e o fluxo segue como "Grupo",
// pra nunca adicionar um ponto de quebra no ingest.
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
      // segue pro próximo candidato; se nenhum funcionar, desiste em silêncio
    }
  }
  console.error("[ingest] não consegui buscar o assunto do grupo", { groupJid, instance });
  return null;
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

    // Telefone só faz sentido pra contato individual — um grupo não tem
    // telefone, o que sobraria aqui seria o ID numérico do grupo fingindo
    // ser um telefone (é a origem do "[Grupo] 101077928144947" feio e sem
    // sentido que você viu na tela).
    const phone = isGroup
      ? undefined
      : jid.replace(/@s\.whatsapp\.net$/i, "").replace(/@c\.us$/i, "");

    // pushName é o nome de QUEM MANDOU a mensagem — num grupo isso é o
    // participante, não o grupo em si. O nome do grupo de verdade vem depois,
    // via fetchGroupSubject (assunto do grupo na Evolution). O nome de quem
    // mandou não se perde: vai junto no metadata do evento.
    const contactName = isGroup ? "Grupo" : d.pushName?.trim() || "Contato WhatsApp";
    const participantName = isGroup ? d.pushName?.trim() || null : null;

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
        participant_name: participantName,
        // NOVO: repassa o envelope pra etapa de contato decidir se busca o assunto
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

        const norm = normalize(payload);
        if (!norm.ok) return json(norm.body, norm.status);
        const b = norm.value;

        // 1. Busca ou cria o contato associado (grupo ou pessoa) pelo external_id
        let contactId: string | null = null;
        if (b.contact?.external_id || b.contact?.phone) {
          // Cada lado do OR só entra na string se realmente existir — antes,
          // external_id sempre entrava mesmo undefined, virando um filtro
          // malformado ("external_id.eq.undefined") quando só havia telefone.
          const orParts = [
            b.contact.external_id ? `external_id.eq.${b.contact.external_id}` : null,
            b.contact.phone ? `phone.eq.${b.contact.phone}` : null,
          ].filter(Boolean).join(",");

          const { data: found, error: findErr } = await supabaseAdmin
            .from("contacts")
            .select("id, name")
            .eq("org_id", tok.org_id)
            .or(orParts)
            .maybeSingle();

          if (findErr) {
            // Antes, um erro aqui sumia sem deixar rastro — a demanda seguia
            // sendo criada, só que sem contato vinculado, sem ninguém saber
            // por quê. Agora fica registrado no log com o contexto todo.
            console.error("[ingest] falha ao buscar contato", {
              org_id: tok.org_id,
              external_id: b.contact.external_id,
              phone: b.contact.phone,
              error: findErr,
            });
          }

          // NOVO: nome real do grupo (assunto), sem mexer em mais nada do fluxo.
          if (b.contact) {
            const isGroup = !!b.whatsapp_jid?.endsWith("@g.us");
            const savedName = found?.name ?? null;
            const savedIsGeneric = !savedName || savedName === "Grupo";
            if (isGroup && !savedIsGeneric) {
              // Contato já tem nome real salvo: não deixa o "Grupo" genérico
              // passar por cima dele nas mensagens seguintes.
              b.contact.name = savedName;
            } else if (
              isGroup &&
              savedIsGeneric &&
              b.evolution_server_url &&
              b.evolution_apikey &&
              b.instance_name
            ) {
              // Primeira vez (ou nome ainda genérico): busca o assunto do grupo
              // uma única vez — depois disso o nome salvo cuida do resto.
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
            // Contato já existia: se a mensagem atual trouxe um nome (ex:
            // pushName da Evolution) e ele é diferente do que está salvo,
            // atualiza. Isso é o que faltava — antes o nome nunca era
            // corrigido depois da primeira vez que o contato era criado,
            // então um contato criado sem nome ficava "Sem contato" pra
            // sempre, mesmo com mensagens novas trazendo o nome certo.
            if (b.contact.name && b.contact.name !== found.name) {
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
            // Só tenta criar se a busca realmente não achou nada — se a busca
            // deu erro (findErr truthy), não faz sentido tentar criar às cegas.
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
            .neq("state", "concluido") // aberto = qualquer estado que não seja concluído (evita esquecer estado novo no futuro)
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
          { status: 200, headers: { "content-type": "application/json" } }
        );
      },
    },
  },
});