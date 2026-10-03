/**
 * Store module-scope da tela de Logs de Webhook (diretriz v2.1 + v2.2):
 * - Sobrevive a unmount/remount (navegar entre abas do portal): voltar
 *   mostra EXATAMENTE o que o usuário deixou, com ZERO request.
 * - F5 / nova sessão zera tudo (comportamento esperado e desejado).
 * - Única fonte de verdade: o componente lê/escreve via commit().
 * - Nenhuma query TanStack nesta tela: fetch imperativo só em clique
 *   (ciclo de vida automático de query é fonte de fetch fantasma).
 */
export interface WebhookPageUi {
  filtersLoaded: boolean;
  options: { orgs: any[]; tokens: any[] } | null;
  optionsError: string | null;
  orgId: string;
  tokenId: string;
  outcome: string;
  applied: { orgId: string; tokenId: string; outcome: string };
  loadedOnce: boolean;
  rows: any[];
  total: number;
  logsError: string | null;
  stats: { total: number; byOutcome: Record<string, number> } | null;
  statsError: string | null;
  detailById: Record<string, any>;
  detailError: string | null;
}

export const pageUi: WebhookPageUi = {
  filtersLoaded: false,
  options: null,
  optionsError: null,
  orgId: "",
  tokenId: "",
  outcome: "",
  applied: { orgId: "", tokenId: "", outcome: "" },
  loadedOnce: false,
  rows: [],
  total: 0,
  logsError: null,
  stats: null,
  statsError: null,
  detailById: {},
  detailError: null,
};