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
 *   Este arquivo é puro TypeScript/constantes. Não faz I/O, não acessa banco.
 *   A integração com o banco (tabela `tiers.limits`) acontece no server function
 *   que mescla este contrato estático com overrides dinâmicos se necessário.
 * 
 * REGRAS DE NEGÓCIO (Baseado em pricing atual R$97/R$197/R$397):
 *   - operacao: Básico. Sem IA, sem SLA custom, limite baixo de usuários/canais.
 *   - crescimento: Intermediário. IA básica, SLA padrão, múltiplos canais.
 *   - escala: Avançado. IA total, SLA prioritário, automação completa, Grupos WhatsApp.
 */

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface TierFeatures {
  /** Identificador único do tier (deve bater com tiers.code no DB) */
  code: "operacao" | "crescimento" | "escala";
  
  /** Nome exibido na UI */
  displayName: string;
  
  /** Preço mensal em centavos (espelho de tiers.price_cents para validação rápida) */
  priceCents: number;

  // --- LIMITES QUANTITATIVOS ---
  /** Máximo de membros na equipe (Infinity = ilimitado) */
  maxTeamMembers: number;
  
  /** Máximo de canais WhatsApp conectados simultaneamente */
  maxWhatsappChannels: number;
  
  /** Máximo de demandas ativas simultâneas (opcional, null = ilimitado) */
  maxActiveDemandas: number | null;

  // --- FLAGS DE FUNCIONALIDADE ---
  /** Acesso ao módulo de Agente IA (respostas automáticas, classificação) */
  aiAgentEnabled: boolean;
  
  /** Configuração customizada de regras SLA (horas específicas por prioridade) */
  customSlaRules: boolean;
  
  /** Auto-atribuição round-robin ou least-busy avançada */
  advancedAutoAssign: boolean;
  
  /** Relatórios analíticos avançados (dashboard de performance, tempos médios) */
  advancedAnalytics: boolean;
  
  /** Suporte prioritário (tempo de resposta garantido) */
  prioritySupport: boolean;

  /** Habilita ingestão automática de mensagens vindas de grupos do WhatsApp */
  groupIngestEnabled: boolean;

  // --- METADADOS PARA UI ---
  /** Lista de bullets para exibir no card de pricing ("Ideal para...") */
  marketingHighlights: string[];
}

// ============================================================================
// CONTRATOS POR TIER
// ============================================================================

export const TIER_CONTRACTS: Record<string, TierFeatures> = {
  operacao: {
    code: "operacao",
    displayName: "Operação",
    priceCents: 9700, // R$ 97,00
    
    maxTeamMembers: 5,
    maxWhatsappChannels: 1,
    maxActiveDemandas: 500,
    
    aiAgentEnabled: false,
    customSlaRules: false,
    advancedAutoAssign: false,
    advancedAnalytics: false,
    prioritySupport: false,
    groupIngestEnabled: false, // ❌ Bloqueado
    
    marketingHighlights: [
      "Até 5 operadores",
      "1 canal WhatsApp",
      "Fila básica e macros",
      "SLA padrão (24h)",
    ],
  },

  crescimento: {
    code: "crescimento",
    displayName: "Crescimento",
    priceCents: 19700, // R$ 197,00
    
    maxTeamMembers: 20,
    maxWhatsappChannels: 3,
    maxActiveDemandas: 2000,
    
    aiAgentEnabled: true, // IA básica liberada
    customSlaRules: true, // Pode ajustar horas por prioridade
    advancedAutoAssign: true, // Round-robin inteligente
    advancedAnalytics: false, // Analytics avançado só no escala
    prioritySupport: false,
    groupIngestEnabled: false, // ❌ Bloqueado (apenas Escala)
    
    marketingHighlights: [
      "Até 20 operadores",
      "3 canais WhatsApp",
      "Agente IA básico",
      "Regras SLA customizadas",
      "Auto-atribuição inteligente",
    ],
  },

  escala: {
    code: "escala",
    displayName: "Escala",
    priceCents: 39700, // R$ 397,00
    
    maxTeamMembers: Infinity,
    maxWhatsappChannels: 10,
    maxActiveDemandas: null, // Ilimitado
    
    aiAgentEnabled: true, // IA total + treinamento custom
    customSlaRules: true,
    advancedAutoAssign: true,
    advancedAnalytics: true, // Dashboards completos
    prioritySupport: true, // Suporte VIP
    groupIngestEnabled: true, // ✅ LIBERADO APENAS AQUI
    
    marketingHighlights: [
      "Operadores ilimitados",
      "10 canais WhatsApp",
      "IA avançada + treinamento",
      "Analytics completo",
      "Suporte prioritário VIP",
      "Automação total (inclui Grupos)", // 👈 Destaque no marketing
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
  featureKey: keyof Pick<TierFeatures, 
    "aiAgentEnabled" | "customSlaRules" | "advancedAutoAssign" | 
    "advancedAnalytics" | "prioritySupport" | "groupIngestEnabled"
  >
): boolean {
  const features = getTierFeatures(tierCode);
  return features[featureKey] === true;
}

/**
 * Verifica se um valor numérico está dentro do limite do tier.
 * Retorna true se permitido, false se excedeu.
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
