/**
 * src/lib/billing/mp-webhook.ts
 * 
 * FORMATO CONFIRMADO PELO AGENTE MP (2026-10-09):
 * Manifest com ESPAÇOS (não ponto-e-vírgula):
 *   id:{data.id} request-id:{x-request-id} ts:{ts}
 * 
 * Regras:
 * - data.id sempre lowercase (inofensivo para numéricos)
 * - Trechos ausentes REMOVIDOS (não vazios)
 * - data.id vem da QUERY STRING (não do body)
 * - payload.id = notification_id (dedupe)
 * - data.id = resource_id (manifest + GET)
 */
import crypto from "node:crypto";

export type MpWebhookPayload = {
  id?: string | number;
  topic?: string;
  action?: string;
  type?: string;
  live_mode?: boolean;
  data?: { id?: string | number; [key: string]: unknown };
  [key: string]: unknown;
};

export type HmacResult =
  | { ok: true }
  | { ok: false; status: 401; reason: "missing_header" | "signature_mismatch" }
  | { ok: false; status: 500; reason: "missing_secret" };

/**
 * Parse do header x-signature: "ts=1704908010,v1=abcdef..."
 */
export function parseXSignature(header: string | null): {
  ts?: string;
  v1?: string;
} {
  if (!header) return {};
  const kv = new Map<string, string>();
  for (const part of header.split(",").map((p) => p.trim())) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k && v) kv.set(k, v);
  }
  return { ts: kv.get("ts"), v1: kv.get("v1") };
}

/**
 * Monta o manifest com ESPAÇOS (formato confirmado pelo Agente MP).
 * Trechos ausentes são REMOVIDOS (não ficam vazios).
 * data.id sempre lowercase.
 */
export function buildManifest(input: {
  dataId?: string;
  requestId?: string;
  ts: string;
}): string {
  const chunks: string[] = [];
  
  // data.id lowercase (inofensivo para numéricos, obrigatório para alfanuméricos)
  if (input.dataId) {
    chunks.push(`id:${input.dataId.toLowerCase()}`);
  }
  
  // request-id: remover trecho inteiro se ausente
  if (input.requestId) {
    chunks.push(`request-id:${input.requestId}`);
  }
  
  // ts: sempre presente (obrigatório pelo header x-signature)
  chunks.push(`ts:${input.ts}`);
  
  // JUNTA COM ESPAÇO (não ponto-e-vírgula!)
  return chunks.join(" ");
}

/**
 * Valida HMAC-SHA256 — SÍNCRONA (crypto é síncrono em Node.js).
 * Exportada como verifyMpSignature para uso direto no webhook.ts.
 */
export function verifyMpSignature(
  xSignature: string,
  xRequestId: string,
  dataId: string,
  secret: string,
): boolean {
  if (!secret) {
    console.error("[mp-webhook-verify] missing_secret");
    return false;
  }

  const { ts, v1 } = parseXSignature(xSignature);
  if (!ts || !v1) {
    console.warn("[mp-webhook-verify] invalid_signature_header", { xSignature });
    return false;
  }

  const manifest = buildManifest({
    dataId,
    requestId: xRequestId || undefined,
    ts,
  });

  const computedHash = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  if (computedHash.length !== v1.length) {
    console.warn("[mp-webhook-verify] hash_length_mismatch", {
      computedLen: computedHash.length,
      receivedLen: v1.length,
    });
    return false;
  }

  try {
    const isValid = crypto.timingSafeEqual(
      Buffer.from(computedHash, "hex"),
      Buffer.from(v1, "hex"),
    );

    if (!isValid) {
      console.warn("[mp-webhook-verify] hmac_mismatch", {
        dataId,
        manifest,
        expectedPrefix: computedHash.slice(0, 16),
        receivedPrefix: v1.slice(0, 16),
      });
    }

    return isValid;
  } catch (err) {
    console.error("[mp-webhook-verify] timing_safe_equal_error", err);
    return false;
  }
}

/**
 * Compatibilidade retroativa.
 */
export function verifyMpManifestHmac(params: {
  secret: string | undefined;
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | undefined;
}): HmacResult {
  const { secret, xSignature, xRequestId, dataId } = params;
  if (!secret) return { ok: false, status: 500, reason: "missing_secret" };

  const result = verifyMpSignature(
    xSignature || "",
    xRequestId || "",
    dataId || "",
    secret,
  );

  return result ? { ok: true } : { ok: false, status: 401, reason: "signature_mismatch" };
}

export function extractBillingEventRecord(
  payload: MpWebhookPayload,
  liveMode: boolean,
) {
  return {
    mp_event_id: String(payload.id ?? "").trim(),
    topic: String(payload.topic ?? payload.type ?? ""),
    action: String(payload.action ?? ""),
    live_mode: liveMode,
    payload: payload as unknown as Record<string, unknown>,
    status: "received" as const,
  };
}
