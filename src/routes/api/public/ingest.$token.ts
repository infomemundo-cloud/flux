import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import {
  fetchMediaFromEvolution,
  uploadMediaToStorage,
  uploadThumbToStorage,
  bufferFromByteMap,
} from "@/lib/demandas/media-storage";
import { resolveAutoAssignment } from "@/lib/demandas/assignment";
import { recordWebhookDelivery } from "@/lib/webhook-delivery-log";
import { resolveAccountAccess } from "@/lib/billing/account-access";

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

/** Tipos de mensagem de mídia que a Evolution manda dentro de `message`. */
const MEDIA_KINDS = [
  "imageMessage",
  "audioMessage",
  "videoMessage",
  "documentMessage",
  "stickerMessage",
] as const;

type MediaKind = (typeof MEDIA_KINDS)[number];

const MEDIA_LABEL: Record<MediaKind, string> = {
  imageMessage: "Imagem recebida",
  audioMessage: "Áudio recebido",
  videoMessage: "Vídeo recebido",
  documentMessage: "Documento recebido",
  stickerMessage: "Figurinha recebida",
};

/** Preview da fila quando a mensagem é só mídia (sem legenda). */
const PREVIEW_LABEL: Record<MediaKind, string> = {
  imageMessage: "[Imagem]",
  audioMessage: "[Áudio]",
  videoMessage: "[Vídeo]",
  documentMessage: "[Documento]",
  stickerMessage: "[Figurinha]",
};

