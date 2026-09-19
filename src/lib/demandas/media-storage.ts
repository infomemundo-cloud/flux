/**
 * Mídias de demandas: ponte Evolution ↔ Supabase Storage.
 *
 * RECEBIMENTO: webhook chega com metadata criptografado
 * → fetchMediaFromEvolution pede o base64 JÁ DECIFRADO pra Evolution
 * → uploadMediaToStorage grava em demanda-media/{org}/{demanda}/{message_id}.{ext}
 *   com upsert (reenvio sobrescreve, não duplica)
 *
 * ENVIO: composer anexa arquivo
 * → sendMediaViaEvolution manda o base64 puro pra Evolution (endpoint
 *   /message/sendMedia validado em produção; enum: image/document/video/audio)
 *   e recebe de volta key.id + status PENDING
 * → uploadMediaToStorage grava usando o key.id como message_id (mesma convenção
 *   do recebimento, sem duplicar lógica de naming/extensões)
 * → signedMediaUrl gera URL temporária de leitura na hora de renderizar.
 *
 * Nenhuma função derruba o fluxo: tudo retorna { ok: false, reason } e quem
 * chama decide logar + registrar o evento mesmo sem a mídia.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadSettings, effectiveCreds } from "@/lib/whatsapp.functions";

/** 100 MB — teto de documento do WhatsApp (imagem/áudio/vídeo: 16 MB). */
const MAX_BYTES = 100 * 1024 * 1024;

/**
 * 3 MB conservador pro ENVIO. O app roda na Vercel (serverless com body de
 * ~4,5 MB) e o base64 infla ~4/3 — 3 MB de arquivo cru cabe com folga.
 * Recebimento continua em 100 MB (vem direto da Evolution, não passa pelo
 * body da Vercel). Assimetria é da plataforma, não do design.
 */
export const MAX_UPLOAD_BYTES = 3 * 1024 * 1024;

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/aac": "aac",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "application/pdf": "pdf",
  "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "text/plain": "txt",
  "text/vcard": "vcf",
};

/** Enum do /message/sendMedia validado em produção. */
export type SendMediaType = "image" | "document" | "video" | "audio";

/** Resolve o mediatype do enum a partir do MIME. null = tipo não suportado. */
export function sendMediaTypeFor(mimeType: string): SendMediaType | null {
  const m = mimeType.toLowerCase();
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("audio/")) return "audio";
  if (m.startsWith("video/")) return "video";
  // application/pdf, application/msword, application/vnd.openxml, text/* etc.
  // todos entram como "document" no WhatsApp.
  return "document";
}

export type EvolvedMedia = {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  width: number | null;
  height: number | null;
  bytes: number;
};

export type MediaResult = { ok: true; media: EvolvedMedia } | { ok: false; reason: string };

