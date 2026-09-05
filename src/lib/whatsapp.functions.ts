import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const ADMIN_ROLES = ["owner", "admin"];
const OP_ROLES = ["owner", "admin", "gerente", "operador", "agente_ia"];

async function roleOf(supabase: any, orgId: string, userId: string) {
  const { data } = await supabase.from("memberships").select("role").eq("org_id", orgId).eq("user_id", userId).maybeSingle();
  if (!data) throw new Error("Sem acesso à organização");
  return data.role as string;
}

const cleanUrl = (u: string) => u.trim().replace(/\/+$/, "");

/** Configuração da integração (chave nunca é devolvida ao navegador). */
export const getWhatsappSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const role = await roleOf(context.supabase, data.orgId, context.userId);
    if (!ADMIN_ROLES.includes(role)) throw new Error("Apenas proprietários e administradores podem ver a integração.");
    const { data: row, error } = await context.supabase
      .from("whatsapp_settings")
      .select("base_url, instance_name, auto_reply_enabled, api_key, updated_at")
      .eq("org_id", data.orgId).maybeSingle();
    if (error) throw new Error(error.message);
    return {
      base_url: row?.base_url ?? "",
      instance_name: row?.instance_name ?? "",
      auto_reply_enabled: row?.auto_reply_enabled ?? false,
      has_api_key: !!row?.api_key,
      updated_at: row?.updated_at ?? null,
    };
  });

export const saveWhatsappSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({
    orgId: z.string().uuid(),
    base_url: z.string().trim().max(300, { message: "Endereço muito longo." })
      .refine((v) => v === "" || /^https?:\/\/.+/i.test(v), { message: "Informe um endereço começando com http:// ou https://" }),
    instance_name: z.string().trim().max(120, { message: "Nome da instância muito longo." }),
    api_key: z.string().trim().max(300).optional(),
    auto_reply_enabled: z.boolean(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    const role = await roleOf(context.supabase, data.orgId, context.userId);
    if (!ADMIN_ROLES.includes(role)) throw new Error("Apenas proprietários e administradores podem alterar a integração.");
    const patch: Record<string, unknown> = {
      org_id: data.orgId,
      base_url: data.base_url ? cleanUrl(data.base_url) : null,
      instance_name: data.instance_name || null,
      auto_reply_enabled: data.auto_reply_enabled,
    };
    // Chave em branco = manter a atual.
    if (data.api_key) patch["api_key"] = data.api_key;
    const { error } = await context.supabase.from("whatsapp_settings").upsert(patch as never, { onConflict: "org_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

async function loadConfig(orgId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("whatsapp_settings")
    .select("base_url, api_key, instance_name, auto_reply_enabled")
    .eq("org_id", orgId).maybeSingle();
  return data;
}

/** Testa a conexão com a Evolution API. */
export const testWhatsappConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ orgId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const role = await roleOf(context.supabase, data.orgId, context.userId);
    if (!ADMIN_ROLES.includes(role)) throw new Error("Apenas proprietários e administradores podem testar a integração.");
    const cfg = await loadConfig(data.orgId);
    if (!cfg?.base_url || !cfg.api_key || !cfg.instance_name) {
      return { ok: false, message: "Preencha endereço, chave e nome da instância antes de testar." };
    }
    try {
      const res = await fetch(`${cleanUrl(cfg.base_url)}/instance/connectionState/${encodeURIComponent(cfg.instance_name)}`, {
        headers: { apikey: cfg.api_key },
      });
      const body = await res.text();
      if (!res.ok) return { ok: false, message: `O serviço respondeu com erro ${res.status}.` };
      let state: string | null = null;
      try {
        const j = JSON.parse(body);
        state = j?.instance?.state ?? j?.state ?? null;
      } catch { /* resposta sem JSON */ }
      return { ok: true, message: state ? `Conectado (estado: ${state}).` : "Conexão bem-sucedida." };
    } catch (e) {
      console.error("[whatsapp] test connection failed", e);
      return { ok: false, message: "Não foi possível falar com o serviço. Verifique o endereço." };
    }
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
      const cfg = await loadConfig(dem.org_id);
      const instance = dem.instance_name || cfg?.instance_name;
      if (!cfg?.base_url || !cfg.api_key || !instance) {
        throw new Error("Configure a integração de WhatsApp antes de enviar mensagens.");
      }
      try {
        const res = await fetch(`${cleanUrl(cfg.base_url)}/message/sendText/${encodeURIComponent(instance)}`, {
          method: "POST",
          headers: { "content-type": "application/json", apikey: cfg.api_key },
          body: JSON.stringify({ number: dem.whatsapp_jid, text: data.messageText }),
        });
        const raw = await res.text();
        if (!res.ok) {
          console.error("[whatsapp] send failed", res.status, raw.slice(0, 400));
          throw new Error("O WhatsApp não aceitou a mensagem. Tente novamente.");
        }
        try { messageId = JSON.parse(raw)?.key?.id ?? null; } catch { /* sem JSON */ }
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
