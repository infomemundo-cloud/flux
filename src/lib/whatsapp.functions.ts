import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ADMIN_ROLES = ["owner", "admin"];
const OP_ROLES = ["owner", "admin", "gerente", "operador", "agente_ia"];

async function roleOf(supabase: any, orgId: string, userId: string) {
  const { data } = await supabase.from("memberships").select("role").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("Sem acesso à organização");
  return data.role as string;
}

async function requireAdmin(supabase: any, orgId: string, userId: string, action = "gerenciar a integração") {
  const role = await roleOf(supabase, orgId, userId);
  if (!ADMIN_ROLES.includes(role)) throw new Error(`Apenas proprietários e administradores podem ${action}.`);
  return role;
}

const cleanUrl = (u: string) => u.trim().replace(/\/+$/, "");

const instanceNameFor = (orgId: string) => `org_${orgId}`;

/** Credenciais centrais do serviço (secretas, nunca vão ao navegador). */
function masterCreds() {
  const baseUrl = process.env["EVOLUTION_BASE_URL"];
  const key = process.env["EVOLUTION_GLOBAL_KEY"];
  if (!baseUrl || !key) return null;
  return { baseUrl: cleanUrl(baseUrl), key };
}

function appOrigin() {
  const fromEnv = process.env["APP_URL"];
  if (fromEnv) return cleanUrl(fromEnv);
  const origin = getRequestHeader("origin");
  if (origin) return cleanUrl(origin);
  const host = getRequestHeader("host");
  if (host) return `https://${host}`;
  return null;
}

type Settings = {
  base_url: string | null;
  api_key: string | null;
  instance_name: string | null;
  auto_reply_enabled: boolean;
  connection_status: string;
  connected_number: string | null;
  use_master_credentials: boolean;
};

async function loadSettings(orgId: string): Promise<Settings | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("whatsapp_settings")
    .select("base_url, api_key, instance_name, auto_reply_enabled, connection_status, connected_number, use_master_credentials")
    .eq("org_id", orgId)
    .maybeSingle();
  return (data as Settings | null) ?? null;
}

async function saveSettings(orgId: string, patch: Record<string, unknown>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { error } = await supabaseAdmin
    .from("whatsapp_settings")
    .upsert({ org_id: orgId, ...patch } as never, { onConflict: "org_id" });
  if (error) throw new Error(error.message);
}

/** Endpoint/chave efetivos: credenciais próprias da organização, senão as centrais. */
function effectiveCreds(cfg: Settings | null) {
  if (cfg && !cfg.use_master_credentials && cfg.base_url && cfg.api_key) {
    return { baseUrl: cleanUrl(cfg.base_url), key: cfg.api_key };
  }
  return masterCreds();
}

/** Garante um token de webhook exclusivo para o WhatsApp desta organização. */
async function ensureWebhookToken(orgId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: existing } = await supabaseAdmin
    .from("webhook_tokens").select("token").eq("org_id", orgId).eq("name", "WhatsApp (Evolution)").maybeSingle();
  if (existing?.token) return existing.token as string;
  const token = `wht_${crypto.randomUUID().replace(/-/g, "")}`;
  const { error } = await supabaseAdmin.from("webhook_tokens").insert({
    org_id: orgId, name: "WhatsApp (Evolution)", token,
  } as never);
  if (error) throw new Error(error.message);
  return token;
}

const WEBHOOK_EVENTS = ["MESSAGES_UPSERT", "CONNECTION_UPDATE"];

async function evo(baseUrl: string, key: string, path: string, init?: RequestInit) {
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { "content-type": "application/json", apikey: key, ...(init?.headers ?? {}) },
  });
  const raw = await res.text();
  let body: any = null;
  try { body = raw ? JSON.parse(raw) : null; } catch { /* resposta sem JSON */ }
  return { ok: res.ok, status: res.status, body, raw };
}

