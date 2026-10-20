/**
 * Fase 4.7 Item 3 — Contrato Centralizado de Features por Tier.
 * 
 * PROPÓSITO: Fonte única de verdade sobre quais funcionalidades cada plano libera.
 * Consumido por:
 *   - account-access.ts (para retornar objeto de permissões efetivas ao frontend)
 *   - Componentes UI (para habilitar/desabilitar botões e seções condicionalmente)
 *   - Validações backend (para impedir acesso indevido via API direta)
 * 
 * ARQUITETURA (§5 Backend Authority):
 * Este arquivo é puro TypeScript/constantes. Não faz I/O, não acessa banco.
 * A integração com o banco (tabela `tiers.limits`) acontece no server function
 * que mescla este contrato estático com overrides dinâmicos se necessário.
 * 
 * REGRAS DE NEGÓCIO (Baseado em pricing atual R$97/R$197/R$397 + DECISÃO D18):
 * • OPERADORES: Limites rígidos definidos no banco (Free=2, Op=2, Cresc=6, Escala=15).
 * • CANAIS WHATSAPP: SEMPRE 1 POR ORG (D18). Cota de instância NÃO é cota de tier.
 *   Qualquer menção a "N canais" foi REMOVIDA para evitar propaganda enganosa técnica.
 * • DIFERENCIAIS REAIS: O upsell justifica-se por IA, Automação, Analytics e Suporte,
 *   não por multiplicidade de números de telefone.
 */

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface TierFeatures {
  code: string;
  displayName: string;
  priceCents: number;
  
  // --- LIMITES QUANTITATIVOS (ALINHADOS AO BANCO public.tiers.limits) ---
  maxTeamMembers: number;       // Limite real de operadores/membros da equipe
  maxWhatsappChannels: number;  // SEMPRE 1 (Restrição Arquitetural D18)
  maxActiveDemandas: number | null; // Null = Ilimitado dentro do teto de mensagens
  
  // --- FEATURES QUALITATIVAS (GATES DE FUNCIONALIDADE) ---
  aiAgentEnabled: boolean;      // Agente de IA ativo?
  customSlaRules: boolean;      // Permite configurar regras de SLA próprias?
  advancedAutoAssign: boolean;  // Usa algoritmos inteligentes de atribuição?
  advancedAnalytics: boolean;   // Acesso a dashboards completos?
  prioritySupport: boolean;     // Fila VIP de suporte?
  groupIngestEnabled: boolean;  // Ingestão de grupos WhatsApp ativada?
  
  // --- MARKETING / UI ---
  marketingHighlights: string[]; // Bullets exibidos nos cards de plano
}

// ============================================================================
// CONTRATO CENTRALIZADO (VERDADE ABSOLUTA PARA UI/GATES)
// ============================================================================

export const TIER_CONTRACTS: Record<string, TierFeatures> = {
  free: {
    code: "free",
    displayName: "Teste Grátis",
    priceCents: 0,
    maxTeamMembers: 2,          // Banco: operators=2
    maxWhatsappChannels: 1,     // D18: Fixo
    maxActiveDemandas: 500,     // Estimativa conservadora baseada em messages_mes=500
    aiAgentEnabled: false,
    customSlaRules: false,
    advancedAutoAssign: false,
    advancedAnalytics: false,
    prioritySupport: false,
    groupIngestEnabled: false,
    marketingHighlights: [
      "Até 2 operadores",
      "1 canal WhatsApp dedicado",
      "Recursos básicos de atendimento",
      "Experimente antes de comprar",
    ],
  },

  operacao: {
    code: "operacao",
    displayName: "Operação",
    priceCents: 9700,           // R$ 97,00
    maxTeamMembers: 2,          // Banco: operators=2 (Corrigido de 5)
    maxWhatsappChannels: 1,     // D18: Fixo
    maxActiveDemandas: 1500,    // Baseado em messages_mes=1500
    aiAgentEnabled: false,
    customSlaRules: false,
    advancedAutoAssign: false,
    advancedAnalytics: false,
    prioritySupport: false,
    groupIngestEnabled: false,
    marketingHighlights: [
      "Até 2 operadores",       // Corrigido para bater com o banco
      "1 canal WhatsApp dedicado",
      "Fila básica e macros",
      "SLA padrão (24h)",
    ],
  },

  crescimento: {
    code: "crescimento",
    displayName: "Crescimento",
    priceCents: 19700,          // R$ 197,00
    maxTeamMembers: 6,          // Banco: operators=6 (Corrigido de 20)
    maxWhatsappChannels: 1,     // D18: Fixo (Corrigido de 3)
    maxActiveDemandas: 10000,   // Baseado em messages_mes=10000
    aiAgentEnabled: true,
    customSlaRules: true,
    advancedAutoAssign: true,
    advancedAnalytics: false,
    prioritySupport: false,
    groupIngestEnabled: false,
    marketingHighlights: [
      "Até 6 operadores",       // Corrigido para bater com o banco
      "Agente IA básico incluído", // Diferencial real vs Operação
      "Regras de SLA customizadas", // Diferencial real
      "Auto-atribuição inteligente", // Diferencial real
      "1 canal WhatsApp dedicado", // Substituiu "3 canais"
    ],
  },

  escala: {
    code: "escala",
    displayName: "Escala",
    priceCents: 39700,          // R$ 397,00
    maxTeamMembers: 15,         // Banco: operators=15 (Corrigido de Infinity)
    maxWhatsappChannels: 1,     // D18: Fixo (Corrigido de 10)
    maxActiveDemandas: null,    // Ilimitado (dentro do teto de 35k msgs/mês)
    aiAgentEnabled: true,
    customSlaRules: true,
    advancedAutoAssign: true,
    advancedAnalytics: true,    // Diferencial exclusivo
    prioritySupport: true,      // Diferencial exclusivo
    groupIngestEnabled: true,   // Diferencial exclusivo
    marketingHighlights: [
      "Até 15 operadores",      // Corrigido para bater com o banco
      "IA avançada + treinamento", // Diferencial real
      "Analytics completo e relatórios", // Diferencial real
      "Suporte prioritário VIP", // Diferencial real
      "Grupos WhatsApp Ativados", // Diferencial técnico real
      "1 canal WhatsApp dedicado", // Substituiu "10 canais"
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
 * Útil para checks rápidos em componentes UI.
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
 */
export function isWithinLimit(
  tierCode: string | null | undefined,
  limitKey: keyof Pick<TierFeatures, "maxTeamMembers" | "maxWhatsappChannels" | "maxActiveDemandas">,
  currentValue: number
): boolean {
  const features = getTierFeatures(tierCode);
  const limit = features[limitKey];
  if (limit === null || limit === Infinity) return true;
  return currentValue < limit;
}

/**
 * Lista todos os tiers disponíveis ordenados por preço (para UI de upgrade).
 */
export function getOrderedTiers(): TierFeatures[] {
  return Object.values(TIER_CONTRACTS).sort((a, b) => a.priceCents - b.priceCents);
}