/**
 * Fase 4.4 — Client HTTP do Mercado Pago (pull de recursos).
 * D15: MP = fonte da verdade do PAGAMENTO. O processador SEMPRE puxa o recurso
 * completo via API ANTES de transicionar (D17) — o webhook é só o gatilho.
 * Seleção de token por live_mode (decisão 2026-10-08): false → TEST, true → PROD.
 *
 * Fase 4.7 Item 1 — Base da troca de tier:
 * • createPreapprovalForSwitch usa auto_recurring (NÃO preapproval_plan_id),
 *   porque o POST /preapproval com plan_id exige card_token_id (autorização direta).
 * • Com auto_recurring, o MP exige payer.email. Este helper envia payer.email.
 * • O MP retorna init_point de checkout e preserva external_reference = switch:<transition_id>.
 * • cancelPreapproval para o cancelamento legado pós-troca.
 * • getPreapproval original intacto.
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
  /** Valor em unidade monetária (ex.: 197 para R$197,00). Não em centavos. */
  transactionAmount: number;
  currencyId?: string;
  frequency?: number;
  frequencyType?: string;
  externalReference: string;
  liveMode: boolean;
  reason?: string;
  backUrl?: string;
  payerEmail: string;
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
 * IMPORTANTE (correção 2026-10-18):
 * - NÃO usa preapproval_plan_id. Com plan_id o MP tenta autorização imediata
 *   e exige card_token_id (que não temos server-side) → 400.
 * - Usa auto_recurring + payer.email. Esse é o caminho que retorna init_point
 *   de checkout hosted e preserva external_reference.
 * - O preço vem do TIER_CONTRACTS (fonte central), não do plano MP.
 * - Este helper NÃO cancela a assinatura antiga.
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

  const payerEmail =
    typeof input.payerEmail === "string" ? input.payerEmail.trim() : "";

  if (!payerEmail || !payerEmail.includes("@")) {
    throw new MpApiError(0, "payer_email_required", {
      payerEmail: null,
    });
  }

  const externalReference =
    typeof input.externalReference === "string"
      ? input.externalReference.trim()
      : "";

  if (!externalReference) {
    throw new MpApiError(0, "external_reference_required", {
      externalReference: null,
    });
  }

  if (
    typeof input.transactionAmount !== "number" ||
    !Number.isFinite(input.transactionAmount) ||
    input.transactionAmount <= 0
  ) {
    throw new MpApiError(0, "invalid_transaction_amount", {
      transactionAmount: input.transactionAmount,
    });
  }

  const body: Record<string, unknown> = {
    reason: input.reason ?? "Troca de plano",
    external_reference: externalReference,
    payer: {
      email: payerEmail,
    },
    auto_recurring: {
      frequency: input.frequency ?? 1,
      frequency_type: input.frequencyType ?? "months",
      transaction_amount: input.transactionAmount,
      currency_id: input.currencyId ?? "BRL",
    },
  };

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
 * Regra de segurança:
 * - 404 é tratado como ok/idempotente;
 * - demais erros propagam MpApiError para retry controlado.
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