/** Pede o base64 decifrado pra Evolution (endpoint validado em produção). */
export async function fetchMediaFromEvolution(opts: {
  orgId: string;
  instance: string;
  key: { remoteJid: string; fromMe: boolean; id: string };
}): Promise<MediaResult> {
  const cfg = await loadSettings(opts.orgId);
  const creds = effectiveCreds(cfg);
  if (!creds) return { ok: false, reason: "evolution_not_configured" };

  let res: Response;
  try {
    res = await fetch(
      `${creds.baseUrl}/chat/getBase64FromMediaMessage/${encodeURIComponent(opts.instance)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", apikey: creds.key },
        body: JSON.stringify({ message: { key: opts.key } }),
        signal: AbortSignal.timeout(20_000),
      },
    );
  } catch (e) {
    console.error("[media] evolution fetch failed", e);
    return { ok: false, reason: "evolution_unreachable" };
  }
  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    console.error("[media] getBase64FromMediaMessage failed", res.status, raw.slice(0, 300));
    return { ok: false, reason: `evolution_http_${res.status}` };
  }

  const body: any = await res.json().catch(() => null);
  const b64: string | undefined = body?.base64;
  if (!b64) return { ok: false, reason: "evolution_empty_base64" };

  const buffer = Buffer.from(b64, "base64");
  if (buffer.byteLength === 0) return { ok: false, reason: "empty_buffer" };
  if (buffer.byteLength > MAX_BYTES) return { ok: false, reason: "too_large" };

  return {
    ok: true,
    media: {
      buffer,
      mimeType: typeof body?.mimetype === "string" ? body.mimetype : "application/octet-stream",
      fileName: typeof body?.fileName === "string" ? body.fileName : opts.key.id,
      width: Number(body?.size?.width ?? 0) || null,
      height: Number(body?.size?.height ?? 0) || null,
      bytes: buffer.byteLength,
    },
  };
}

/**
 * Converte o byte-map que a Evolution usa pra serializar Buffers em JSON
 * ({ "0": 255, "1": 216, ... }) de volta pra um Buffer. Retorna null se o
 * shape não for o esperado — thumbnail é luxo, nunca motivo pra falhar.
 */
export function bufferFromByteMap(value: unknown): Buffer | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const vals = Object.values(value as Record<string, unknown>);
  if (!vals.length || vals.some((v) => typeof v !== "number")) return null;
  const buf = Buffer.from(vals as number[]);
  return buf.byteLength ? buf : null;
}

/** Extensão do arquivo: MIME conhecido → ext; senão hint do fileName; senão "bin". */
export function extFor(mimeType: string, fileNameHint?: string): string {
  const fromMime = EXT_BY_MIME[mimeType.toLowerCase()];
  if (fromMime) return fromMime;
  const hint = fileNameHint?.split(".").pop()?.toLowerCase();
  if (hint && /^[a-z0-9]{1,5}$/.test(hint)) return hint;
  return "bin";
}

export type UploadResult = { ok: true; path: string } | { ok: false; reason: string };

/** Sobe pro bucket privado; caminho inclui message_id → reenvio sobrescreve. */
export async function uploadMediaToStorage(opts: {
  orgId: string;
  demandaId: string;
  messageId: string;
  media: EvolvedMedia;
}): Promise<UploadResult> {
  const ext = extFor(opts.media.mimeType, opts.media.fileName);
  const path = `${opts.orgId}/${opts.demandaId}/${opts.messageId}.${ext}`;
  const { error } = await supabaseAdmin.storage
    .from("demanda-media")
    .upload(path, opts.media.buffer, {
      contentType: opts.media.mimeType,
      upsert: true,
    });
  if (error) {
    console.error("[media] storage upload failed", path, error.message);
    return { ok: false, reason: `storage_${error.message}` };
  }
  return { ok: true, path };
}

/**
 * Thumbnail de vídeo (jpegThumbnail do payload WhatsApp) como arquivo próprio.
 * Permite o card de preview renderizar sem baixar o vídeo inteiro.
 */
export async function uploadThumbToStorage(opts: {
  orgId: string;
  demandaId: string;
  messageId: string;
  buffer: Buffer;
}): Promise<UploadResult> {
  const path = `${opts.orgId}/${opts.demandaId}/${opts.messageId}_thumb.jpg`;
  const { error } = await supabaseAdmin.storage
    .from("demanda-media")
    .upload(path, opts.buffer, {
      contentType: "image/jpeg",
      upsert: true,
    });
  if (error) {
    console.error("[media] thumb upload failed", path, error.message);
    return { ok: false, reason: `storage_${error.message}` };
  }
  return { ok: true, path };
}

/** URL assinada de leitura (1h) — gerada na hora de renderizar, nunca persistida. */
export async function signedMediaUrl(path: string, expiresIn = 3600): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from("demanda-media")
    .createSignedUrl(path, expiresIn);
  if (error) {
    console.error("[media] signed url failed", path, error.message);
    return null;
  }
  return data?.signedUrl ?? null;
}

/** Resposta do /message/sendMedia (só o que precisamos: id e status). */
export type SendMediaResult = {
  messageId: string;
  remoteJid: string;
  status: string;
};

export type SendMediaOutcome =
  | { ok: true; result: SendMediaResult }
  | { ok: false; reason: string };

/**
 * Envia uma mídia já em memória (Buffer) pra Evolution via /message/sendMedia.
 * Shape validado em produção (A/B): { number, mediatype, media, mimetype,
 * fileName, caption }. Enum de mediatype: image | document | video | audio
 * (sticker rejeitado em produção, item separado).
 *
 * Retorna o key.id da Evolution (que vira message_id + nome do arquivo no
 * bucket). Não faz upload pro Storage: responsabilidade de quem chama,
 * porque a ordem certa é: 1) enviar pra Evolution, 2) só subir pro Storage
 * com o key.id real.
 */
export async function sendMediaViaEvolution(opts: {
  orgId: string;
  instance: string;
  remoteJid: string;
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  caption?: string;
}): Promise<SendMediaOutcome> {
  const mediaType = sendMediaTypeFor(opts.mimeType);
  if (!mediaType) {
    return { ok: false, reason: `unsupported_mimetype_${opts.mimeType}` };
  }

  const cfg = await loadSettings(opts.orgId);
  const creds = effectiveCreds(cfg);
  if (!creds) return { ok: false, reason: "evolution_not_configured" };

  const base64 = opts.buffer.toString("base64");
  const body: Record<string, unknown> = {
    number: opts.remoteJid,
    mediatype: mediaType,
    media: base64,
    mimetype: opts.mimeType,
    fileName: opts.fileName,
  };
  if (opts.caption && opts.caption.trim()) body.caption = opts.caption;

  let res: Response;
  try {
    res = await fetch(
      `${creds.baseUrl}/message/sendMedia/${encodeURIComponent(opts.instance)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", apikey: creds.key },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60_000),
      },
    );
  } catch (e) {
    console.error("[media] sendMedia fetch failed", e);
    return { ok: false, reason: "evolution_unreachable" };
  }

  if (!res.ok) {
    const raw = await res.text().catch(() => "");
    console.error("[media] sendMedia failed", res.status, raw.slice(0, 500));
    return { ok: false, reason: `evolution_http_${res.status}` };
  }

  const json: any = await res.json().catch(() => null);
  const key = json?.key;
  const id = typeof key?.id === "string" ? key.id : null;
  if (!id) return { ok: false, reason: "evolution_no_message_id" };

  return {
    ok: true,
    result: {
      messageId: id,
      remoteJid: typeof key?.remoteJid === "string" ? key.remoteJid : opts.remoteJid,
      status: typeof json?.status === "string" ? json.status : "PENDING",
    },
  };
}