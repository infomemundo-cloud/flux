/**
 * src/lib/billing/mp-webhook.ts
 * Fase 4.3/4.5 — Validação HMAC de webhooks MP (funções puras testáveis).
 *
 * CONTRATO (2026-10-09, revisado após evidência de duas aplicações):
 * - Segredo ÚNICO por aplicação (MP_WEBHOOK_SECRET). O segredo válido é o do
 *   app DONO dos recursos (hoje: app de teste 46866664961523154 / Flux Vendedor).
 * - Manifest: VALIDAÇÃO DUPLA anti-drift de documentação.
 *   (a) Formato dos exemplos oficiais de código (PHP/JS/Python/Go):
 *       id:{data.id};request-id:{x-request-id};ts:{ts};
 *   (b) Formato textual citado por consultoria/agente MP:
 *       id:{data.id} request-id:{x-request-id} ts:{ts}
 *   Aceita se QUALQUER um bater e loga qual venceu (evidência empírica).
 * - data.id: SEMPRE da query string, lowercase (doc oficial).
 * - Trechos ausentes removidos (não vazios) no formato (b); no (a) mantém
 *   estrutura fixa com valores vazios, como nos exemplos oficiais.
 * - Dedupe por payload.id (notification_id), NÃO por payload.data.id.
 */
import crypto from "node:crypto";

export type MpWebhookPayload = {
  id?: string | number; // notification_id (chave de dedupe)
  topic?: string;
  action?: string;
  type?: string;
  live_mode?: boolean;
  data?: { id?: string | number; [key: string]: unknown };
  [key: string]: unknown;
};

export type HmacResult =
  | { ok: true; format: "semicolons" | "spaces" }
  | { ok: false; status: 401; reason: "missing_header" | "signature_mismatch" }
  | { ok: false; status: 500; reason: "missing_secret" };

/** Parse do header x-signature: "ts=...,v1=..." */
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

/** Formato (a): exemplos oficiais de código — ponto-e-vírgula + trailing. */
export function buildManifestSemicolons(input: {
  dataId: string;
  requestId: string;
  ts: string;
}): string {
  return `id:${input.dataId};request-id:${input.requestId};ts:${input.ts};`;
}

/** Formato (b): pares separados por espaço, trechos ausentes removidos. */
export function buildManifestSpaces(input: {
  dataId?: string;
  requestId?: string;
  ts: string;
}): string {
  const chunks: string[] = [];
  if (input.dataId && input.dataId.trim()) chunks.push(`id:${input.dataId.trim()}`);
  if (input.requestId && input.requestId.trim())
    chunks.push(`request-id:${input.requestId.trim()}`);
  chunks.push(`ts:${input.ts.trim()}`);
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

/**
 * Valida HMAC-SHA256 testando os dois formatos de manifest.
 * Retorna qual formato venceu para logging forense.
 */
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

  const idLower = (dataId ?? "").trim().toLowerCase();
  const rid = (xRequestId ?? "").trim();

  const manifestSemi = buildManifestSemicolons({ dataId: idLower, requestId: rid, ts });
  const manifestSpaces = buildManifestSpaces({ dataId: idLower, requestId: rid, ts });

  const calcSemi = crypto.createHmac("sha256", secret).update(manifestSemi).digest("hex");
  const calcSpaces = crypto.createHmac("sha256", secret).update(manifestSpaces).digest("hex");

  const matchSemi = timingSafeEqualHex(calcSemi, v1);
  const matchSpaces = !matchSemi && timingSafeEqualHex(calcSpaces, v1);

  const format = matchSemi ? "semicolons" : matchSpaces ? "spaces" : null;

  // LOG FORENSE CENTRAL (sem segredo, só prefixos/tamanhos)
  console.log("[mp-webhook] sig_debug", {
    dataId: idLower,
    ts,
    xRequestId: rid,
    manifest_semi: manifestSemi,
    manifest_spaces: manifestSpaces,
    v1_recv: v1.slice(0, 8),
    calc_semi: calcSemi.slice(0, 8),
    calc_spaces: calcSpaces.slice(0, 8),
    secret_len: secret.length,
    secret_prefix: secret.slice(0, 4),
    isMatch: Boolean(format),
    format,
  });

  if (!format) return { ok: false, status: 401, reason: "signature_mismatch" };
  return { ok: true, format };
}

/**
 * Coerência env × live_mode — agora SOMENTE observacional (warn), nunca rejeição.
 * Motivo (evidência 2026-10-09): token produtivo de usuário de teste faz o MP
 * entregar tudo na URL ?env=prod com live_mode misto por recurso
 * (payment=true, subscription_*=false). Rejeitar por gate derrubava eventos legítimos.
 * A escolha do token de consulta ao MP continua sendo por live_mode, no processor.
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

/** Extrai campos mínimos pro insert em billing_events (dedupe por payload.id). */
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
