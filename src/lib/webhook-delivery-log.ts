/**
 * Log de entregas de webhook (Fase 2) — fire-and-forget, imutável, redacted.
 *
 * Filtro de valor NA FONTE: este helper só é chamado em pontos de negócio
 * do ingest.$token.ts. Eventos utilitários (presence.update, typing, acks)
 * e descartes silenciosos (group_ingest_disabled, contacts.update sucesso)
 * NUNCA chegam aqui — a Evolution/Vercel já os registram em runtime.
 *
 * Padrão idêntico ao recordAdminAudit:
 *   - Nunca derruba a requisição principal (try/catch silencioso)
 *   - Falha de gravação vai pra console.error (observabilidade)
 *   - Payload SEMPRE passa por redactForLogPayload antes de gravar
 */

/** Enum fechado — espelha o CHECK da migration 20261004150000 + Fase 3. */
export type WebhookAction =
  | "auth_failed"
  | "invalid_payload"
  | "validation_failed"
  | "contacts_update_invalid"
  | "demand_dedup"
  | "demand_created"
  | "demand_reopened"
  | "internal_error"
  | "account_gated"; // ← Fase 3: gate de trial/grace/suspended

export type WebhookOutcome = "success" | "rejected" | "error";

/**
 * Campos binários/grandes que o redactor substitui por placeholder.
 * Lista unificada com a do ingest (BINARY_LOG_FIELDS) pra consistência
 * entre `[EVOLUTION PAYLOAD CRU]` no console e o log persistente.
 */
const BINARY_FIELDS = new Set([
  "jpegThumbnail",
  "mediaKey",
  "fileSha256",
  "fileEncSha256",
  "midQualityFileSha256",
  "scansSidecar",
  "scanLengths",
  "messageSecret",
  "paddingBytes",
  "thumbnailSha256",
  "thumbnailEncSha256",
  "url", // URL direta da Evolution (pode ser pré-assinada)
]);

/**
 * Redactor pra gravação persistente: remove mídias/binários e URL assinada,
 * preserva estrutura (event, instance, key, pushName, text) pra debug.
 * Distinto do redactForLog do console (que é string), este retorna objeto
 * serializável pra gravar como jsonb.
 */
export function redactForLogPayload(payload: unknown): Record<string, unknown> {
  if (!payload || typeof payload !== "object") return {};
  const walk = (node: any): any => {
    if (node === null || typeof node !== "object") return node;
    if (Array.isArray(node)) return node.map(walk);
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(node)) {
      if (BINARY_FIELDS.has(k)) {
        out[k] = "<binário omitido>";
      } else if (typeof v === "object" && v !== null) {
        out[k] = walk(v);
      } else {
        out[k] = v;
      }
    }
    return out;
  };
  return walk(payload);
}

/**
 * Grava uma linha em webhook_delivery_logs.
 *
 * - Fire-and-forget: não await no caller, try/catch silencioso
 * - Nunca derruba a requisição do ingest
 * - Payload já deve estar redacted (helper aplica walk de segurança)
 */
export async function recordWebhookDelivery(entry: {
  tokenId: string | null;
  orgId: string | null;
  outcome: WebhookOutcome;
  action: WebhookAction;
  status?: number;
  latencyMs?: number;
  error?: string;
  demandaId?: string | null;
  protocol?: string | null;
  payload?: unknown;
}): Promise<void> {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("webhook_delivery_logs").insert({
      token_id: entry.tokenId ?? null,
      org_id: entry.orgId ?? null,
      outcome: entry.outcome,
      action: entry.action,
      status: entry.status ?? null,
      latency_ms: entry.latencyMs ?? null,
      error: entry.error ?? null,
      demanda_id: entry.demandaId ?? null,
      protocol: entry.protocol ?? null,
      payload: redactForLogPayload(entry.payload) as never,
    });
    if (error) {
      console.error("[webhook-log] falha ao gravar", {
        action: entry.action,
        error: error.message,
      });
    }
  } catch (e) {
    // Helper nunca propaga: log de falha não pode quebrar o ingest
    console.error("[webhook-log] exceção ao gravar", {
      action: entry.action,
      error: String((e as Error)?.message ?? e),
    });
  }
}