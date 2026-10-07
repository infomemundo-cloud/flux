/**
 * Fase 4.3 — Webhook receiver MP (funções puras testáveis isoladamente).
 *
 * Contrato fechado com consultoria MP (2026-10-08):
 *  - Secret única compartilhada entre ambientes (test + prod).
 *  - Discriminador de ambiente via query param `?env=test|prod`.
 *  - `data.id` vem SEMPRE do body (não da query).
 *  - Manifest HMAC: `id:{data.id} request-id:{x-request-id} ts:{ts}` com
 *    espaços; `data.id` lowercase; trechos ausentes removidos antes do HMAC.
 *  - Dedupe por `payload.id` (notification_id, NÃO `payload.data.id`).
 *  - Mismatch env × live_mode → HTTP 200 silencioso (evita retries do MP).
 */
import crypto from "node:crypto";

export type MpWebhookPayload = {
  id?: string | number; // notification_id (chave de dedupe)
  topic?: string;
  action?: string;
  type?: string; // alias em alguns tópicos
  live_mode?: boolean;
  data?: {
    id?: string | number; // id do recurso (preapproval/payment)
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type HmacResult =
  | { ok: true }
  | { ok: false; status: 401; reason: "missing_header" | "signature_mismatch" }
  | { ok: false; status: 500; reason: "missing_secret" };

export type EnvLiveModeResult =
  | { ok: true }
  | { ok: false; status: 200; reason: "env_mismatch" };

/**
 * Parse do header x-signature: "ts=1704908010,v1=abcdef..."
 * Retorna ts + v1 (hex) ou undefined se malformado.
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
 * Monta o manifest do HMAC seguindo a doc do MP:
 *  - Pares separados por ESPAÇO (não ponto-e-vírgula).
 *  - `data.id` lowercase.
 *  - Trechos ausentes REMOVIDOS (não vazios).
 */
export function buildManifest(input: {
  dataId?: string;
  requestId?: string;
  ts: string;
}): string {
  const chunks: string[] = [];
  if (input.dataId) chunks.push(`id:${input.dataId}`);
  if (input.requestId) chunks.push(`request-id:${input.requestId}`);
  chunks.push(`ts:${input.ts}`);
  return chunks.join(" ");
}

/**
 * Comparação timing-safe de dois hex strings.
 * Retorna false em tamanhos diferentes (timingSafeEqual exige buffers iguais).
 */
function timingSafeEqualHex(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Valida o HMAC-SHA256 do MP.
 *  - Usa SEMPRE a mesma secret (compartilhada entre test/prod).
 *  - `dataId` deve vir do body (payload.data.id), já lowercase.
 */
export function verifyMpManifestHmac(params: {
  secret: string | undefined;
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | undefined;
}): HmacResult {
  const { secret, xSignature, xRequestId, dataId } = params;
  if (!secret) {
    return { ok: false, status: 500, reason: "missing_secret" };
  }

  const { ts, v1 } = parseXSignature(xSignature);
  if (!ts || !v1) {
    return { ok: false, status: 401, reason: "missing_header" };
  }

  const dataIdLower = dataId ? dataId.toLowerCase() : undefined;
  const manifest = buildManifest({
    dataId: dataIdLower,
    requestId: xRequestId || undefined,
    ts,
  });

  const computed = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  if (!timingSafeEqualHex(computed, v1)) {
    return { ok: false, status: 401, reason: "signature_mismatch" };
  }

  return { ok: true };
}

/**
 * Valida coerência env × live_mode (D17).
 *  - env=prod exige live_mode=true
 *  - env=test exige live_mode=false
 *  - Mismatch → 200 silencioso (não dispara retry do MP).
 */
export function validateEnvLiveMode(params: {
  env: "test" | "prod" | null;
  liveMode: boolean;
}): EnvLiveModeResult {
  const { env, liveMode } = params;
  if (env === "prod" && liveMode !== true) {
    return { ok: false, status: 200, reason: "env_mismatch" };
  }
  if (env === "test" && liveMode !== false) {
    return { ok: false, status: 200, reason: "env_mismatch" };
  }
  return { ok: true };
}

/**
 * Extrai os campos mínimos do payload pro insert em billing_events.
 * `mp_event_id` = payload.id (notification_id, NÃO payload.data.id).
 */
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
