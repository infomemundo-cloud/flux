import { CalendarClock, Lock, Shuffle, Tags } from "lucide-react";
import { InfoTip } from "@/components/info-tip";
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

/**
 * Card 1 (coluna esquerda): Distribuição Automática — ESTRUTURA-LEMBRANÇA.
 * Radios e switch aparecem ghosted (visíveis, desativados) com badge
 * "Em breve · Plano Pro": o gestor já vê o que existirá, sem promessa
 * falsa de funcionamento. Persistência + lógica no ingest = passo futuro.
 */
function DistributionSoonCard() {
  return (
    <div className="card-elevated space-y-3 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Shuffle className="h-5 w-5" strokeWidth={2.2} />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <h3 className="text-sm font-semibold">Distribuição Automática de Demandas</h3>
              <InfoTip text="Quando ativado, cada novo chamado recebido será atribuído automaticamente a um operador da equipe, sem necessidade de distribuição manual." />
            </div>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Atribua novos chamados do WhatsApp automaticamente entre os operadores.
            </p>
          </div>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Em breve · Plano Pro
        </span>
      </div>

      {/* Estrutura ghosted: lembra o que existirá */}
      <div className="pointer-events-none space-y-2 opacity-50" aria-disabled="true">
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
          <span className="text-xs font-semibold">Ativar distribuição automática</span>
          <span className="relative inline-flex h-5 w-9 rounded-full bg-secondary" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-lg border border-border p-3">
            <span className="block text-xs font-semibold">Round-Robin (Revezamento)</span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              Fila circular sequencial entre os operadores ativos.
            </span>
          </div>
          <div className="rounded-lg border border-border p-3">
            <span className="block text-xs font-semibold">Menor Carga de Trabalho</span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              Atribui ao operador com menor número de demandas em aberto.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Card 4 (coluna direita): política de armazenamento — informativo compacto. */
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
 * - ESQUERDA: distribuição (estrutura-lembrança) + agente de IA (toggle real)
 *   + personalização de etapas (pendência);
 * - DIREITA: SLA real com autosave + política de armazenamento +
 *   notificação proativa (pendência).
 * Nada ocupa 100% da largura em desktop; toggles/selects salvam na hora.
 */
export function AtendimentoTab({
  orgId,
  orgSlug,
  slaEnabled,
  slaMaxInactivityHours,
}: {
  orgId: string;
  orgSlug: string;
  slaEnabled: boolean;
  slaMaxInactivityHours: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* COLUNA 1 — Atribuição & IA */}
      <div className="space-y-4">
        <DistributionSoonCard />
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