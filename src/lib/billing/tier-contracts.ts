/**
 * Fase 4.7 Item 3 — Contrato Centralizado de Features por Tier.
 *
 * PROPÓSITO: Fonte única de verdade para FEATURES QUALITATIVAS e MARKETING
 * de cada plano. Consumido por:
 *   - account-access.ts (mescla com limits do banco para permissões efetivas)
 *   - Componentes UI (habilita/desabilita botões via hasFeature())
 *   - Validações backend qualitativas (impedir acesso indevido via API direta)
 *
 * ARQUITETURA DE DUAS FONTES (§5 Backend Authority):
 *
 *   1. LIMITES QUANTITATIVOS (operators, messages_mes):
 *      Fonte = BANCO (tiers.limits em runtime via resolveAccountAccess).
 *      Editável via portal admin (/platform_admin/tiers).
 *      Este arquivo NÃO é a fonte — os valores aqui são snapshots documentais
 *      e de fallback para UI/marketing.
 *
 *   2. FEATURES QUALITATIVAS (aiAgentEnabled, groupIngestEnabled, etc.):
 *      Fonte = ESTE ARQUIVO (constante, não editável via portal).
 *      Gates de funcionalidade usam hasFeature(tierCode, featureKey).
 *
 *   3. MARKETING/UI (displayName, priceCents, marketingHighlights):
 *      Fonte = ESTE ARQUIVO.
 *
 * REGRAS DE NEGÓCIO (pricing atual + DECISÃO D18):
 * • OPERADORES: Limites editáveis no banco (Free=2, Op=2, Cresc=6, Escala=15).
 * • MENSAGENS/MÊS: Limites editáveis no banco (Free=500, Op=1500, Cresc=10k, Escala=35k).
 * • CANAIS WHATSAPP: SEMPRE 1 POR ORG (D18). Cota de instância NÃO é cota de tier.
 * • DIFERENCIAIS REAIS: Upsell justifica-se por IA, Automação, Analytics e Suporte,
 *   não por multiplicidade de números de telefone.
 */

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface TierFeatures {
  code: string;
  displayName: string;
  priceCents: number;

  // --- LIMITES QUANTITATIVOS (snapshot documental — fonte real = banco) ---
  maxTeamMembers: number;        // Limite real de operadores (banco: operators)
  maxWhatsappChannels: number;   // SEMPRE 1 (Restrição Arquitetural D18)
  maxMessagesPerMonth: number;   // Limite de mensagens por período de cobrança (banco: messages_mes)

  // --- FEATURES QUALITATIVAS (GATES DE FUNCIONALIDADE) ---
  aiAgentEnabled: boolean;       // Agente de IA ativo?
  customSlaRules: boolean;       // Permite configurar regras de SLA próprias?
  advancedAutoAssign: boolean;   // Usa algoritmos inteligentes de atribuição?
  advancedAnalytics: boolean;    // Acesso a dashboards completos?
  prioritySupport: boolean;      // Fila VIP de suporte?
  groupIngestEnabled: boolean;   // Ingestão de grupos WhatsApp ativada?

  // --- MARKETING / UI ---
  marketingHighlights: string[]; // Bullets exibidos nos cards de plano
}

// ============================================================================
// CONTRATO CENTRALIZADO (VERDADE PARA UI/GATES QUALITATIVOS)
// ============================================================================

