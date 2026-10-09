import crypto from "node:crypto";

export type MpWebhookPayload = {
  id?: string | number;
  topic?: string;
  action?: string;
  type?: string;
  live_mode?: boolean;
  application_id?: number;
  user_id?: number;
  data?: {
    id?: string | number;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type HmacResult =
  | { ok: true }
  | {
      ok: false;
      status: 401;
      reason: "missing_header" | "signature_mismatch";
    }
  | {
      ok: false;
      status: 500;
      reason: "missing_secret" | "invalid_signature_format";
    };

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
    let v = part.slice(idx + 1).trim();

    v = v.replace(/^["'`]/, "").replace(/["'`]$/, "");

    if (k && v) kv.set(k, v);
  }

  return {
    ts: kv.get("ts")?.trim(),
    v1: kv.get("v1")?.trim().toLowerCase(),
  };
}

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

  chunks.push(`ts:${input.ts.trim()}`);

  return chunks.join(" ");
}

function timingSafeEqualHex(aHex: string, bHex: string): boolean {
  try {
    const aNorm = aHex.trim().toLowerCase();
    const bNorm = bHex.trim().toLowerCase();

    if (aNorm.length !== 64 || bNorm.length !== 64) return false;

    const a = Buffer.from(aNorm, "hex");
    const b = Buffer.from(bNorm, "hex");

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
    console.warn("[mp-webhook] sig_debug missing_header", {
      hasXSignature: Boolean(xSignature),
      hasXRequestId: Boolean(xRequestId),
      hasTs: Boolean(ts),
      hasV1: Boolean(v1),
    });
    return { ok: false, status: 401, reason: "missing_header" };
  }

  if (v1.length !== 64) {
    console.warn("[mp-webhook] sig_debug invalid_signature_format", {
      v1_len: v1.length,
    });
    return { ok: false, status: 500, reason: "invalid_signature_format" };
  }

  // 1) Manifest Canônico Padrão (id + request-id + ts)
  const manifest = buildManifest({
    dataId,
    requestId: xRequestId || undefined,
    ts,
  });

  const computed = crypto.createHmac("sha256", secret).update(manifest).digest("hex");
  const isMatch = timingSafeEqualHex(computed, v1);

  // 2) Manifest Alternativo de Diagnóstico (id + ts sem request-id)
  const altManifest = `id:${dataId?.toLowerCase().trim()} ts:${ts.trim()}`;
  const altComputed = crypto.createHmac("sha256", secret).update(altManifest).digest("hex");
  const isAltMatch = timingSafeEqualHex(altComputed, v1);

  console.log("[mp-webhook] sig_debug", {
    dataId: dataId?.toLowerCase(),
    ts,
    xRequestId,
    manifest,
    v1_recv_len: v1.length,
    v1_calc_len: computed.length,
    v1_recv_prefix: v1.slice(0, 8),
    v1_calc_prefix: computed.slice(0, 8),
    secret_len: secret.length,
    secret_prefix: secret.slice(0, 4),
    isMatch,
    isAltMatch, // Indica se funcionaria sem o request-id
  });

  if (isAltMatch && !isMatch) {
    console.warn("[mp-webhook] MATCH_SUCCEEDED_WITH_ALT_MANIFEST (without request-id)");
  }

  if (!isMatch && !isAltMatch) {
    return { ok: false, status: 401, reason: "signature_mismatch" };
  }

  return { ok: true };
}

export function observeEnvLiveMode(params: {
  env: "test" | "prod" | null;
  liveMode?: boolean;
}): { coherent: boolean } {
  const { env, liveMode } = params;

  if (typeof liveMode !== "boolean") return { coherent: true };

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
  fallbackId?: string,
) {
  const mpEventId = String(payload.id ?? "").trim() || fallbackId || "";

  return {
    mp_event_id: mpEventId,
    topic: String(payload.topic ?? payload.type ?? "").trim() || "unknown",
    action: String(payload.action ?? "").trim() || "updated",
    live_mode: liveMode,
    payload: payload as unknown as Record<string, unknown>,
    status: "received" as const,
  };
}
