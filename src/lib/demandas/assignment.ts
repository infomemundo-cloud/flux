import type { SupabaseClient } from "@supabase/supabase-js";
import type { AssignmentMode } from "./assignment-options";

interface AssignParams {
  orgId: string;
  demandaId: string;
}

/**
 * Resolve a atribuição automática de uma demanda recém-criada.
 *
 * Lógica:
 * 1. Lê `auto_assign_enabled`, `auto_assign_mode`, `last_assigned_user_id` da org;
 * 2. `enabled = false` → retorna `null` (zero writes);
 * 3. Pool: `memberships` onde `role = 'operador'` → ordena por `user_id` (ordem estável);
 * 4. Pool vazio → retorna `null` (demanda órfã, sem erro) + warn discreto;
 * 5. round_robin: índice de `last_assigned_user_id` no pool + 1, com wrap-around;
 *    se o pointer não estiver mais no pool (operador removido), recomeça do índice 0;
 * 6. least_busy: `group by assignee_id` em demandas abertas (`state <> 'concluido'`)
 *    restrito ao pool; menor contagem vence; operadores sem demandas = 0;
 *    empate → menor `user_id` (determinismo auditável);
 * 7. `UPDATE demandas SET assignee_id = X WHERE id = demandaId AND assignee_id IS NULL`
 *    (guard: só recém-criadas sem dono — não sobrescreve atribuição manual);
 * 8. Se round-robin: atualiza o pointer com guard de concorrência (UPDATE com
 *    RETURNING; array vazio = race → 1 retry relendo o pointer);
 * 9. Insere evento `kind = 'assigned'` com `actor_id = null`, `to_value = X`,
 *    `metadata = { auto: true }` E `org_id` (tabela multi-tenant) → histórico
 *    renderiza "Atribuída a X" via `systemLineFor` sem mexer em UI;
 * 10. Retorna `X`.
 *
 * Demanda órfã (pool vazio ou `enabled = false`): retorna `null`, demanda
 * permanece sem `assignee_id`, e gerente/owner/admin pode atribuir manualmente.
 */
