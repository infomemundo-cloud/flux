import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPlatformAdmin } from "@/integrations/supabase/admin-middleware";
import { adminAction } from "@/lib/platform-admin.functions";
import { z } from "zod";

/**
 * Fase 3.4 — catálogo de tiers do portal platform_admin (DT-10: nasce em
 * pasta de domínio).
 *
 * D8: leitura pra qualquer papel de admin; escrita superadmin-only no MVP.
 * Matriz local no padrão dos ADMIN_ROLES de whatsapp.functions.ts; migra
 * pra ROLE_ACTIONS quando a Fase 4 criar ações de billing.
 * DT-09: limits são armazenados/editáveis, mas NENHUM caminho aplica os
 * tetos ainda — enforcing entra junto com a cobrança (Fase 4+).
 */
const TIER_WRITE_ROLES = ["superadmin"];

export type TierRow = {
  code: string;
  name: string;
  position: number;
  price_cents: number;
  limits: { operators: number; messages_mes: number };
};

/** Memo server-side 60s (diretriz §2.4): catálogo muda raro, leitura quente. */
const TIERS_MEMO_TTL_MS = 60_000;
let tiersMemo: { at: number; value: TierRow[] } | null = null;

export const listTiers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.userId);
    if (tiersMemo && Date.now() - tiersMemo.at < TIERS_MEMO_TTL_MS) return tiersMemo.value;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("tiers")
      .select("code, name, position, price_cents, limits")
      .order("position", { ascending: true });
    if (error) throw new Error(error.message);
    const value = (data ?? []) as TierRow[];
    tiersMemo = { at: Date.now(), value };
    return value;
  });

const TierLimitsSchema = z.object({
  operators: z.number().int().min(1),
  messages_mes: z.number().int().min(1),
});

export const updateTier = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        code: z.string().min(1).max(40),
        name: z.string().trim().min(2).max(60),
        position: z.number().int().min(1).max(99),
        price_cents: z.number().int().min(0),
        limits: TierLimitsSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    if (!TIER_WRITE_ROLES.includes(adminRole))
      throw new Error("Apenas superadmin pode editar o catálogo de tiers.");
    return adminAction({
      context: { userId: context.userId, adminRole },
      action: "tier_updated",
      targetType: "tier",
      // admin_audit_log.target_id é uuid; tier é identificado por code →
      // a identidade vai no metadata (decisão registrada na Fase 3.4).
      targetId: null,
      metadata: { code: data.code },
      run: async () => {
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error } = await supabaseAdmin
          .from("tiers")
          .update({
            name: data.name,
            position: data.position,
            price_cents: data.price_cents,
            limits: data.limits as never, // jsonb: cast documentado (diretriz §7)
            // tiers NÃO tem trigger set_updated_at (dicionário do banco) →
            // gravamos na mão pra coluna continuar confiável.
            updated_at: new Date().toISOString(),
          } as never)
          .eq("code", data.code);
        if (error) throw new Error(error.message);
        tiersMemo = null; // invalida o memo: próxima leitura vê o catálogo novo
        return { ok: true, code: data.code };
      },
    });
  });
