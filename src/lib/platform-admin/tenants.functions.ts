import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertPlatformAdmin } from "@/integrations/supabase/admin-middleware";
import { adminAction } from "@/lib/platform-admin.functions";
import { resolveAccountAccess } from "@/lib/billing/account-access";
import { z } from "zod";

/**
 * Fase 3.5 — gestão de tenants do portal platform_admin (DT-10).
 *
 * D8: leitura pra qualquer papel admin; escrita superadmin-only no MVP.
 * Matriz local no padrão dos ADMIN_ROLES/TIER_WRITE_ROLES; migra pra
 * ROLE_ACTIONS quando a Fase 4 criar ações de billing.
 *
 * DRY (§1): `effective_state` vem do MESMO `resolveAccountAccess` usado
 * pelo banner, ingest e sends — uma fonte única de verdade pra estados
 * de conta em toda a plataforma.
 */
const TENANT_WRITE_ROLES = ["superadmin"];

export type TenantRow = {
  id: string;
  name: string;
  slug: string;
  created_at: string;
  trial_ends_at: string | null;
  effective_state: "trial" | "grace" | "suspended" | "active";
  days_left: number | null;
  member_count: number;
  open_demands: number;
};

/** Memo server-side 60s: lista de tenants muda raro, leitura quente. */
const TENANTS_MEMO_TTL_MS = 60_000;
let tenantsMemo: { at: number; value: TenantRow[] } | null = null;

export const listTenants = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({}).parse(d))
  .handler(async ({ context }) => {
    await assertPlatformAdmin(context.userId);
    if (tenantsMemo && Date.now() - tenantsMemo.at < TENANTS_MEMO_TTL_MS) return tenantsMemo.value;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // 1) Orgs base
    const { data: orgs, error: orgsErr } = await supabaseAdmin
      .from("organizations")
      .select("id, name, slug, created_at, trial_ends_at")
      .order("created_at", { ascending: false });
    if (orgsErr) throw new Error(orgsErr.message);
    const orgList = (orgs ?? []) as {
      id: string;
      name: string;
      slug: string;
      created_at: string;
      trial_ends_at: string | null;
    }[];
    if (orgList.length === 0) return [];
    const ids = orgList.map((o) => o.id);

    // 2) Contagens em batch (zero N+1)
    const memberByOrg = new Map<string, number>();
    const demandByOrg = new Map<string, number>();
    // Re-faz as queries sem count, buscando só o campo de agrupamento,
    // e conta em memória. Mais barato que RPC e funciona pra ~milhares.
    const [{ data: memRows }, { data: demRows }] = await Promise.all([
      supabaseAdmin.from("memberships").select("org_id").in("org_id", ids),
      supabaseAdmin
        .from("demandas")
        .select("org_id")
        .in("org_id", ids)
        .neq("state", "concluido"),
    ]);
    for (const r of (memRows ?? []) as { org_id: string }[]) {
      memberByOrg.set(r.org_id, (memberByOrg.get(r.org_id) ?? 0) + 1);
    }
    for (const r of (demRows ?? []) as { org_id: string }[]) {
      demandByOrg.set(r.org_id, (demandByOrg.get(r.org_id) ?? 0) + 1);
    }

    // 3) Estado efetivo via MESMO helper do banner/ingest/sends (DRY).
    //    Chamadas em paralelo; memo interno do helper (60s/org) garante
    //    que ingest e admin compartilham a mesma leitura.
    const accessByOrg = new Map<string, Awaited<ReturnType<typeof resolveAccountAccess>>>();
    await Promise.all(
      orgList.map(async (o) => {
        try {
          accessByOrg.set(o.id, await resolveAccountAccess(supabaseAdmin, o.id));
        } catch (e) {
          // Fallback defensivo: se o helper falhar (org sem dados, p.ex.),
          // tratamos como active pra não quebrar a listagem.
          accessByOrg.set(o.id, {
            access_level: "full",
            effective_state: "active",
            days_left: null,
            trial_ends_at: null,
          });
        }
      }),
    );

    const value: TenantRow[] = orgList.map((o) => {
      const access = accessByOrg.get(o.id)!;
      return {
        id: o.id,
        name: o.name,
        slug: o.slug,
        created_at: o.created_at,
        trial_ends_at: o.trial_ends_at,
        effective_state: access.effective_state,
        days_left: access.days_left ?? null,
        member_count: memberByOrg.get(o.id) ?? 0,
        open_demands: demandByOrg.get(o.id) ?? 0,
      };
    });
    tenantsMemo = { at: Date.now(), value };
    return value;
  });

