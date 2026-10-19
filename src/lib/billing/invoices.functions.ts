/**
 * Fase 4.8 — Server Functions de Faturas (Invoices).
 * 
 * Endpoint protegido para o frontend buscar histórico de faturas de uma organização.
 * 
 * Características:
 * • Gate de membership (apenas membros da org podem acessar).
 * • Memo in-memory por orgId com TTL de 60 segundos (mesmo padrão de account-access.ts).
 * • Query ordenada por paid_at DESC, limite 50 registros.
 * • Tipagem estrita exportada para uso no frontend.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface Invoice {
  id: string;
  mp_payment_id: string;
  amount_cents: number;
  currency: string;
  status: string;
  paid_at: string | null;
  period_start: string | null;
  period_end: string | null;
}

const invoicesMemo = new Map<string, { at: number; value: Invoice[] }>();
const INVOICES_MEMO_TTL = 60_000; // 60 segundos

const GetOrgInvoicesSchema = z.object({
  orgId: z.string().uuid(),
});

export const getOrgInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => GetOrgInvoicesSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { orgId } = data;
    const userId = context.userId!;

    // Gate de membership: verificar se o usuário pertence à organização
    const { data: membership, error: membershipErr } = await supabaseAdmin
      .from("memberships")
      .select("id")
      .eq("org_id", orgId)
      .eq("user_id", userId)
      .maybeSingle();

    if (membershipErr) {
      throw new Error(`Falha ao validar acesso: ${membershipErr.message}`);
    }

    if (!membership) {
      throw new Error("Sem acesso a esta organização.");
    }

    // Memo in-memory por orgId (TTL 60s)
    const hit = invoicesMemo.get(orgId);
    if (hit && Date.now() - hit.at < INVOICES_MEMO_TTL) {
      return hit.value;
    }

    // Query no banco: filtrar por org_id, ordenar por paid_at DESC, limite 50
    const { data: invoices, error } = await supabaseAdmin
      .from("invoices")
      .select(
        "id, mp_payment_id, amount_cents, currency, status, paid_at, period_start, period_end",
      )
      .eq("org_id", orgId)
      .order("paid_at", { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(`invoices_query_error: ${error.message}`);
    }

    const value: Invoice[] = (invoices ?? []).map((inv) => ({
      id: inv.id,
      mp_payment_id: inv.mp_payment_id,
      amount_cents: inv.amount_cents,
      currency: inv.currency,
      status: inv.status,
      paid_at: inv.paid_at,
      period_start: inv.period_start,
      period_end: inv.period_end,
    }));

    // Atualizar memo
    invoicesMemo.set(orgId, { at: Date.now(), value });

    return value;
  });
