/**
 * Fase 4.5 — Helper de validação HMAC do Mercado Pago
 * 
 * ATUALIZAÇÃO 2026-10-09:
 * - Manifest com ESPAÇOS (confirmado pelo agente MP)
 * - data.id lowercase
 * - validateEnvLiveMode torna-se observacional (não rejeita)
 * - Motivo: token APP_USR- de usuário de teste faz webhooks chegarem em ?env=prod
 *   mas com live_mode=false. Rejeitar por gate derrubava eventos legítimos.
 */
import crypto from "node:crypto";

export type MpWebhookPayload = {
  id?: string | number;
  topic?: string;
  action?: string;
  type?: string;
  live_mode?: boolean;
  data?: {
    id?: string | number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type HmacResult =
  | { ok: true }
  | { ok: false; status: 401; reason: "missing_header" | "signature_mismatch" }
  | { ok: false; status: 500; reason: "missing_secret" };

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
 * Manifest com ESPAÇOS (formato confirmado pelo agente MP):
 * id:{data.id} request-id:{x-request-id} ts:{ts}
 */
export function buildManifest(input: {
  dataId?: string;
  requestId?: string;
  ts: string;
}): string {
  const chunks: string[] = [];
  if (input.dataId && input.dataId.trim()) {
    chunks.push(`id:${input.dataId.trim().toLowerCase()}`);
  }
  if (input.requestId && input.requestId.trim()) {
    chunks.push(`request-id:${input.requestId.trim()}`);
  }
  if (input.ts && input.ts.trim()) {
    chunks.push(`ts:${input.ts.trim()}`);
  }
  return chunks.join(" ");
}

function timingSafeEqualHex(aHex: string, bHex: string): boolean {
  try {
    const a = Buffer.from(aHex, "utf8");
    const b = Buffer.from(bHex, "utf8");
    if (a.length !== b.length || a.length === 0) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function verifyMpManifestHmac(params: {
  secret: string | undefined;
  xSignature: string | null;
  xRequestId: string | null;
  dataId: string | undefined;
}): HmacResult {
  const { secret, xSignature, xRequestId, dataId } = params;

  if (!secret) {
    console.error("[mp-webhook] sig_debug secret_missing", { secret_len: 0 });
    return { ok: false, status: 500, reason: "missing_secret" };
  }

  const { ts, v1 } = parseXSignature(xSignature);
  if (!ts || !v1) {
    console.warn("[mp-webhook] sig_debug missing_header", { xSignature, xRequestId });
    return { ok: false, status: 401, reason: "missing_header" };
  }

  const manifest = buildManifest({
    dataId,
    requestId: xRequestId || undefined,
    ts,
  });

  const computed = crypto
    .createHmac("sha256", secret)
    .update(manifest)
    .digest("hex");

  const isMatch = timingSafeEqualHex(computed, v1);

  console.log("[mp-webhook] sig_debug", {
    dataId: dataId?.toLowerCase(),
    ts,
    xRequestId,
    manifest,
    v1_recv: v1.slice(0, 8),
    v1_calc: computed.slice(0, 8),
    secret_len: secret.length,
    secret_prefix: secret.slice(0, 4),
    isMatch,
  });

  if (!isMatch) {
    return { ok: false, status: 401, reason: "signature_mismatch" };
  }

  return { ok: true };
}

/**
 * OBSERVACIONAL apenas — não rejeita eventos.
 * Token APP_USR- de usuário de teste faz webhooks chegarem em ?env=prod
 * mas com live_mode=false. Rejeitar derrubava eventos legítimos.
 * live_mode é a fonte de verdade do ambiente.
 */
export function observeEnvLiveMode(params: {
  env: "test" | "prod" | null;
  liveMode: boolean;
}): { coherent: boolean } {
  const { env, liveMode } = params;
  const coherent =
    env === "prod" ? liveMode === true : env === "test" ? liveMode === false : true;

  if (!coherent) {
    console.warn("[mp-webhook] env_livemode_warn (não bloqueante)", { env, liveMode });
  }

  return { coherent };
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
