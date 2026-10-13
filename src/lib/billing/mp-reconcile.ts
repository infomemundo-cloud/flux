/**
 * Fase 4.5/4.6 — Reconciliação síncrona do checkout MP.
 * Função PURA branchada pelos 4 ramos de status da D17:
 * authorized → active (+period_start/end)
 * paused     → grace_period
 * cancelled  → canceled_by_user (se flag setado) senão canceled_by_dunning
 * pending    → null (retry/no-op)
 *
 * STATUS ATUAL (2026-10-12): helper de consistência/teste da transição D17.
 * O processor usa applyPreapprovalTransition direto; o callback público foi
 * SIMPLIFICADO para redirect puro (confirmação MP: back_url não é server-to-server),
 * portanto não consome mais reconcileCheckout. Esta função permanece como
 * referência testável da máquina de estados e como reserva caso um futuro
 * mecanismo síncrono de reconciliação seja introduzido.
 *
 * Decisão C4 (DRY): delega para applyPreapprovalTransition exportada de
 * mp-processor.ts — garante consistência absoluta entre caminhos.
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
 * 
 * IMPORTANTE: esta função é PURA — não faz I/O, não acessa banco, não chama API.
 * O caller responsável por resolver pull + flag + persistir o patch.
 */
export function reconcileCheckout(
  input: ReconcileInput,
): ReconcileResult {
  const { pull, cancelRequestedByUser } = input;

  // CORREÇÃO 2026-10-12: passar pull (objeto) em vez de pull.status (string)
  // A assinatura de applyPreapprovalTransition é (pull: PreapprovalPull, cancelRequestedByUser: boolean)
  const patch = applyPreapprovalTransition(pull, cancelRequestedByUser);

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
