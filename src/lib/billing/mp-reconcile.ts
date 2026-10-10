/**
 * Fase 4.5 — Reconciliação síncrona do checkout MP (back_url handler).
 *
 * Função PURA branchada pelos 4 ramos de status da D17:
 *   authorized → active (+period_start/end)
 *   paused     → grace_period
 *   cancelled  → canceled_by_user (se flag setado) senão canceled_by_dunning
 *   pending    → null (retry/no-op)
 *
 * Consumida por:
 *   1) Processor inline da 4.4 (via applyPreapprovalTransition reutilizada);
 *   2) Callback público da 4.5 (GET /preapproval/{id} → resolve org → upsert subscription).
 *
 * Decisão C4 (DRY): esta função NÃO reimplementa a lógica de transição — delega
 * para applyPreapprovalTransition exportada de mp-processor.ts. Isso garante
 * consistência absoluta entre webhook receiver e back_url handler.
 */
import {
  type PreapprovalPull,
} from "./mp-api";
import {
  applyPreapprovalTransition,
  type SubscriptionPatch,
} from "./mp-processor";

export interface ReconcileInput {
  /** Pull completo do preapproval vindo da API do MP (fonte da verdade). */
  pull: PreapprovalPull;
  /** Flag cancel_requested_by_user vindo da linha existente em subscriptions. */
  cancelRequestedByUser: boolean;
}

export interface ReconcileResult {
  /** Patch a ser persistido em subscriptions (null = não transicionar/retry). */
  patch: SubscriptionPatch | null;
  /** Motivo legível pra logs/debugging (ex: "authorized", "pending_retry"). */
  reason: string;
}

/**
 * Reconciliação síncrona: dado um pull do MP + flag local, decide qual estado
 * aplicar na subscription. Retorna null quando não deve transicionar ainda
 * (status transitório/pending/desconhecido), permitindo retry controlado.
 * IMPORTANTE: esta função é PURA — não faz I/O, não acessa banco, não chama API.
 * O caller responsável por resolver pull + flag + persistir o patch.
 */
export function reconcileCheckout(
  input: ReconcileInput,
): ReconcileResult {
  const { pull, cancelRequestedByUser } = input;
  
  // CORREÇÃO: passar pull.status (string) em vez de pull (objeto)
  // A assinatura de applyPreapprovalTransition mudou para (mpStatus: string, cancelRequestedByUser: boolean)
  const patch = applyPreapprovalTransition(
    String(pull.status ?? ""),
    cancelRequestedByUser
  );
  
  if (!patch) {
    return {
      patch: null,
      reason: `not_ready:${pull.status}`, // ex: "not_ready:pending"
    };
  }
  return {
    patch,
    reason: pull.status, // ex: "authorized", "paused", "cancelled"
  };
}

/**
 * Helper opcional pra UI/log: converte Reason em mensagem amigável.
 * Usado pelo success-state-view.tsx da rota privada final.
 */
export function humanizeReconcileReason(reason: string): string {
  switch (reason) {
    case "authorized":
      return "Assinatura ativada com sucesso.";
    case "paused":
      return "Pagamento suspenso temporariamente (período de carência).";
    case "cancelled":
      return "Assinatura cancelada.";
    default:
      if (reason.startsWith("not_ready:")) {
        const status = reason.split(":")[1] ?? "desconhecido";
        return `Aguardando confirmação do pagamento (status: ${status}). Tente novamente em instantes.`;
      }
      return `Estado inesperado: ${reason}`;
  }
}
