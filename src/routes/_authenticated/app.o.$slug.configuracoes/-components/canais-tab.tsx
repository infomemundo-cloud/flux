import { useState } from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import { getAdvancedMode, setAdvancedMode } from "@/lib/advanced-mode";
import { WhatsappSection } from "./whatsapp-section";
import { GroupRulesSection } from "./group-rules-section";
import { UpcomingChannels } from "./upcoming-channels";
import { WebhooksSection } from "./webhooks-section";

/**
 * Aba Canais & Integrações — focada em gestores de negócio:
 * - Grid 2 colunas: WhatsApp (status + regras) + Próximos canais
 * - Sem termos técnicos (Evolution, webhook URL, payloads, eventos)
 * - Modo Avançado no rodapé revela configurações técnicas (tokens de webhook)
 *   pra usuários que precisam integrar com CRM externo (5% dos casos)
 */
export function CanaisTab({
  orgId,
  orgSlug,
  origin,
  allowGroupIngest,
}: {
  orgId: string;
  orgSlug: string;
  origin: string;
  allowGroupIngest: boolean;
}) {
  const [advancedMode, setAdvancedModeLocal] = useState(getAdvancedMode());

  const toggleAdvanced = () => {
    const next = !advancedMode;
    setAdvancedMode(next);
    setAdvancedModeLocal(next);
  };

  return (
    <div className="space-y-6">
      {/* Grid principal (2 colunas em desktop) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* COLUNA 1 — WhatsApp da Empresa */}
        <div className="space-y-6">
          <WhatsappSection orgId={orgId} />
          <GroupRulesSection
            orgId={orgId}
            orgSlug={orgSlug}
            enabled={allowGroupIngest}
          />
        </div>

        {/* COLUNA 2 — Próximos Canais */}
        <div className="space-y-6">
          <UpcomingChannels />
        </div>
      </div>

      {/* Modo Avançado (toggle no rodapé, persistente em localStorage) */}
      <div className="border-t border-border pt-6">
        <button
          type="button"
          onClick={toggleAdvanced}
          className="inline-flex items-center gap-2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
        >
          <Settings2 className="h-3.5 w-3.5" />
          {advancedMode ? "Ocultar configurações avançadas" : "Ver configurações avançadas"}
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${advancedMode ? "rotate-180" : ""}`}
          />
        </button>
        {advancedMode && (
          <div className="mt-4 rounded-2xl border border-dashed border-border bg-card/60 p-6">
            <p className="mb-4 text-xs text-muted-foreground">
              <b>Configurações avançadas:</b> endpoints de webhook e tokens de API
              pra integração com sistemas externos (CRM, ERP, automações).
            </p>
            <WebhooksSection orgId={orgId} origin={origin} />
          </div>
        )}
      </div>
    </div>
  );
}