type Normalized = z.infer<typeof Body> & {
  channel_type: "simulation" | "evolution" | "whatsapp_official";
  whatsapp_jid?: string | null;
  instance_name?: string | null;
  message_id?: string | null;
  participant_name?: string | null;
  participant_jid?: string | null;
  evolution_server_url?: string | null;
  evolution_apikey?: string | null;
  media?: {
    kind: MediaKind;
    mimetype: string | null;
    caption: string | null;
    fileName: string | null;
    seconds: number | null;
    jpegThumbnail: unknown;
  } | null;
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

const MediaMessageSchema = z.object({
  mimetype: z.string().max(120).nullish(),
  caption: z.string().max(4000).nullish(),
  fileName: z.string().max(300).nullish(),
  fileLength: z.any().nullish(),
  width: z.number().nullish(),
  height: z.number().nullish(),
  seconds: z.number().nullish(),
  jpegThumbnail: z.any().nullish(),
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
        imageMessage: MediaMessageSchema.nullish(),
        audioMessage: MediaMessageSchema.nullish(),
        videoMessage: MediaMessageSchema.nullish(),
        documentMessage: MediaMessageSchema.nullish(),
        stickerMessage: MediaMessageSchema.nullish(),
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

/** Campos binários substituídos por placeholder no log de console. */
const BINARY_LOG_FIELDS = new Set([
  "jpegThumbnail",
  "mediaKey",
  "fileSha256",
  "fileEncSha256",
  "midQualityFileSha256",
  "scansSidecar",
  "scanLengths",
  "messageSecret",
  "paddingBytes",
  "thumbnailSha256",
  "thumbnailEncSha256",
]);

function redactForLog(payload: unknown): string {
  return JSON.stringify(
    payload,
    (key, value) => (BINARY_LOG_FIELDS.has(key) ? "<binário omitido no log>" : value),
    2,
  );
}

/**
 * ============ ESCUDOS ANTI-RUÍDO (pós-migração Hostinger) ============
 * A Evolution v2 re-emite messages.upsert a cada transição de status
 * (DELIVERY_ACK etc.) e o tráfego de grupo descartado pagava 2-5 queries
 * por POST (~76k queries/hora em webhook_tokens no pico). Estes escudos
 * matam o ruído ANTES de qualquer query, SEM alterar o caminho de mensagem
 * real — que segue idêntico, com o dedup de banco (demanda_events) e o
 * advisory lock do RPC como fontes de verdade.
 *
 *   1) resolveToken: memo 60s de token+org+flag → 1 SELECT/min/token;
 *   2) seenWindow: dedup em memória por message_id (10min) → re-emissões
 *      morrem em 0 query; entre instâncias/após a janela, o banco decide;
 *   3) lastUsedTouch: UPDATE de last_used_at no máx. 1x/min/token.
 *
 * Multi-instância (Vercel): memos são best-effort POR instância — corretude
 * NUNCA depende deles. Grupo descartado e descartes de negócio marcam o
 * message_id pra re-emissões não repetirem nem o parse de negócio.
 */
type TokenMemo = {
  id: string;
  org_id: string;
  channel_id: string | null;
  orgName: string | null;
  allowGroup: boolean;
};
const tokenMemo = new Map<string, { at: number; value: TokenMemo | null }>();
const TOKEN_MEMO_TTL = 60_000;

async function resolveToken(token: string): Promise<TokenMemo | null> {
  const hit = tokenMemo.get(token);
  if (hit && Date.now() - hit.at < TOKEN_MEMO_TTL) return hit.value;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("webhook_tokens")
    .select("id, org_id, channel_id, organizations:org_id(name, allow_group_ingest)")
    .eq("token", token)
    .maybeSingle();
  const value: TokenMemo | null =
    error || !data
      ? null
      : {
          id: data.id,
          org_id: data.org_id,
          channel_id: data.channel_id,
          orgName: (data as any).organizations?.name ?? null,
          allowGroup: (data as any).organizations?.allow_group_ingest !== false,
        };
  tokenMemo.set(token, { at: Date.now(), value });
  return value;
}

const seenWindow = new Map<string, number>();
const SEEN_TTL = 10 * 60_000;
const SEEN_MAX = 5_000;

function seenBefore(id: string): boolean {
  const at = seenWindow.get(id);
  return !!at && Date.now() - at < SEEN_TTL;
}

function markSeen(id: string | null | undefined): void {
  if (!id) return;
  if (seenWindow.size >= SEEN_MAX) seenWindow.clear();
  seenWindow.set(id, Date.now());
}

const lastUsedTouch = new Map<string, number>();

/**
 * Busca o SUBJECT (nome real) do grupo na Evolution.
 * Rotas candidatas cobrem Evolution v2 (`/group/info` nas duas ordens),
 * v1 (`/group/findGroupInfos/{instance}?groupJid=...`) e v2 sem instance.
 * O log de falha lista o status de cada tentativa — dá pra ver no
 * Vercel qual rota a sua versão da Evolution atende.
 */
async function fetchGroupSubject(
  serverUrl: string,
  apikey: string,
  groupJid: string,
  instance: string,
): Promise<string | null> {
  const base = serverUrl.replace(/\/+$/, "");
  const jid = encodeURIComponent(groupJid);
  const inst = encodeURIComponent(instance);
  const candidates: { url: string; kind: string }[] = [
    { url: `${base}/group/info/${jid}/${inst}`, kind: "v2-jid-instance" },
    { url: `${base}/group/info/${inst}/${jid}`, kind: "v2-instance-jid" },
    { url: `${base}/group/findGroupInfos/${inst}?groupJid=${jid}`, kind: "v1-findGroupInfos" },
    { url: `${base}/group/info/${jid}`, kind: "v2-jid-only" },
  ];
  const tried: string[] = [];
  for (const c of candidates) {
    try {
      const res = await fetch(c.url, { headers: { apikey } });
      if (!res.ok) {
        tried.push(`${c.kind}:${res.status}`);
        continue;
      }
      const json: any = await res.json();
      const subject =
        json?.subject ??
        json?.data?.subject ??
        json?.response?.subject ??
        (Array.isArray(json?.data) ? json.data[0]?.subject : null) ??
        (Array.isArray(json) ? json[0]?.subject : null);
      if (typeof subject === "string" && subject.trim()) return subject.trim();
      tried.push(`${c.kind}:sem-subject`);
    } catch {
      tried.push(`${c.kind}:erro`);
    }
  }
  console.error("[ingest] não consegui buscar o assunto do grupo", {
    groupJid,
    instance,
    tried,
  });
  return null;
}

/**
 * Trata eventos contacts.update da Evolution: atualiza o avatar e o nome
 * do contato no banco. GRUPOS (@g.us) NUNCA recebem patch.name aqui —
 * a Evolution manda o pushName do ÚLTIMO participante como pushName do
 * remoteJid do grupo, o que corrompia o nome do grupo a cada mensagem.
 * Avatar continua atualizando pra qualquer jid.
 */
async function handleContactsUpdate(
  orgId: string,
  payload: z.infer<typeof ContactsUpdatePayload>,
): Promise<void> {
  const items = Array.isArray(payload.data) ? payload.data : [payload.data];
  for (const item of items) {
    const isGroup = item.remoteJid.endsWith("@g.us");
    const hasPhoto = typeof item.profilePicUrl === "string" || item.profilePicUrl === null;
    const hasName = typeof item.pushName === "string" && item.pushName.trim().length > 0;
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
    if (!found) continue;
    const patch: Record<string, any> = {};
    if (hasPhoto) {
      patch.avatar_fetched_at = new Date().toISOString();
      if (typeof item.profilePicUrl === "string" && item.profilePicUrl.trim()) {
        patch.avatar_url = item.profilePicUrl.trim();
      }
    }
    // GRUPO: nunca aplicar pushName como nome (é o nome do último
    // participante). Nome de grupo só via fetchGroupSubject ou edição manual.
    if (hasName && !isGroup) {
      patch.name = item.pushName!.trim();
    }
    // Se não sobrou nada no patch (grupo só com pushName), pula o update.
    if (Object.keys(patch).length === 0) continue;
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

function normalize(
  payload: unknown,
): { ok: true; value: Normalized } | { ok: false; status: number; body: unknown } {
  if (looksLikeEvolution(payload)) {
    const raw = payload as any;
    const eventName =
      typeof raw?.event === "string" ? raw.event.replace(/_/g, ".").toLowerCase() : "";
    if (eventName && eventName !== "messages.upsert") {
      return { ok: false, status: 200, body: { ok: true, ignored: `event_${eventName}` } };
    }
    const parsed = EvolutionPayload.safeParse(payload);
    if (!parsed.success) {
      return {
        ok: false,
        status: 200,
        body: { ok: true, ignored: "non_message_or_invalid_structure" },
      };
    }
    const d = parsed.data.data;
    if (d.key.fromMe === true) {
      return { ok: false, status: 200, body: { ok: true, ignored: "from_me" } };
    }
    const text = d.message?.conversation ?? d.message?.extendedTextMessage?.text ?? "";
    const mediaFound = MEDIA_KINDS.map((kind) => ({ kind, msg: d.message?.[kind] })).find(
      (x) => x.msg,
    );
    if (!text.trim() && !mediaFound) {
      return { ok: false, status: 200, body: { ok: true, ignored: "unsupported_message_type" } };
    }
    const caption = mediaFound?.msg?.caption ?? null;
    const jid = d.key.remoteJid;
    const isGroup = jid.endsWith("@g.us");
    const phone = isGroup
      ? undefined
      : jid.replace(/@s.whatsapp.net$/i, "").replace(/@c.us$/i, "");
    const contactName = isGroup ? "Grupo" : d.pushName?.trim() || "Contato WhatsApp";
    // AUTORIA EM GRUPOS: cadeia defensiva pro pushName do participante
    // (data.pushName é o padrão; os demais níveis cobrem variações de
    // payload da Evolution). participant_jid vai junto pro metadata —
    // habilita citação nativa em grupos no futuro.
    const participantName = isGroup
      ? d.pushName?.trim() || raw?.pushName?.trim() || raw?.data?.pushName?.trim() || null
      : null;
    const participantJid = isGroup ? (d.key.participant ?? null) : null;
    return {
      ok: true,
      value: {
        message: (text.trim() ? text : caption ?? "").slice(0, 4000),
        contact: { name: contactName, phone, external_id: jid },
        channel_kind: "whatsapp",
        channel_type: "evolution",
        whatsapp_jid: jid,
        instance_name: parsed.data.instance ?? null,
        message_id: d.key.id ?? null,
        external_ref: d.key.id ?? undefined,
        participant_name: participantName,
        participant_jid: participantJid,
        evolution_server_url: typeof raw.server_url === "string" ? raw.server_url : null,
        evolution_apikey: typeof raw.apikey === "string" ? raw.apikey : null,
        media: mediaFound
          ? {
              kind: mediaFound.kind,
              mimetype: mediaFound.msg?.mimetype ?? null,
              caption,
              fileName: mediaFound.msg?.fileName ?? null,
              seconds: typeof mediaFound.msg?.seconds === "number" ? mediaFound.msg.seconds : null,
              jpegThumbnail: mediaFound.msg?.jpegThumbnail ?? null,
            }
          : null,
      },
    };
  }
  const parsed = Body.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, status: 400, body: { error: "invalid_body", issues: parsed.error.flatten() } };
  }
  return { ok: true, value: { ...parsed.data, channel_type: "simulation" } };
}

function mediaTitleFor(b: Normalized): string {
  if (!b.media) return "Mensagem recebida";
  if (b.media.kind === "documentMessage" && b.media.fileName)
    return b.media.fileName.slice(0, 80);
  return MEDIA_LABEL[b.media.kind];
}

/** Texto do preview da fila: legenda/texto ou rótulo de mídia; null se nada. */
function previewFor(b: Normalized): string | null {
  const t = b.message.trim();
  if (t) return t.slice(0, 200);
  if (b.media) return PREVIEW_LABEL[b.media.kind];
  return null;
}

export const Route = createFileRoute("/api/public/ingest/$token")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const t0 = Date.now();
        const json = (body: unknown, status: number) =>
          new Response(JSON.stringify(body), {
            status,
            headers: { "content-type": "application/json" },
          });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // ESCUDO 1: token+org+flag em memo 60s — 1 SELECT/min/token,
        // não 1 por POST. Token inválido também memoiza (anti-spam de 401).
        const tok = await resolveToken(params.token);
        if (!tok) {
          recordWebhookDelivery({
            tokenId: null,
            orgId: null,
            outcome: "error",
            action: "auth_failed",
            status: 401,
            latencyMs: Date.now() - t0,
            error: "token_not_found",
          });
          return json({ error: "invalid_token" }, 401);
        }

        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          recordWebhookDelivery({
            tokenId: tok.id,
            orgId: tok.org_id,
            outcome: "error",
            action: "invalid_payload",
            status: 400,
            latencyMs: Date.now() - t0,
            error: "json_parse_failed",
          });
          return json({ error: "invalid_json" }, 400);
        }
        console.log("[EVOLUTION PAYLOAD CRU]:", redactForLog(payload));

        const looksLikeContactsUpdate =
          looksLikeEvolution(payload) &&
          typeof (payload as any).event === "string" &&
          (payload as any).event.replace(/_/g, ".").toLowerCase() === "contacts.update";
        if (looksLikeContactsUpdate) {
          const parsed = ContactsUpdatePayload.safeParse(payload);
          if (parsed.success) {
            await handleContactsUpdate(tok.org_id, parsed.data);
            // DESCARTADO: contacts.update sucesso é sincronização de perfil,
            // não ticket. Não entra em webhook_delivery_logs.
          } else {
            recordWebhookDelivery({
              tokenId: tok.id,
              orgId: tok.org_id,
              outcome: "rejected",
              action: "contacts_update_invalid",
              status: 200,
              latencyMs: Date.now() - t0,
              error: JSON.stringify(parsed.error.flatten()),
              payload,
            });
            console.error("[ingest] contacts.update inválido", parsed.error.flatten());
          }
          return new Response(JSON.stringify({ ok: true, event: "contacts.update" }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        const norm = normalize(payload);
        if (!norm.ok) {
          // Só grava como validation_failed quando o status é 4xx (corpo inválido real).
          // Status 200 com `ignored` são descartes de negócio (from_me, evento
          // não-mensagem, tipo não suportado): não poluem o log, mas marcam o
          // message_id pra re-emissões (acks) morrerem no ESCUDO 2.
          if (norm.status >= 400) {
            recordWebhookDelivery({
              tokenId: tok.id,
              orgId: tok.org_id,
              outcome: "rejected",
              action: "validation_failed",
              status: norm.status,
              latencyMs: Date.now() - t0,
              error: JSON.stringify(norm.body),
              payload,
            });
          } else {
            markSeen((payload as any)?.data?.key?.id);
          }
          return json(norm.body, norm.status);
        }
        const b = norm.value;

        // ESCUDO 2: re-emissão conhecida (ack/status/retry da mesma mensagem)
        // → 200 duplicate em ZERO query e ZERO log. O dedup de banco
        // (demanda_events) segue como fonte de verdade entre instâncias e
        // após a janela de 10min.
        if (b.message_id && seenBefore(b.message_id)) {
          return new Response(
            JSON.stringify({ ok: true, duplicate: true, memo: true }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        // ◆ FASE 3 — GATE DE ACESSO (trial → grace → suspended) ◆
        // readonly/blocked barram message_in NOVO. contacts.update segue
        // liberado acima (sincronização de perfil não é operação de negócio).
        // O memo 60s/org vive dentro do resolveAccountAccess (diretriz v2.4):
        // o gate custa 1 SELECT/min/org no caminho quente.
        const access = await resolveAccountAccess(supabaseAdmin, tok.org_id);
        if (access.access_level !== "full") {
          markSeen(b.message_id);
          recordWebhookDelivery({
            tokenId: tok.id,
            orgId: tok.org_id,
            outcome: "rejected",
            action: "account_gated",
            status: 200,
            latencyMs: Date.now() - t0,
            error: `effective_state=${access.effective_state}`,
          });
          return new Response(
            JSON.stringify({ ok: true, ignored: `account_${access.effective_state}` }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        // REGRA DE NEGÓCIO DA ORG: ingestão de grupos pode estar desligada.
        // DESCARTADO SILENCIOSAMENTE (não grava log — é comportamento esperado).
        // Com o ESCUDO 1, a flag vem do memo: ZERO query por POST de grupo.
        const groupJid = b.whatsapp_jid ?? b.contact?.external_id ?? null;
        if (groupJid?.endsWith("@g.us") && tok.allowGroup === false) {
          markSeen(b.message_id);
          return new Response(
            JSON.stringify({ ok: true, ignored: "group_ingest_disabled" }),
            { status: 200, headers: { "content-type": "application/json" } },
          );
        }

        // Diagnóstico de autoria em grupo: se o messages.upsert vier sem
        // pushName, avisamos UMA vez por mensagem pra calibrar o parser.
        if (b.whatsapp_jid?.endsWith("@g.us") && !b.participant_name) {
          console.warn("[ingest] mensagem de grupo SEM pushName no payload", {
            message_id: b.message_id,
            participant_jid: b.participant_jid,
          });
        }

        // 1. Busca ou cria o contato associado
        let contactId: string | null = null;
        if (b.contact?.external_id || b.contact?.phone) {
          const orParts = [
            b.contact.external_id ? `external_id.eq.${b.contact.external_id}` : null,
            b.contact.phone ? `phone.eq.${b.contact.phone}` : null,
          ]
            .filter(Boolean)
            .join(",");

          // limit(1) em vez de maybeSingle: .or() casando 2+ contatos (dups por
          // external_id × phone) fazia o maybeSingle ERRAR e a demanda nascer
          // órfã (contact_id null). Pega o mais antigo deterministicamente.
          const { data: foundRows, error: findErr } = await supabaseAdmin
            .from("contacts")
            .select("id, name")
            .eq("org_id", tok.org_id)
            .or(orParts)
            .order("created_at", { ascending: true })
            .limit(1);
          const found = foundRows?.[0] ?? null;

          if (findErr) {
            console.error("[ingest] falha ao buscar contato", {
              org_id: tok.org_id,
              external_id: b.contact.external_id,
              phone: b.contact.phone,
              error: findErr,
            });
          }

          const isGroup = !!b.whatsapp_jid?.endsWith("@g.us");
          if (b.contact) {
            const savedName = found?.name ?? null;
            const savedIsGeneric =
              !savedName || savedName === "Grupo" || savedName === "Contato WhatsApp";
            if (isGroup && !savedIsGeneric) {
              // Grupo com nome REAL salvo: preserva o nome do contato e não
              // tenta fetch de novo (o fetch só roda quando o salvo é genérico).
              b.contact.name = savedName;
            } else if (
              isGroup &&
              savedIsGeneric &&
              b.evolution_server_url &&
              b.evolution_apikey &&
              b.instance_name
            ) {
              // AUTO-HEAL: grupo com nome genérico dispara o fetch do subject
              // real (4 rotas candidatas). Falha → segue "Grupo" e re-tenta
              // na próxima mensagem do grupo.
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
            const incomingNameIsGeneric =
              !b.contact.name ||
              b.contact.name === "Contato WhatsApp" ||
              b.contact.name === "Grupo";
            const savedNameIsGeneric =
              !found.name || found.name === "Contato WhatsApp" || found.name === "Grupo";
            // Regras separadas:
            // - Grupo: só atualiza se o incoming é REAL (não-genérico) E o
            //   salvo é genérico — protege contra sobrescrever subject real
            //   por "Grupo" ou "Contato WhatsApp".
            // - Individual: atualiza quando o nome muda e (incoming é real
            //   OU o salvo é genérico) — protege o pushName real.
            const shouldUpdateGroup = isGroup && !incomingNameIsGeneric && savedNameIsGeneric;
            const shouldUpdateIndividual =
              !isGroup &&
              b.contact.name &&
              b.contact.name !== found.name &&
              (!incomingNameIsGeneric || savedNameIsGeneric);
            if (shouldUpdateGroup || shouldUpdateIndividual) {
              const { error: updateErr } = await supabaseAdmin
                .from("contacts")
                .update({ name: b.contact.name } as never)
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

        // 2+3. REUSA ABERTA OU CRIA — ATÔMICO via RPC ingest_upsert_demand
        // (advisory lock por org+contato em UMA transação): dois webhooks
        // paralelos do MESMO contato (rajada/encaminhada — caso Diana, 171ms
        // de janela) não criam mais duas demandas; o segundo espera o lock
        // e cai no ramo de reuso (created=false).
        // Exceção: reopen_if_open=false é pedido EXPLÍCITO do integrador por
        // demanda nova por mensagem — insert inline intencional, sem race bug.
        const preview = previewFor(b);
        const messageAt = new Date().toISOString();
        const title = b.title ?? (b.message.trim() ? b.message.slice(0, 80) : mediaTitleFor(b));
        let demandaId: string | null = null;
        let protocol: string | null = null;
        let createdNow = false;
        if (b.reopen_if_open === false) {
          const { data: dem, error: de } = await supabaseAdmin
            .from("demandas")
            .insert({
              org_id: tok.org_id,
              title,
              description: b.message || null,
              priority: b.priority ?? "media",
              contact_id: contactId,
              channel_id: tok.channel_id,
              channel_type: b.channel_type,
              whatsapp_jid: b.whatsapp_jid ?? null,
              instance_name: b.instance_name ?? null,
              last_message_id: b.message_id ?? null,
              last_message_preview: preview,
              last_message_at: messageAt,
            })
            .select("id, protocol")
            .single();
          if (de || !dem) {
            recordWebhookDelivery({
              tokenId: tok.id,
              orgId: tok.org_id,
              outcome: "error",
              action: "internal_error",
              status: 500,
              latencyMs: Date.now() - t0,
              error: `demand_insert: ${de?.message ?? "no_row"}`,
              payload,
            });
            console.error("[ingest] demanda insert failed", de);
            return json({ error: "internal_error" }, 500);
          }
          demandaId = dem.id;
          protocol = dem.protocol as string | null;
          createdNow = true;
        } else {
          // Cast `as any` cirúrgico: os tipos gerados do Supabase
          // (supabase gen types) inferem os parâmetros da RPC como `string`
          // (não nullable), mas a função aceita NULL nos campos text.
          // Gap conhecido do gerador — a função está correta no banco.
          const { data: up, error: upErr } = await supabaseAdmin.rpc("ingest_upsert_demand", {
            p_org_id: tok.org_id,
            p_contact_id: contactId,
            p_title: title,
            p_description: b.message || null,
            p_priority: b.priority ?? "media",
            p_channel_id: tok.channel_id,
            p_channel_type: b.channel_type,
            p_whatsapp_jid: b.whatsapp_jid ?? null,
            p_instance_name: b.instance_name ?? null,
            p_preview: preview,
            p_message_id: b.message_id ?? null,
            p_message_at: messageAt,
          } as any);
          const row = Array.isArray(up)
            ? up[0]
            : (up as { demanda_id: string; protocol: string | null; created: boolean } | null);
          if (upErr || !row) {
            recordWebhookDelivery({
              tokenId: tok.id,
              orgId: tok.org_id,
              outcome: "error",
              action: "internal_error",
              status: 500,
              latencyMs: Date.now() - t0,
              error: `ingest_upsert_demand: ${upErr?.message ?? "no_row"}`,
              payload,
            });
            console.error("[ingest] ingest_upsert_demand falhou", upErr);
            return json({ error: "internal_error" }, 500);
          }
          demandaId = row.demanda_id;
          protocol = row.protocol;
          createdNow = row.created;
        }

        // Auto-assign só em criação (round-robin/least-busy); falha nunca
        // derruba o ingest — demanda nasce órfã e gerente atribui depois.
        if (createdNow && demandaId) {
          try {
            await resolveAutoAssignment(supabaseAdmin, { orgId: tok.org_id, demandaId });
          } catch (err: any) {
            console.error("[ingest] auto-assign falhou — demanda segue órfã", {
              demanda_id: demandaId,
              org_id: tok.org_id,
              error: err?.message,
            });
          }
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
            // DEDUP de banco (fonte de verdade entre instâncias/após janela):
            // justifica ao suporte por que msg repetida não gerou novo ticket.
            // Marca no ESCUDO 2 pra re-emissões seguintes morrerem em 0 query.
            markSeen(b.message_id);
            recordWebhookDelivery({
              tokenId: tok.id,
              orgId: tok.org_id,
              outcome: "success",
              action: "demand_dedup",
              status: 200,
              latencyMs: Date.now() - t0,
              demandaId,
              protocol,
            });
            return new Response(
              JSON.stringify({ ok: true, demanda_id: demandaId, protocol, duplicate: true }),
              { status: 200, headers: { "content-type": "application/json" } },
            );
          }
        }

        // 4b. Mídia: baixa o arquivo decifrado da Evolution e sobe pro Storage privado.
        let mediaUrl: string | null = null;
        let mediaType: string | null = null;
        let mediaFileName: string | null = null;
        let mediaFailed: string | null = null;
        let mediaSeconds: number | null = null;
        let mediaBytes: number | null = null;
        let mediaThumb: string | null = null;
        if (b.media && b.message_id && b.instance_name && b.whatsapp_jid && demandaId) {
          const fetched = await fetchMediaFromEvolution({
            orgId: tok.org_id,
            instance: b.instance_name,
            key: { remoteJid: b.whatsapp_jid, fromMe: false, id: b.message_id },
          });
          if (fetched.ok) {
            const up = await uploadMediaToStorage({
              orgId: tok.org_id,
              demandaId,
              messageId: b.message_id,
              media: fetched.media,
            });
            if (up.ok) {
              mediaUrl = up.path;
              mediaType = fetched.media.mimeType;
              mediaFileName = fetched.media.fileName;
              mediaSeconds = b.media.seconds;
              mediaBytes = fetched.media.bytes;
              if (b.media.kind === "videoMessage" && b.media.jpegThumbnail) {
                const thumbBuf = bufferFromByteMap(b.media.jpegThumbnail);
                if (thumbBuf && thumbBuf[0] === 0xff && thumbBuf[1] === 0xd8) {
                  const thumbUp = await uploadThumbToStorage({
                    orgId: tok.org_id,
                    demandaId,
                    messageId: b.message_id,
                    buffer: thumbBuf,
                  });
                  if (thumbUp.ok) mediaThumb = thumbUp.path;
                  else
                    console.error("[ingest] thumb não persistido — card usará placeholder", {
                      message_id: b.message_id,
                      reason: thumbUp.reason,
                    });
                }
              }
            } else {
              mediaFailed = up.reason;
            }
          } else {
            mediaFailed = fetched.reason;
          }
          if (mediaFailed) {
            console.error("[ingest] mídia NÃO persistida — evento registrado mesmo assim", {
              demanda_id: demandaId,
              message_id: b.message_id,
              media_kind: b.media.kind,
              reason: mediaFailed,
            });
          }
        }

        await supabaseAdmin.from("demanda_events").insert({
          org_id: tok.org_id,
          demanda_id: demandaId,
          kind: "message_in",
          content: b.message,
          media_url: mediaUrl,
          media_type: mediaType,
          file_name: mediaFileName,
          metadata: {
            external_ref: b.external_ref ?? null,
            channel_kind: b.channel_kind ?? null,
            channel_type: b.channel_type,
            whatsapp_jid: b.whatsapp_jid ?? null,
            instance_name: b.instance_name ?? null,
            message_id: b.message_id ?? null,
            participant_name: b.participant_name ?? null,
            participant_jid: b.participant_jid ?? null,
            media_kind: b.media?.kind ?? null,
            media_failed: mediaFailed,
            media_seconds: mediaSeconds,
            media_bytes: mediaBytes,
            media_thumb: mediaThumb,
          },
        });

        // Mensagem processada de verdade: entra na janela do ESCUDO 2 —
        // re-emissões de ack/status desta message_id morrem em 0 query.
        markSeen(b.message_id);

        // ESCUDO 3: last_used_at no máx. 1x/min/token (era 1 UPDATE por POST).
        const nowMs = Date.now();
        const lastTouch = lastUsedTouch.get(tok.id) ?? 0;
        if (nowMs - lastTouch > 60_000) {
          lastUsedTouch.set(tok.id, nowMs);
          await supabaseAdmin
            .from("webhook_tokens")
            .update({ last_used_at: new Date(nowMs).toISOString() })
            .eq("id", tok.id);
        }

        // Sucesso de negócio: created = demand_created, reuse = demand_reopened
        recordWebhookDelivery({
          tokenId: tok.id,
          orgId: tok.org_id,
          outcome: "success",
          action: createdNow ? "demand_created" : "demand_reopened",
          status: 200,
          latencyMs: Date.now() - t0,
          demandaId,
          protocol,
        });

        return new Response(
          JSON.stringify({
            ok: true,
            demanda_id: demandaId,
            protocol,
            org: tok.orgName,
            media: mediaUrl
              ? { stored: true }
              : mediaFailed
                ? { stored: false, reason: mediaFailed }
                : undefined,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
