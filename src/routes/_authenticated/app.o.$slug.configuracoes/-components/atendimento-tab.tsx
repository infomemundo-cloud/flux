import { Bot, CalendarClock, Tags } from "lucide-react";
import { SlidersHorizontal } from "lucide-react";
import { SectionTitle } from "@/components/section-ui";
import { ComingSoon } from "./coming-soon";
import { AiAutoReplySection } from "./ai-auto-reply-section";
import { AutomaticDistributionSection } from "./automatic-distribution-section";

/** Aba Atendimento: ciclo de vida, SLA, IA e distribuição. */
export function AtendimentoTab({ orgId }: { orgId: string }) {
  return (
    <>
      <SectionTitle
        icon={SlidersHorizontal}
        title="Atendimento"
        hint="Ciclo de vida, SLA, automações de IA e distribuição de demandas — regra de negócio da org."
      />
      <AiAutoReplySection orgId={orgId} />
      <ComingSoon
        icon={Bot}
        title="Prompt de IA por organização"
        description="Texto-base/persona da IA configurável por org, complementando o toggle de resposta automática."
      />
      <AutomaticDistributionSection />
      <ComingSoon
        icon={Tags}
        title="Personalize as etapas"
        description="Apelidos e cores dos status por org (custom_statuses JSONB). As chaves canônicas nunca mudam — só rótulo e cor. Execução em fases: display layer com fallback STATE_LABEL primeiro, editor na UI depois."
      />
      <ComingSoon
        icon={CalendarClock}
        title="Prazos padrão & SLA proativo"
        description="Prazos padrão por estado/prioridade e notificação proativa de SLA vencido com antecedência configurável."
      />
    </>
  );
}