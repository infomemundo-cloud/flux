/**
 * Mídias de demandas: ponte Evolution → Supabase Storage.
 *
 * Fluxo: webhook chega com metadata criptografado (imageMessage/audioMessage/...)
 * → fetchMediaFromEvolution pede o base64 JÁ DECIFRADO pra Evolution
 *   (ela lê do próprio banco de mensagens, então não depende da URL do CDN estar viva)
 * → uploadMediaToStorage grava em demanda-media/{org}/{demanda}/{message_id}.{ext}
 *   com upsert (reenvio do mesmo webhook sobrescreve, não duplica)
 * → signedMediaUrl gera URL temporária de leitura na hora de renderizar.
 *
 * Nenhuma função aqui derruba o webhook: tudo retorna { ok: false, reason }
 * e quem chama (ingest) decide logar + registrar o evento mesmo sem a mídia.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { loadSettings, effectiveCreds } from "@/lib/whatsapp.functions";

/** 100 MB — teto de documento do WhatsApp (imagem/áudio/vídeo: 16 MB). */
const MAX_BYTES = 100 * 1024 * 1024;

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

export type EvolvedMedia = {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  width: number | null;
  height: number | null;
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
    },
  };
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
