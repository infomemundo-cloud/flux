/**
 * Fase 4.4 — Client HTTP do Mercado Pago (pull de recursos).
 *
 * D15: MP = fonte da verdade do PAGAMENTO. O processador SEMPRE puxa o recurso
 * completo via API ANTES de transicionar (D17) — o webhook é só o gatilho.
 * Seleção de token por live_mode (decisão 2026-10-08): false → TEST, true → PROD.
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
