/**
 * src/lib/billing/mp-webhook.ts
 * 
 * CORREÇÃO CRÍTICA HMAC (2026-10-09):
 * 1. Manifest usa ponto-e-vírgula (;) como separador (doc oficial MP).
 * 2. Trailing semicolon obrigatório no final do manifest.
 * 3. data.id forçado para lowercase (exigência doc oficial para IDs alfanuméricos).
 */
import crypto from "node:crypto";

// ... (mantenha os types existentes MpWebhookPayload, HmacResult, etc.) ...

/**
 * Monta o manifest do HMAC seguindo EXATAMENTE a doc oficial do MP:
 * https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 * 
 * Formato: id:{data.id};request-id:{x-request-id};ts:{ts};
 * - Separador: ponto-e-vírgula (;)
 * - Trailing semicolon: obrigatório
 * - data.id: lowercase se alfanumérico
 */
export function buildManifest(input: {
  dataId?: string;
  requestId?: string;
  ts: string;
}): string {
  // Força lowercase no dataId conforme exigência da doc oficial
  const dataIdLower = input.dataId ? input.dataId.toLowerCase() : undefined;
  
  // Constrói manifest com ponto-e-vírgula e trailing semicolon
  return `id:${dataIdLower ?? ""};request-id:${input.requestId ?? ""};ts:${input.ts};`;
}

/**
 * Valida o HMAC-SHA256 do MP usando o formato correto de manifest.
 * Exportada como verifyMpSignature para compatibilidade com webhook.ts
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

  const { ts, v1 } = parseXSignature(xSignature);
  if (!ts || !v1) {
    console.warn("[mp-webhook-verify] invalid_signature_header", { xSignature });
    return false;
  }

  // Usa o novo buildManifest com formato correto (;) e lowercase
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
}

// Mantém a função antiga para compatibilidade retroativa se outros arquivos usarem
export function verifyMpManifestHmac(params: {
  secret: string | undefined;
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | undefined;
}): HmacResult {
  const { secret, xSignature, xRequestId, dataId } = params;
  if (!secret) return { ok: false, status: 500, reason: "missing_secret" };
  
  const { ts, v1 } = parseXSignature(xSignature);
  if (!ts || !v1) return { ok: false, status: 401, reason: "missing_header" };

  // Usa o mesmo manifesto corrigido
  const manifest = buildManifest({
    dataId,
    requestId: xRequestId || undefined,
    ts,
  });

  const computed = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  
  if (computed.length !== v1.length) return { ok: false, status: 401, reason: "signature_mismatch" };
  
  const valid = crypto.timingSafeEqual(Buffer.from(computed, "hex"), Buffer.from(v1, "hex"));
  return valid ? { ok: true } : { ok: false, status: 401, reason: "signature_mismatch" };
}

// ... (mantenha extractBillingEventRecord e validateEnvLiveMode existentes) ...
