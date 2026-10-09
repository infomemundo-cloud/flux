/**
 * src/lib/billing/mp-webhook.ts
 * 
 * CORREÇÃO CRÍTICA HMAC (2026-10-09):
 * 1. Manifest usa ESPAÇO como separador (doc oficial MP: id:x request-id:y ts:z)
 * 2. data.id forçado para lowercase (exigência doc oficial para IDs alfanuméricos)
 * 3. parseXSignature exportado para uso em verifyMpSignature
 * 4. verifyMpSignature síncrona (não precisa ser async para crypto operations)
 */
import crypto from "node:crypto";

export type MpWebhookPayload = {
  id?: string | number;
  topic?: string;
  action?: string;
  type?: string;
  live_mode?: boolean;
  data?: { id?: string | number;[key: string]: unknown };
  [key: string]: unknown;
};

export type HmacResult =
  | { ok: true }
  | { ok: false; status: 401; reason: "missing_header" | "signature_mismatch" }
  | { ok: false; status: 500; reason: "missing_secret" };

/**
 * Parse do header x-signature: "ts=1704908010,v1=abcdef..."
 * EXPORTADO para uso em verifyMpSignature
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
 * Monta o manifest do HMAC seguindo EXATAMENTE a doc oficial do MP:
 * https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 * 
 * Formato OFICIAL (com ESPAÇOS, não ponto-e-vírgula):
 * id:{data.id} request-id:{x-request-id} ts:{ts}
 * 
 * Nota: A doc mostra exemplo com espaço como separador.
 * data.id deve ser lowercase se alfanumérico.
 */
export function buildManifest(input: {
  dataId?: string;
  requestId?: string;
  ts: string;
}): string {
  const chunks: string[] = [];
  
  // Força lowercase no dataId conforme exigência da doc oficial
  const dataIdLower = input.dataId ? input.dataId.toLowerCase() : undefined;
  
  if (dataIdLower) chunks.push(`id:${dataIdLower}`);
  if (input.requestId) chunks.push(`request-id:${input.requestId}`);
  chunks.push(`ts:${input.ts}`);
  
  // Junta com ESPAÇO (não ponto-e-vírgula) conforme doc oficial
  return chunks.join(" ");
}

/**
 * Valida o HMAC-SHA256 do MP usando o formato correto de manifest.
 * SÍNCRONA (crypto operations são síncronas em Node.js)
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

  // Usa buildManifest com formato correto (espaços) e lowercase
  const manifest = buildManifest({
    dataId,
    requestId: xRequestId || undefined,
    ts,
  });

  const computedHash = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  // Comparação timing-safe
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
        manifestPreview: manifest.slice(0, 80),
        expectedPrefix: computedHash.slice(0, 8),
        receivedPrefix: v1.slice(0, 8),
      });
    }

    return isValid;
  } catch (err) {
    console.error("[mp-webhook-verify] timing_safe_equal_error", err);
    return false;
  }
}

// Mantém compatibilidade retroativa
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
    secret
  );
  
  return result ? { ok: true } : { ok: false, status: 401, reason: "signature_mismatch" };
}

export function extractBillingEventRecord(payload: MpWebhookPayload, liveMode: boolean) {
  return {
    mp_event_id: String(payload.id ?? "").trim(),
    topic: String(payload.topic ?? payload.type ?? ""),
    action: String(payload.action ?? ""),
    live_mode: liveMode,
    payload: payload as unknown as Record<string, unknown>,
    status: "received" as const,
  };
}
