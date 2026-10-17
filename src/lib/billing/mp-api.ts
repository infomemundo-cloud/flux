/**
 * Fase 4.4 — Client HTTP do Mercado Pago (pull de recursos).
 * D15: MP = fonte da verdade do PAGAMENTO. O processador SEMPRE puxa o recurso
 * completo via API ANTES de transicionar (D17) — o webhook é só o gatilho.
 * Seleção de token por live_mode (decisão 2026-10-08): false → TEST, true → PROD.
 *
 * Fase 4.7 Item 1 — Base da troca de tier:
 * • adiciona helper para criar preapproval de troca com external_reference identificável;
 * • adiciona helper para cancelar preapproval no MP;
 * • mantém getPreapproval original intacto.
 */

const MP_BASE = "https://api.mercadopago.com";

export function mpTokenFor(liveMode: boolean): string | undefined {
  const specific = liveMode
    ? process.env.MP_ACCESS_TOKEN_PROD
    : process.env.MP_ACCESS_TOKEN_TEST;

  return specific ?? process.env.MP_ACCESS_TOKEN;
}

export interface PreapprovalPull {
  id: string;
  status: "authorized" | "paused" | "cancelled" | "pending" | string;
  external_reference?: string;
  preapproval_plan_id?: string;
  reason?: string;
  date_created?: string;
  last_modified?: string;
  next_payment_date?: string;
  [key: string]: unknown;
}

export interface PreapprovalCreateResponse extends PreapprovalPull {
  init_point?: string;
  sandbox_init_point?: string;
}

export class MpApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public body?: unknown,
  ) {
    super(message);
    this.name = "MpApiError";
  }
}

export async function getPreapproval(
  id: string,
  liveMode: boolean,
): Promise<PreapprovalPull> {
  const token = mpTokenFor(liveMode);

  if (!token) {
    throw new MpApiError(0, `missing_token:${liveMode ? "prod" : "test"}`);
  }

  const res = await fetch(
    `${MP_BASE}/preapproval/${encodeURIComponent(id)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    },
  );

  const body = await res.json().catch(() => undefined);

  if (!res.ok) {
    throw new MpApiError(res.status, `mp_get_preapproval_${res.status}`, body);
  }

  return body as PreapprovalPull;
}

// ============================================================================
// FASE 4.7 ITEM 1 — HELPERS DE TROCA DE TIER
// ============================================================================

/**
 * Prefixo usado para identificar que um preapproval pertence a uma troca de tier.
 *
 * Formato:
 *   switch:<transition_id>
 *
 * Isso permite que o processor distinga:
 *   - compra normal;
 *   - evento da assinatura antiga;
 *   - novo preapproval criado exclusivamente para troca.
 */
export const TIER_SWITCH_EXTERNAL_PREFIX = "switch:";

export function buildTierSwitchExternalReference(
  transitionId: string,
): string {
  return `${TIER_SWITCH_EXTERNAL_PREFIX}${transitionId}`;
}

export function parseTierSwitchExternalReference(
  value?: string | null,
): string | null {
  if (!value) return null;

  const trimmed = String(value).trim();

  if (!trimmed.startsWith(TIER_SWITCH_EXTERNAL_PREFIX)) {
    return null;
  }

  const transitionId = trimmed.slice(TIER_SWITCH_EXTERNAL_PREFIX.length).trim();

  return transitionId.length > 0 ? transitionId : null;
}

export interface CreatePreapprovalForSwitchInput {
  planId: string;
  externalReference: string;
  liveMode: boolean;
  reason?: string;
  backUrl?: string;
}

export interface CreatePreapprovalForSwitchResult {
  id: string;
  initPoint: string;
  status?: string;
  raw: PreapprovalCreateResponse;
}

/**
 * Cria um preapproval no Mercado Pago especificamente para troca de tier.
 *
 * Importante:
 * - este helper NÃO cancela a assinatura antiga;
 * - ele apenas cria o novo checkout/preapproval identificado por external_reference;
 * - a troca efetiva no banco acontecerá depois, via billing_complete_tier_switch().
 */
export async function createPreapprovalForSwitch(
  input: CreatePreapprovalForSwitchInput,
): Promise<CreatePreapprovalForSwitchResult> {
  const token = mpTokenFor(input.liveMode);

  if (!token) {
    throw new MpApiError(
      0,
      `missing_token:${input.liveMode ? "prod" : "test"}`,
    );
  }

  const body: Record<string, unknown> = {
    preapproval_plan_id: input.planId,
    external_reference: input.externalReference,
  };

  if (input.reason) {
    body.reason = input.reason;
  }

  if (input.backUrl) {
    body.back_url = input.backUrl;
  }

  const res = await fetch(`${MP_BASE}/preapproval`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const responseBody = await res.json().catch(() => undefined);

  if (!res.ok) {
    throw new MpApiError(
      res.status,
      `mp_create_preapproval_${res.status}`,
      responseBody,
    );
  }

  const payload = responseBody as {
    id?: unknown;
    init_point?: unknown;
    sandbox_init_point?: unknown;
    status?: unknown;
  };

  const id = String(payload.id ?? "").trim();
  const initPoint = String(
    payload.init_point ?? payload.sandbox_init_point ?? "",
  ).trim();

  const status =
    typeof payload.status === "string" ? payload.status : undefined;

  if (!id || !initPoint) {
    throw new MpApiError(
      0,
      "mp_create_preapproval_invalid_response",
      responseBody,
    );
  }

  return {
    id,
    initPoint,
    status,
    raw: responseBody as PreapprovalCreateResponse,
  };
}

export interface CancelPreapprovalInput {
  preapprovalId: string;
  liveMode: boolean;
}

export interface CancelPreapprovalResult {
  ok: boolean;
  status?: string;
  alreadyCancelled?: boolean;
  raw?: unknown;
}

/**
 * Cancela um preapproval no Mercado Pago.
 *
 * Usado futuramente pelo cron/reconciliação para cancelar o preapproval antigo
 * depois que a troca de tier já foi concluída atomicamente no banco.
 *
 * Regra de segurança:
 * - 404 é tratado como ok/idempotente, porque se o recurso não existe mais,
 *   não há cobrança futura associada;
 * - demais erros propagam MpApiError para retry/controlado.
 */
export async function cancelPreapproval(
  input: CancelPreapprovalInput,
): Promise<CancelPreapprovalResult> {
  const token = mpTokenFor(input.liveMode);

  if (!token) {
    throw new MpApiError(
      0,
      `missing_token:${input.liveMode ? "prod" : "test"}`,
    );
  }

  const res = await fetch(
    `${MP_BASE}/preapproval/${encodeURIComponent(input.preapprovalId)}`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "cancelled" }),
    },
  );

  const body = await res.json().catch(() => undefined);

  if (res.ok) {
    const payload = body as { status?: unknown };

    return {
      ok: true,
      status: typeof payload.status === "string" ? payload.status : undefined,
      raw: body,
    };
  }

  if (res.status === 404) {
    return {
      ok: true,
      status: "cancelled",
      alreadyCancelled: true,
      raw: body,
    };
  }

  throw new MpApiError(
    res.status,
    `mp_cancel_preapproval_${res.status}`,
    body,
  );
}