function pickQr(body: any): { base64: string | null; code: string | null } {
  const b = body?.qrcode ?? body?.qr ?? body ?? {};
  const base64: string | null = b?.base64 ?? body?.base64 ?? null;
  const code: string | null = b?.code ?? b?.pairingCode ?? body?.code ?? null;
  return { base64: base64 ? (base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`) : null, code };
}

function mapState(state: string | null | undefined): "disconnected" | "connecting" | "connected" {
  const s = (state ?? "").toLowerCase();
  if (s === "open") return "connected";
  if (s === "connecting" || s === "qr" || s === "close_pending") return "connecting";
  return "disconnected";
}

async function readState(baseUrl: string, key: string, instance: string) {
  const r = await evo(baseUrl, key, `/instance/connectionState/${encodeURIComponent(instance)}`);
  if (!r.ok) return { exists: r.status !== 404, state: null as string | null };
  const state = r.body?.instance?.state ?? r.body?.state ?? null;
  return { exists: true, state };
}

async function setWebhook(baseUrl: string, key: string, instance: string, url: string) {
  const nested = await evo(baseUrl, key, `/webhook/set/${encodeURIComponent(instance)}`, {
    method: "POST",
    body: JSON.stringify({ webhook: { enabled: true, url, webhookByEvents: false, webhookBase64: false, events: WEBHOOK_EVENTS } }),
  });
  if (nested.ok) return true;
  const flat = await evo(baseUrl, key, `/webhook/set/${encodeURIComponent(instance)}`, {
    method: "POST",
    body: JSON.stringify({ enabled: true, url, webhook_by_events: false, events: WEBHOOK_EVENTS }),
  });
  if (!flat.ok) console.error("[whatsapp] webhook set failed", flat.status, flat.raw.slice(0, 300));
  return flat.ok;
}

/** Estado da conexão do WhatsApp desta organização. */
export const getWhatsappConnection = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, data.orgId, context.userId, "ver a integração");
    const cfg = await loadSettings(data.orgId);
    const creds = effectiveCreds(cfg);
    const instance = cfg?.instance_name ?? instanceNameFor(data.orgId);

    let status = (cfg?.connection_status ?? "disconnected") as "disconnected" | "connecting" | "connected";
    let number = cfg?.connected_number ?? null;

    if (creds && cfg?.instance_name) {
      try {
        const st = await readState(creds.baseUrl, creds.key, instance);
        status = st.exists ? mapState(st.state) : "disconnected";
        if (status !== "connected") number = status === "disconnected" ? null : number;
        if (status !== (cfg.connection_status ?? "disconnected")) {
          await saveSettings(data.orgId, {
            connection_status: status,
            ...(status === "connected" ? { connected_at: new Date().toISOString() } : { connected_number: number }),
          });
        }
      } catch (e) {
        console.error("[whatsapp] state read failed", e);
      }
    }

    const origin = appOrigin();
    const token = cfg?.instance_name ? await ensureWebhookToken(data.orgId) : null;

    return {
      status,
      instance_name: cfg?.instance_name ?? null,
      connected_number: status === "connected" ? number : null,
      auto_reply_enabled: cfg?.auto_reply_enabled ?? false,
      service_ready: !!creds,
      webhook_url: token && origin ? `${origin}/api/public/ingest/${token}` : null,
    };
  });

/** Cria (ou reabre) a instância desta organização e devolve o QR Code. */
export const connectWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, data.orgId, context.userId, "conectar o WhatsApp");
    const cfg = await loadSettings(data.orgId);
    const creds = effectiveCreds(cfg);
    if (!creds) throw new Error("O serviço de WhatsApp ainda não está configurado. Fale com o suporte.");

    const instance = instanceNameFor(data.orgId);
    const token = await ensureWebhookToken(data.orgId);
    const origin = appOrigin();
    if (!origin) throw new Error("Não foi possível descobrir o endereço público do sistema.");
    const webhookUrl = `${origin}/api/public/ingest/${token}`;

    const st = await readState(creds.baseUrl, creds.key, instance);
    if (st.exists && mapState(st.state) === "connected") {
      await saveSettings(data.orgId, {
        instance_name: instance, connection_status: "connected", connected_at: new Date().toISOString(),
      });
      await setWebhook(creds.baseUrl, creds.key, instance, webhookUrl);
      return { status: "connected" as const, qr: null, code: null, message: "O WhatsApp já está conectado." };
    }

    let qr = { base64: null as string | null, code: null as string | null };

    if (!st.exists) {
      const created = await evo(creds.baseUrl, creds.key, "/instance/create", {
        method: "POST",
        body: JSON.stringify({
          instanceName: instance,
          qrcode: true,
          integration: "WHATSAPP-BAILEYS",
          webhook: { enabled: true, url: webhookUrl, webhookByEvents: false, events: WEBHOOK_EVENTS },
          webhookUrl,
          webhook_by_events: false,
          events: WEBHOOK_EVENTS,
        }),
      });
      if (!created.ok && created.status !== 403 && created.status !== 409) {
        console.error("[whatsapp] instance create failed", created.status, created.raw.slice(0, 400));
        throw new Error("Não foi possível criar a conexão do WhatsApp agora. Tente novamente.");
      }
      qr = pickQr(created.body);
    }

    if (!qr.base64) {
      const conn = await evo(creds.baseUrl, creds.key, `/instance/connect/${encodeURIComponent(instance)}`);
      if (!conn.ok) {
        console.error("[whatsapp] instance connect failed", conn.status, conn.raw.slice(0, 400));
        throw new Error("Não foi possível gerar o QR Code agora. Tente novamente em instantes.");
      }
      qr = pickQr(conn.body);
    }

    await setWebhook(creds.baseUrl, creds.key, instance, webhookUrl);
    await saveSettings(data.orgId, { instance_name: instance, connection_status: "connecting", connected_number: null });

    return {
      status: "connecting" as const,
      qr: qr.base64,
      code: qr.code,
      message: qr.base64 ? "Leia o QR Code no aplicativo do WhatsApp." : "Conexão iniciada, aguardando o QR Code.",
    };
  });

/** Encerra a sessão e remove a instância desta organização. */
export const disconnectWhatsapp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid(), deleteInstance: z.boolean().default(true) }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, data.orgId, context.userId, "desconectar o WhatsApp");
    const cfg = await loadSettings(data.orgId);
    const creds = effectiveCreds(cfg);
    const instance = cfg?.instance_name ?? instanceNameFor(data.orgId);
    if (creds) {
      await evo(creds.baseUrl, creds.key, `/instance/logout/${encodeURIComponent(instance)}`, { method: "DELETE" });
      if (data.deleteInstance) {
        await evo(creds.baseUrl, creds.key, `/instance/delete/${encodeURIComponent(instance)}`, { method: "DELETE" });
      }
    }
    await saveSettings(data.orgId, {
      connection_status: "disconnected",
      connected_number: null,
      connected_at: null,
      ...(data.deleteInstance ? { instance_name: null } : {}),
    });
    return { ok: true, status: "disconnected" as const };
  });

/** Liga/desliga a resposta automática por IA. */
export const setWhatsappAutoReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid(), enabled: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.supabase, data.orgId, context.userId, "alterar a integração");
    await saveSettings(data.orgId, { auto_reply_enabled: data.enabled });
    return { ok: true };
  });

/** Envia mensagem de saída pelo WhatsApp e registra no histórico da demanda. */
export const sendWhatsAppMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    demandId: z.string().uuid(),
    messageText: z.string().trim()
      .min(1, { message: "Escreva a mensagem antes de enviar." })
      .max(4000, { message: "A mensagem pode ter no máximo 4000 caracteres." }),
    role: z.enum(["agent", "system"]).default("agent"),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: dem, error } = await context.supabase
      .from("demandas").select("id, org_id, whatsapp_jid, channel_type, instance_name").eq("id", data.demandId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!dem) throw new Error("Demanda não encontrada");
    const memberRole = await roleOf(context.supabase, dem.org_id, context.userId);
    if (!OP_ROLES.includes(memberRole)) throw new Error("Você não pode responder nesta demanda.");
    if (!dem.whatsapp_jid) throw new Error("Esta demanda não tem um WhatsApp associado.");

    let delivered = false;
    let deliveryNote = "Registrado apenas no histórico (integração inativa).";
    let messageId: string | null = null;

    if (dem.channel_type === "evolution") {
      const cfg = await loadSettings(dem.org_id);
      const creds = effectiveCreds(cfg);
      // A instância é sempre a da organização da demanda — isolamento entre clientes.
      const instance = cfg?.instance_name || dem.instance_name || instanceNameFor(dem.org_id);
      if (!creds) throw new Error("Conecte o WhatsApp nas configurações antes de enviar mensagens.");
      try {
        const res = await evo(creds.baseUrl, creds.key, `/message/sendText/${encodeURIComponent(instance)}`, {
          method: "POST",
          body: JSON.stringify({ number: dem.whatsapp_jid, text: data.messageText }),
        });
        if (!res.ok) {
          console.error("[whatsapp] send failed", res.status, res.raw.slice(0, 400));
          throw new Error("O WhatsApp não aceitou a mensagem. Tente novamente.");
        }
        messageId = res.body?.key?.id ?? null;
        delivered = true;
        deliveryNote = "Enviado pelo WhatsApp.";
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("O WhatsApp")) throw e;
        console.error("[whatsapp] send error", e);
        throw new Error("Não foi possível enviar a mensagem agora.");
      }
    }

    const { error: evErr } = await context.supabase.from("demanda_events").insert({
      org_id: dem.org_id, demanda_id: dem.id, kind: "message_out",
      actor_id: data.role === "agent" ? context.userId : null,
      content: data.messageText,
      metadata: { role: data.role, delivered, channel_type: dem.channel_type, message_id: messageId },
    });
    if (evErr) throw new Error(evErr.message);

    if (messageId) {
      await context.supabase.from("demandas").update({ last_message_id: messageId } as never).eq("id", dem.id);
    }
    return { ok: true, delivered, message: deliveryNote };
  });
