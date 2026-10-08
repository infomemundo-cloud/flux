/**
 * src/lib/billing/mp-webhook.ts
 * 
 * Validação HMAC de webhooks do Mercado Pago conforme documentação oficial:
 * https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 * 
 * Manifest CORRETO (doc oficial): id:{data_id};request-id:{x_request_id};ts:{ts};
 * Algoritmo: HMAC-SHA256 hex
 * 
 * CORREÇÕES APLICADAS (2026-10-09):
 * 1. Exporta verifyMpSignature (nome esperado pelo webhook.ts)
 * 2. Usa ponto-e-vírgula no manifest (não espaços)
 * 3. Não força lowercase no dataId (IDs do MP são case-sensitive)
 * 4. Adiciona trailing semicolon no manifest (exigido pela doc)
 */
import crypto from "crypto";

/**
 * Extrai ts e v1 do header x-signature.
 * Formato: "ts=1704908010,v1=618c85345248dd820d5fd456117c2ab2ef8eda45a0282ff693eac24131a5e839"
 */
function parseSignatureHeader(xSignature: string): { ts: string; v1: string } | null {
  try {
    const parts = xSignature.split(",");
    let ts = "";
    let v1 = "";
    for (const part of parts) {
      const [key, value] = part.split("=").map((s) => s.trim());
      if (key === "ts") ts = value;
      if (key === "v1") v1 = value;
    }
    if (!ts || !v1) return null;
    return { ts, v1 };
  } catch {
    return null;
  }
}

/**
 * Valida a assinatura HMAC de um webhook do Mercado Pago.
 * 
 * @param xSignature - Header x-signature completo (ts=...,v1=...)
 * @param xRequestId - Header x-request-id
 * @param dataId     - ID do recurso (vem de query param data.id)
 * @param secret     - Segredo do webhook (MP_WEBHOOK_SECRET_TEST ou PROD)
 * @returns true se a assinatura é válida, false caso contrário
 */
export async function verifyMpSignature(
  xSignature: string,
  xRequestId: string,
  dataId: string,
  secret: string,
): Promise<boolean> {
  if (!secret) {
    console.error("[mp-webhook-verify] missing_secret");
    return false;
  }

  const parsed = parseSignatureHeader(xSignature);
  if (!parsed) {
    console.warn("[mp-webhook-verify] invalid_signature_header_format", { xSignature });
    return false;
  }

  const { ts, v1 } = parsed;

  // Constrói o manifest EXATAMENTE como documentado pelo MP:
  // id:{data_id};request-id:{x_request_id};ts:{ts};
  // Nota: trailing semicolon é obrigatório conforme exemplos oficiais
  const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;

  // Calcula HMAC-SHA256
  const computedHash = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  // Comparação segura contra timing attacks
  // Verifica tamanhos primeiro para evitar crash do timingSafeEqual
  if (computedHash.length !== v1.length) {
    console.warn("[mp-webhook-verify] hash_length_mismatch", {
      computedLen: computedHash.length,
      receivedLen: v1.length,
    });
    return false;
  }

  const isValid = crypto.timingSafeEqual(
    Buffer.from(computedHash, "hex"),
    Buffer.from(v1, "hex"),
  );

  if (!isValid) {
    console.warn("[mp-webhook-verify] hmac_mismatch", {
      dataId,
      xRequestId,
      ts,
      expectedPrefix: computedHash.slice(0, 8),
      receivedPrefix: v1.slice(0, 8),
      manifestPreview: manifest.slice(0, 50),
    });
  }

  return isValid;
}

// Mantém exports antigos para compatibilidade retroativa se outros arquivos usarem
export function verifyMpManifestHmac(params: {
  secret: string | undefined;
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | undefined;
}): { ok: boolean; status?: number; reason?: string } {
  const { secret, xSignature, xRequestId, dataId } = params;
  if (!secret || !xSignature || !dataId) {
    return { ok: false, status: 500, reason: "missing_params" };
  }
  // Delegate para a nova função síncrona-like (wrapper)
  // Nota: esta função é síncrona no signature mas verifyMpSignature é async
  // Para manter compat, fazemos validação básica aqui
  const parsed = parseSignatureHeader(xSignature);
  if (!parsed?.ts || !parsed?.v1) {
    return { ok: false, status: 401, reason: "missing_header" };
  }
  const manifest = `id:${dataId};request-id:${xRequestId || ""};ts:${parsed.ts};`;
  const computed = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  if (computed.length !== parsed.v1.length) return { ok: false, status: 401, reason: "signature_mismatch" };
  const valid = crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(parsed.v1, "hex"));
  return valid ? { ok: true } : { ok: false, status: 401, reason: "signature_mismatch" };
}

export type MpWebhookPayload = {
  id?: string | number;
  topic?: string;
  action?: string;
  type?: string;
  live_mode?: boolean;
  data?: { id?: string | number;[key: string]: unknown };
  [key: string]: unknown;
};

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