export const TIER_CONTRACTS: Record<string, TierFeatures> = {
  free: {
    code: "free",
    displayName: "Teste Grátis",
    priceCents: 0,
    maxTeamMembers: 2,           // Banco: operators=2
    maxWhatsappChannels: 1,      // D18: Fixo
    maxMessagesPerMonth: 500,    // Banco: messages_mes=500
    aiAgentEnabled: false,
    customSlaRules: false,
    advancedAutoAssign: false,
    advancedAnalytics: false,
    prioritySupport: false,
    groupIngestEnabled: false,
    marketingHighlights: [
      "Até 2 operadores",
      "500 mensagens/mês",
      "1 canal WhatsApp dedicado",
      "Recursos básicos de atendimento",
      "Experimente antes de comprar",
    ],
  },

  operacao: {
    code: "operacao",
    displayName: "Operação",
    priceCents: 9700,            // R$ 97,00
    maxTeamMembers: 2,           // Banco: operators=2
    maxWhatsappChannels: 1,      // D18: Fixo
    maxMessagesPerMonth: 1500,   // Banco: messages_mes=1500
    aiAgentEnabled: false,
    customSlaRules: false,
    advancedAutoAssign: false,
    advancedAnalytics: false,
    prioritySupport: false,
    groupIngestEnabled: false,
    marketingHighlights: [
      "Até 2 operadores",
      "1.500 mensagens/mês",
      "1 canal WhatsApp dedicado",
      "Fila básica e macros",
      "SLA padrão (24h)",
    ],
  },

  crescimento: {
    code: "crescimento",
    displayName: "Crescimento",
    priceCents: 19700,           // R$ 197,00
    maxTeamMembers: 6,           // Banco: operators=6
    maxWhatsappChannels: 1,      // D18: Fixo
    maxMessagesPerMonth: 10000,  // Banco: messages_mes=10000
    aiAgentEnabled: true,
    customSlaRules: true,
    advancedAutoAssign: true,
    advancedAnalytics: false,
    prioritySupport: false,
    groupIngestEnabled: false,
    marketingHighlights: [
      "Até 6 operadores",
      "10.000 mensagens/mês",
      "1 canal WhatsApp dedicado",
      "Agente IA básico incluído",
      "Regras de SLA customizadas",
      "Auto-atribuição inteligente",
    ],
  },

  escala: {
    code: "escala",
    displayName: "Escala",
    priceCents: 39700,           // R$ 397,00
    maxTeamMembers: 15,          // Banco: operators=15
    maxWhatsappChannels: 1,      // D18: Fixo
    maxMessagesPerMonth: 35000,  // Banco: messages_mes=35000
    aiAgentEnabled: true,
    customSlaRules: true,
    advancedAutoAssign: true,
    advancedAnalytics: true,     // Diferencial exclusivo
    prioritySupport: true,       // Diferencial exclusivo
    groupIngestEnabled: true,    // Diferencial exclusivo
    marketingHighlights: [
      "Até 15 operadores",
      "35.000 mensagens/mês",
      "1 canal WhatsApp dedicado",
      "IA avançada + treinamento",
      "Analytics completo e relatórios",
      "Suporte prioritário VIP",
      "Grupos WhatsApp Ativados",
    ],
  },
};

// ============================================================================
// HELPERS DE CONSULTA
// ============================================================================

/**
 * Retorna as features de um tier específico.
 * Fallback seguro para 'operacao' se tier inválido for passado.
 */
export function getTierFeatures(tierCode: string | null | undefined): TierFeatures {
  if (!tierCode || !(tierCode in TIER_CONTRACTS)) {
    return TIER_CONTRACTS.operacao;
  }
  return TIER_CONTRACTS[tierCode];
}

/**
 * Verifica se um tier específico tem acesso a uma feature booleana.
 * Útil para checks rápidos em componentes UI (IA, SLA custom, grupos, etc.).
 */
export function hasFeature(
  tierCode: string | null | undefined,
  featureKey: keyof Pick<
    TierFeatures,
    | "aiAgentEnabled"
    | "customSlaRules"
    | "advancedAutoAssign"
    | "advancedAnalytics"
    | "prioritySupport"
    | "groupIngestEnabled"
  >
): boolean {
  const features = getTierFeatures(tierCode);
  return features[featureKey] === true;
}

/**
 * Verifica se um valor numérico está dentro do limite do tier.
 *
 * ATENÇÃO: para gates quantitativos de enforcement real (bloqueio de ingest
 * por cota de mensagens), use `checkMessageQuota` do `quota.ts` que lê
 * `tiers.limits` DIRETO DO BANCO em runtime — este helper serve apenas
 * para gates qualitativos/operadores onde o contrato TS é suficiente.
 */
export function isWithinLimit(
  tierCode: string | null | undefined,
  limitKey: keyof Pick<TierFeatures, "maxTeamMembers" | "maxWhatsappChannels" | "maxMessagesPerMonth">,
  currentValue: number
): boolean {
  const features = getTierFeatures(tierCode);
  const limit = features[limitKey];
  return currentValue < limit;
}

/**
 * Lista todos os tiers disponíveis ordenados por preço (para UI de upgrade).
 */
export function getOrderedTiers(): TierFeatures[] {
  return Object.values(TIER_CONTRACTS).sort((a, b) => a.priceCents - b.priceCents);
}
