/**
 * Fase 4.4 — Client HTTP do Mercado Pago (pull de recursos).
 * D15: MP = fonte da verdade do PAGAMENTO. O processador SEMPRE puxa o recurso
 * completo via API ANTES de transicionar (D17) — o webhook é só o gatilho.
 * Seleção de token por live_mode (decisão 2026-10-08): false → TEST, true → PROD.
 *
 * Fase 4.7 Item 1 — Base da troca de tier:
 * • createPreapprovalForSwitch usa o modelo "assinatura sem plano associado /
 *   pagamento pendente" (POST /preapproval sem preapproval_plan_id).
 * • Payload canônico confirmado pelo suporte MP (2026-10-18):
 *     - payer_email NA RAIZ (não existe objeto payer nesse endpoint);
 *     - status: "pending" (checkout hosted via init_point);
 *     - auto_recurring com end_date;
 *     - external_reference preservado no recurso (lido pelo processor via pull).
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
  public status: number;
  public body: unknown;

  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "MpApiError";
    this.status = status;
    this.body = body;
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

function defaultAutoRecurringEndDate(): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 5);
  return d.toISOString();
}

export interface CreatePreapprovalForSwitchInput {
  transactionAmount: number;
  currencyId?: string;
  frequency?: number;
  frequencyType?: string;
  externalReference: string;
  liveMode: boolean;
  reason?: string;
  backUrl?: string;
  payerEmail: string;
  autoRecurringEndDate?: string;
}

export interface CreatePreapprovalForSwitchResult {
  id: string;
  initPoint: string;
  status?: string;
  raw: PreapprovalCreateResponse;
}

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
    throw new MpApiError(0, "payer_email_required", { payerEmail: null });
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

  const endDate =
    typeof input.autoRecurringEndDate === "string" &&
    input.autoRecurringEndDate.trim()
      ? input.autoRecurringEndDate.trim()
      : defaultAutoRecurringEndDate();

  const body: Record<string, unknown> = {
    reason: input.reason ?? "Troca de plano",
    external_reference: externalReference,
    payer_email: payerEmail,
    status: "pending",
    auto_recurring: {
      frequency: input.frequency ?? 1,
      frequency_type: input.frequencyType ?? "months",
      transaction_amount: input.transactionAmount,
      currency_id: input.currencyId ?? "BRL",
      end_date: endDate,
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