export const TenantActionSchema = z.enum([
  "extend_7d",
  "extend_30d",
  "reactivate",
  "grandfather",
  "suspend",
]);
export type TenantAction = z.infer<typeof TenantActionSchema>;

/**
 * Calcula o novo trial_ends_at a partir da ação escolhida.
 * grandfather = NULL (MK e similares, isentas de ciclo).
 * suspend = passado distante o suficiente pra cair em blocked (≥15d).
 * extend/reactivate = now() + delta.
 */
function computeNewTrial(
  action: TenantAction,
  current: string | null,
): string | null {
  const now = Date.now();
  const DAY = 24 * 60 * 60 * 1000;
  switch (action) {
    case "grandfather":
      return null;
    case "suspend":
      return new Date(now - 15 * DAY).toISOString();
    case "reactivate":
      return new Date(now + 7 * DAY).toISOString();
    case "extend_7d": {
      // Empilha sobre trial VIVO; expirada/suspensa ganha dias a partir de
      // HOJE (extend que parece no-op é defeito — caso real 2026-10-06:
      // extend_7d com from_state=suspended manteve a org suspensa).
      const base = Math.max(now, current ? new Date(current).getTime() : now);
      return new Date(base + 7 * DAY).toISOString();
    }
    case "extend_30d": {
      const base = Math.max(now, current ? new Date(current).getTime() : now);
      return new Date(base + 30 * DAY).toISOString();
    }
  }
}

const ACTION_LABEL: Record<TenantAction, string> = {
  extend_7d: "estendeu trial em +7d",
  extend_30d: "estendeu trial em +30d",
  reactivate: "reativou (trial +7d)",
  grandfather: "marcou como grandfather (NULL)",
  suspend: "suspendeu",
};

export const setTenantTrial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        orgId: z.string().uuid(),
        action: TenantActionSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const adminRole = await assertPlatformAdmin(context.userId);
    if (!TENANT_WRITE_ROLES.includes(adminRole))
      throw new Error("Apenas superadmin pode alterar o ciclo de vida do tenant.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Resolve estado atual ANTES de aplicar (pra gravar no metadata).
    const currentAccess = await resolveAccountAccess(supabaseAdmin, data.orgId);
    const { data: orgRow, error: fetchErr } = await supabaseAdmin
      .from("organizations")
      .select("trial_ends_at")
      .eq("id", data.orgId)
      .maybeSingle();
    if (fetchErr) throw new Error(fetchErr.message);
    if (!orgRow) throw new Error("Organização não encontrada.");
    const newTrial = computeNewTrial(data.action, orgRow.trial_ends_at);
    return adminAction({
      context: { userId: context.userId, adminRole },
      action: "trial_updated",
      targetType: "organization",
      targetId: data.orgId,
      metadata: {
        action: data.action,
        label: ACTION_LABEL[data.action],
        from_state: currentAccess.effective_state,
        from_trial_ends_at: orgRow.trial_ends_at,
        to_trial_ends_at: newTrial,
      },
      run: async () => {
        const { error } = await supabaseAdmin
          .from("organizations")
          .update({
            trial_ends_at: newTrial,
            // organizations TEM trigger trg_orgs_upd → updated_at automático
            // (dicionário do banco), não precisamos gravar na mão.
          } as never)
          .eq("id", data.orgId);
        if (error) throw new Error(error.message);
        tenantsMemo = null; // invalida memo: próxima listagem vê o estado novo
        return {
          ok: true,
          orgId: data.orgId,
          action: data.action,
          new_trial_ends_at: newTrial,
        };
      },
    });
  });
