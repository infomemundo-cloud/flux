/**
 * Fase 4.4 — Client HTTP do Mercado Pago (pull de recursos).
 * D15: MP = fonte da verdade do PAGAMENTO. O processador SEMPRE puxa o recurso
 * completo via API ANTES de transicionar (D17) — o webhook é só o gatilho.
 * Seleção de token por live_mode (decisão 2026-10-08): false → TEST, true → PROD.
 *
 * Fase 4.7 Item 1 — Base da troca de tier:
 * • createPreapprovalForSwitch usa o modelo "assinatura sem plano associado /
 *   pagamento pendente" (POST /preapproval sem preapproval_plan_id).
 * • Payload canônico confirmado pela doc oficial + suporte MP (2026-10-18):
 *     - payer_email NA RAIZ (não existe objeto payer nesse endpoint);
 *     - status: "pending" → MP devolve init_point de checkout hosted (mesma
 *       experiência da primeira compra: usuário aprova o cartão no navegador,
 *       sem tokenização server-side);
 *     - auto_recurring com end_date;
 *     - external_reference = switch:<transition_id> preservado no recurso,
 *       lido pelo processor via GET /preapproval/{id} (pull D17).
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
 *
 * Confirmado pela doc/suporte MP: external_reference fica associado ao recurso
 * e é lido pelo processor via GET /preapproval/{id} (pull D17), não dependendo
 * do webhook ecoar o campo.
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
  /** E-mail do pagador (raiz, snake_case no body). Deve bater com o checkout. */
  payerEmail: string;
}

export interface CreatePreapprovalForSwitchResult {
  id: string;
  initPoint: string;
  status?: string;
  raw: PreapprovalCreateResponse;
}

/**
 * Cria um preapproval no Mercado Pago especificamente para troca de tier,
 * no modelo "assinatura sem plano associado / pagamento pendente".
 *
 * PAYLOAD CANÔNICO (doc oficial pending-payments + suporte MP, 2026-10-18):
 * {
 *   "reason": "Troca de plano",
 *   "external_reference": "switch:<transition_id>",
 *   "payer_email": "usuario@exemplo.com",   // ← RAIZ, snake_case
 *   "status": "pending",                     // ← checkout hosted via init_point
 *   "auto_recurring": {
 *     "frequency": 1,
 *     "frequency_type": "months",
 *     "transaction_amount": 197,
 *     "currency_id": "BRL",
 *     "end_date": "<ISO>"
 *   },
 *   "back_url": "..."
 * }
 *
 * IMPORTANTE:
 * - NÃO usa preapproval_plan_id (com plan_id o MP tenta autorização imediata
 *   e exige card_token_id → 400).
 * - O preço vem do TIER_CONTRACTS (fonte central), não do plano MP.
 * - O MP devolve init_point de checkout hosted: o usuário aprova o cartão no
 *   navegador, igual à primeira compra. Nenhuma tokenização server-side.
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

  // Data final da recorrência: now + 5 anos. Generoso o bastante para não
  // limitar uma assinatura SaaS real; extensível via PUT /preapproval/{id}.
  const endDate = new Date();
  endDate.setFullYear(endDate.getFullYear() + 5);

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
      end_date: endDate.toISOString(),
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
