/**
 * Fase 4.6 Item 4 — Reconciliação Reversa em Massa (Consistência Final).
 * 
 * PROPÓSITO: Varredura proativa diária comparando preapprovals vivos no MP
 * com o estado local no DB. Corrige "fantasmas" onde webhooks falharam.
 * 
 * ARQUITETURA ISOLADA (§5 + Regra DT-XX):
 * • Sufixo .server.ts garante isolamento total do bundle client-side.
 * • Reutiliza applyPreapprovalTransition e resolveOrgForPreapproval do mp-processor
 *   para garantir consistência absoluta de lógica de transição de estado.
 * • Nunca importado por componentes React ou server functions compartilhadas.
 * 
 * FLUXO:
 * 1. Puxa página de preapprovals autorizados no MP (GET /preapproval/search).
 * 2. Para cada resultado, compara com subscriptions local via mp_preapproval_id.
 * 3. Se divergir ou faltar → aplica patch usando lógica pura existente.
 * 4. Retorna tally { scanned, corrected, created, errors } para auditoria.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  applyPreapprovalTransition,
  resolveOrgForPreapproval,
  type SubscriptionPatch,
} from "./mp-processor";
import { mpTokenFor, MpApiError, type PreapprovalPull } from "./mp-api";

// ============================================================================
// TIPOS LOCAIS
// ============================================================================

interface ReconcileTally {
  scanned: number;
  corrected: number;
  created: number;
  errors: number;
}

interface MpSearchResponse {
  paging: { total: number; offset: number; limit: number };
  results: PreapprovalPull[];
}

// ============================================================================
// HELPER: Busca Paginada no MP
// ============================================================================

async function fetchPreapprovalsPage(
  offset: number,
  limit: number,
  liveMode: boolean,
): Promise<MpSearchResponse> {
  const token = mpTokenFor(liveMode);
  if (!token) throw new Error("missing_mp_token_for_reconcile");

  const url = new URL("https://api.mercadopago.com/preapproval/search");
  url.searchParams.set("status", "authorized"); // Apenas ativos/autorizados
  url.searchParams.set("offset", String(offset));
  url.searchParams.set("limit", String(limit));

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new MpApiError(res.status, `mp_search_preapprovals_${res.status}`);
  }

  return (await res.json()) as MpSearchResponse;
}

// ============================================================================
// FUNÇÃO PRINCIPAL: Reconciliação em Massa
// ============================================================================

export async function reconcilePreapprovalsBatch(): Promise<ReconcileTally> {
  const tally: ReconcileTally = { scanned: 0, corrected: 0, created: 0, errors: 0 };
  
  // Configuração conservadora para plano Hobby (timeout ~10s)
  const PAGE_LIMIT = 50;
  let offset = 0;
  let hasMore = true;

  // Mapeamento anti-drift de plan_id -> tier_code (espelho do mp-processor)
  const PLAN_ID_TO_TIER: Record<string, string> = {
    "2ae043b092704c96b1e67b4238295c43": "operacao",
    "67b0eca317cc4e00a03ba0654bd7ff64": "crescimento",
    "5899e7efc405436995ef18cfea544747": "escala",
  };

  try {
    while (hasMore) {
      // 1. Puxar página do MP (começa com TEST, fallback PROD se necessário futuramente)
      const response = await fetchPreapprovalsPage(offset, PAGE_LIMIT, false);
      const preapprovals = response.results || [];

      if (preapprovals.length === 0) {
        hasMore = false;
        break;
      }

      tally.scanned += preapprovals.length;

      // 2. Buscar todos os IDs desta página no DB local em uma única query (eficiência)
     const mpIds = preapprovals.map((p) => p.id);
     const { data: localSubs, error: dbErr } = await supabaseAdmin
       .from("subscriptions")
       .select("id, org_id, plan_code, state, cancel_requested_by_user, mp_preapproval_id, current_period_start, current_period_end") // 👈 CORRIGIDO
       .in("mp_preapproval_id", mpIds);

      if (dbErr) {
        console.error("[mp-reconcile-batch] db_fetch_error", dbErr.message);
        tally.errors += preapprovals.length;
        offset += PAGE_LIMIT;
        continue;
      }

      // Mapa rápido para lookup O(1)
      const localMap = new Map(
        (localSubs || []).map((s) => [s.mp_preapproval_id, s])
      );

      // 3. Processar cada preapproval individualmente
      for (const pull of preapprovals) {
        try {
          const existing = localMap.get(pull.id);
          
          // Decidir patch usando lógica pura compartilhada (DRY §C4)
          const patch = applyPreapprovalTransition(
            pull,
            Boolean(existing?.cancel_requested_by_user)
          );

          if (!patch) {
            // Status transitório/desconhecido — não inventa estado
            continue;
          }

          if (existing) {
            // --- CASO A: Existe no DB, verificar divergência ---
            const needsUpdate =
              existing.state !== patch.state ||
              (patch.current_period_start && existing.current_period_start !== patch.current_period_start) ||
              (patch.current_period_end && existing.current_period_end !== patch.current_period_end);

            if (needsUpdate) {
              const updatePayload: Record<string, unknown> = { state: patch.state };
              if (patch.current_period_start !== undefined)
                updatePayload.current_period_start = patch.current_period_start;
              if (patch.current_period_end !== undefined)
                updatePayload.current_period_end = patch.current_period_end;

              const { error: updErr } = await supabaseAdmin
                .from("subscriptions")
                .update(updatePayload as never)
                .eq("id", existing.id);

              if (updErr) {
                console.error("[mp-reconcile-batch] sub_update_failed", {
                  mpId: pull.id,
                  error: updErr.message,
                });
                tally.errors++;
              } else {
                console.log("[mp-reconcile-batch] sub_corrected", {
                  mpId: pull.id,
                  oldState: existing.state,
                  newState: patch.state,
                });
                tally.corrected++;
              }
            }
          } else {
            // --- CASO B: Não existe no DB (Fantasma Recuperado) ---
            // Resolver org_id via external_reference ou intent histórico
            const resolved = await resolveOrgForPreapproval(pull);
            
            if (!resolved.orgId) {
              console.warn("[mp-reconcile-batch] orphan_preapproval_no_org", {
                mpId: pull.id,
                externalRef: pull.external_reference,
              });
              tally.errors++;
              continue;
            }

            const planCode =
              PLAN_ID_TO_TIER[String(pull.preapproval_plan_id ?? "")] ?? null;

            if (!planCode) {
              console.warn("[mp-reconcile-batch] orphan_preapproval_no_plan", {
                mpId: pull.id,
                planId: pull.preapproval_plan_id,
              });
              tally.errors++;
              continue;
            }

            const { error: insErr } = await supabaseAdmin
              .from("subscriptions")
              .insert({
                org_id: resolved.orgId,
                plan_code: planCode,
                state: patch.state,
                mp_preapproval_id: pull.id,
                current_period_start: patch.current_period_start ?? null,
                current_period_end: patch.current_period_end ?? null,
                cancel_requested_by_user: false,
              } as never);

            if (insErr) {
              console.error("[mp-reconcile-batch] sub_create_failed", {
                mpId: pull.id,
                error: insErr.message,
              });
              tally.errors++;
            } else {
              console.log("[mp-reconcile-batch] ghost_recovered_created", {
                mpId: pull.id,
                orgId: resolved.orgId,
                state: patch.state,
                source: resolved.source,
              });
              tally.created++;
            }
          }
        } catch (itemErr) {
          console.error("[mp-reconcile-batch] item_processing_error", {
            mpId: pull.id,
            error: itemErr instanceof Error ? itemErr.message : String(itemErr),
          });
          tally.errors++;
        }
      }

      // Avançar paginação
      offset += PAGE_LIMIT;
      if (offset >= response.paging.total) {
        hasMore = false;
      }
    }
  } catch (globalErr) {
    console.error("[mp-reconcile-batch] global_failure", {
      error: globalErr instanceof Error ? globalErr.message : String(globalErr),
    });
    throw globalErr; // Propaga para o caller registrar falha crítica
  }

  return tally;
}
