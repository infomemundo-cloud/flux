import { CalendarClock, Lock, Tags } from "lucide-react";
import type { AssignmentMode } from "@/lib/demandas/assignment-options";
import { DistributionCard } from "./distribution-card";
import { SlaRulesCard } from "./sla-rules-card";
import { AiAgentCard } from "./ai-agent-card";

/** Linha slim de pendência (densa — espaço é ouro). */
function SlimSoon({
  icon: Icon,
  title,
  description,
  pro,
}: {
  icon: typeof Tags;
  title: string;
  description: string;
  pro?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-dashed border-border bg-card/60 px-4 py-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" strokeWidth={2.2} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-xs font-semibold">{title}</div>
        <p className="text-[11px] text-muted-foreground">{description}</p>
      </div>
      <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        {pro ? "Em breve · Plano Pro" : "Em breve"}
      </span>
    </div>
  );
}

/** Card informativo compacto de política de armazenamento. */
function StoragePolicyCard() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-border bg-card/60 px-4 py-3">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground">
        <Lock className="h-4 w-4" strokeWidth={2.2} />
      </span>
      <div className="min-w-0">
        <div className="text-xs font-semibold">Armazenamento & Privacidade</div>
        <p className="text-[11px] text-muted-foreground">
          Arquivos e mídias do WhatsApp são mantidos em bucket privado com links efêmeros de 1 hora, pra garantia de privacidade dos seus clientes.
        </p>
      </div>
    </div>
  );
}

/**
 * Aba Atendimento — grid denso de 2 colunas (lg+), linguagem de gestor:
 * - ESQUERDA: distribuição automática REAL (switch + modo, autosave) +
 *   agente de IA (toggle real) + personalização de etapas (pendência);
 * - DIREITA: SLA real com autosave + política de armazenamento +
 *   notificação proativa (pendência).
 * Nada ocupa 100% da largura em desktop; toggles/selects salvam na hora.
 */
export function AtendimentoTab({
  orgId,
  orgSlug,
  slaEnabled,
  slaMaxInactivityHours,
  autoAssignEnabled,
  autoAssignMode,
}: {
  orgId: string;
  orgSlug: string;
  slaEnabled: boolean;
  slaMaxInactivityHours: number;
  autoAssignEnabled: boolean;
  autoAssignMode: AssignmentMode;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* COLUNA 1 — Atribuição & IA */}
      <div className="space-y-4">
        <DistributionCard
          orgId={orgId}
          orgSlug={orgSlug}
          enabled={autoAssignEnabled}
          mode={autoAssignMode}
        />
        <AiAgentCard orgId={orgId} />
        <SlimSoon
          icon={Tags}
          title="Personalize as etapas"
          description="Apelidos e cores dos status por organização, do seu jeito."
        />
      </div>

      {/* COLUNA 2 — SLA & Monitoramento */}
      <div className="space-y-4">
        <SlaRulesCard
          orgId={orgId}
          orgSlug={orgSlug}
          enabled={slaEnabled}
          maxHours={slaMaxInactivityHours}
        />
        <StoragePolicyCard />
        <SlimSoon
          icon={CalendarClock}
          title="Aviso proativo de SLA"
          description="Notificação da equipe antes do prazo estourar, com antecedência configurável."
        />
      </div>
    </div>
  );
}