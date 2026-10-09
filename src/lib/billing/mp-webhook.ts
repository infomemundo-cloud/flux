/**
 * src/lib/billing/mp-webhook.ts
 * 
 * Validação HMAC de webhooks do Mercado Pago.
 * 
 * FORMATO CORRETO DO MANIFEST (confirmado pelos exemplos de código oficiais):
 * id:{data.id};request-id:{x-request-id};ts:{ts};
 * - Separador: PONTO-E-VÍRGULA (;)
 * - Trailing semicolon: OBRIGATÓRIO
 * - data.id: LOWERCASE se alfanumérico
 * 
 * Ref: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
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
 * Monta o manifest do HMAC no formato EXATO dos exemplos oficiais do MP:
 * id:{data.id};request-id:{x-request-id};ts:{ts};
 */
export function buildManifest(input: {
  dataId?: string;
  requestId?: string;
  ts: string;
}): string {
  const dataIdLower = input.dataId ? input.dataId.toLowerCase() : "";
  return `id:${dataIdLower};request-id:${input.requestId ?? ""};ts:${input.ts};`;
}

/**
 * Valida o HMAC-SHA256 — retorna boolean (interface simples para webhook.ts).
 * SÍNCRONA (crypto é síncrono em Node.js).
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
        dataIdLower: dataId.toLowerCase(),
        xRequestId,
        ts,
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
 * Compatibilidade retroativa — wrapper sobre verifyMpSignature.
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