export async function resolveAutoAssignment(
  admin: SupabaseClient,
  { orgId, demandaId }: AssignParams,
): Promise<string | null> {
  // 1) Lê regra da org
  const { data: org, error: orgError } = await admin
    .from("organizations")
    .select("auto_assign_enabled, auto_assign_mode, last_assigned_user_id")
    .eq("id", orgId)
    .maybeSingle();

  if (orgError || !org) {
    console.warn(`[assignment] Org ${orgId} não encontrada ou erro: ${orgError?.message}`);
    return null;
  }

  // 2) Toggle off → demanda órfã
  if (!org.auto_assign_enabled) {
    return null;
  }

  // 3) Pool: só operadores (decisão de produto D6)
  const { data: members, error: memError } = await admin
    .from("memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("role", "operador")
    .order("user_id");

  if (memError || !members || members.length === 0) {
    console.warn(`[assignment] Org ${orgId} sem operadores no pool — demanda ${demandaId} fica órfã`);
    return null;
  }

  const pool = members.map((m: any) => m.user_id as string).sort();

  // 4-6) Seleciona o operador conforme o modo
  const mode = org.auto_assign_mode as AssignmentMode;
  let selectedUserId: string;

  if (mode === "round_robin") {
    selectedUserId = await getNextRoundRobinUser(admin, orgId, pool, org.last_assigned_user_id);
  } else if (mode === "least_busy") {
    selectedUserId = await getLeastBusyUser(admin, orgId, pool);
  } else {
    console.warn(`[assignment] Modo inválido: ${mode} — fallback pro primeiro do pool`);
    selectedUserId = pool[0];
  }

  if (!selectedUserId) {
    console.warn(`[assignment] Nenhum usuário selecionado — demanda ${demandaId} fica órfã`);
    return null;
  }

  // 7) UPDATE com guard (só recém-criadas sem dono — D9)
  const { data: updated, error: updateError } = await admin
    .from("demandas")
    .update({ assignee_id: selectedUserId })
    .eq("id", demandaId)
    .is("assignee_id", null)
    .select("id")
    .maybeSingle();

  if (updateError) {
    console.error(`[assignment] Erro ao atribuir demanda ${demandaId}: ${updateError.message}`);
    return null;
  }

  if (!updated) {
    // Demanda já tem assignee (atribuição manual) → não sobrescreve (D9)
    return null;
  }

  // 9) Evento de sistema — org_id OBRIGATÓRIO (tabela multi-tenant;
  //    ingest e addComment sempre mandam; sem ele o insert falhava e o
  //    histórico nunca mostrava a atribuição automática).
  const { error: eventError } = await admin.from("demanda_events").insert({
    org_id: orgId,
    demanda_id: demandaId,
    kind: "assigned",
    actor_id: null,
    to_value: selectedUserId,
    metadata: { auto: true },
  });

  if (eventError) {
    console.error(`[assignment] Erro ao inserir evento de atribuição: ${eventError.message}`);
  }

  return selectedUserId;
}

/**
 * Round-robin: próximo do pool a partir do pointer. Se o pointer não
 * estiver mais no pool (operador removido), recomeça do índice 0.
 * Atualiza o pointer com guard de concorrência: UPDATE com RETURNING —
 * array vazio significa que outro webhook venceu a corrida → 1 retry.
 */
async function getNextRoundRobinUser(
  admin: SupabaseClient,
  orgId: string,
  pool: string[],
  lastAssignedUserId: string | null,
): Promise<string> {
  let pointer = lastAssignedUserId;

  // Se o pointer não está mais no pool (operador removido), recomeça do 0
  if (!pointer || !pool.includes(pointer)) {
    pointer = null;
  }

  const currentIndex = pointer ? pool.indexOf(pointer) : -1;
  const nextIndex = (currentIndex + 1) % pool.length;
  const selectedUserId = pool[nextIndex];

  // Guard: só atualiza o pointer se o valor atual for o esperado.
  // `.is()` só pra null; string usa `.eq()` (PostgREST).
  let guard = admin
    .from("organizations")
    .update({ last_assigned_user_id: selectedUserId })
    .eq("id", orgId);
  guard =
    pointer === null
      ? guard.is("last_assigned_user_id", null)
      : guard.eq("last_assigned_user_id", pointer);

  // UPDATE com select retorna as linhas afetadas (RETURNING): se o guard
  // não casou (race de dois webhooks), vem array vazio → count 0 → retry.
  const { data: updatedRows, error } = await guard.select("id");
  const count = updatedRows?.length ?? 0;

  if (error) {
    console.error(`[assignment] Erro ao atualizar pointer: ${error.message}`);
  } else if (count === 0) {
    // Race: outro webhook já atualizou o pointer → 1 retry relendo
    console.warn(`[assignment] Race condition detectada — retry`);
    const { data: retryOrg } = await admin
      .from("organizations")
      .select("last_assigned_user_id")
      .eq("id", orgId)
      .maybeSingle();

    const retryPointer = retryOrg?.last_assigned_user_id ?? null;
    const retryIndex =
      retryPointer && pool.includes(retryPointer) ? pool.indexOf(retryPointer) : -1;
    const retryNextIndex = (retryIndex + 1) % pool.length;
    const retrySelected = pool[retryNextIndex];

    const { error: retryError } = await admin
      .from("organizations")
      .update({ last_assigned_user_id: retrySelected })
      .eq("id", orgId);

    if (retryError) {
      console.error(`[assignment] Erro no retry: ${retryError.message}`);
    }

    return retrySelected;
  }

  return selectedUserId;
}

/**
 * Least-busy: operador com menos demandas abertas. Empate → menor user_id.
 * Demandas órfãs (`assignee_id IS NULL`) não contam pra ninguém.
 */
async function getLeastBusyUser(
  admin: SupabaseClient,
  orgId: string,
  pool: string[],
): Promise<string> {
  const { data: rows, error } = await admin
    .from("demandas")
    .select("assignee_id")
    .eq("org_id", orgId)
    .neq("state", "concluido")
    .not("assignee_id", "is", null)
    .in("assignee_id", pool);

  if (error) {
    console.error(`[assignment] Erro ao contar demandas por operador: ${error.message}`);
    return pool[0]; // fallback pro primeiro
  }

  const counts = new Map<string, number>();
  for (const userId of pool) {
    counts.set(userId, 0);
  }

  for (const r of rows ?? []) {
    const uid = r.assignee_id as string;
    if (counts.has(uid)) {
      counts.set(uid, (counts.get(uid) ?? 0) + 1);
    }
  }

  // Menor contagem; empate → menor user_id (ordenado alfabeticamente)
  let minCount = Infinity;
  let selectedUserId = pool[0];

  for (const userId of pool) {
    const count = counts.get(userId) ?? 0;
    if (count < minCount || (count === minCount && userId < selectedUserId)) {
      minCount = count;
      selectedUserId = userId;
    }
  }

  return selectedUserId;
}