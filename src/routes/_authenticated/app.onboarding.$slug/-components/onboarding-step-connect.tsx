import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { dismissOnboarding } from "@/lib/orgs.functions";
import { WhatsappConnectPanel } from "@/components/whatsapp-connect-panel";

interface OnboardingStepConnectProps {
  orgId: string;
  orgSlug: string;
}

/**
 * Step 2/2 do wizard: Conectar WhatsApp
 * Alinhado visualmente ao padrão Dark/Slate do Hub e do Step de Perfil.
 * Mantém o escape lateral ("Conectar depois") no topo à direita.
 */
export function OnboardingStepConnect({ orgId, orgSlug }: OnboardingStepConnectProps) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const dismiss = useServerFn(dismissOnboarding);

  function goToFila() {
    qc.setQueryData(["onboarding-state", orgId], (old: any) => ({
      ...(old ?? {}),
      connected: true,
      status: "connected",
    }));
    navigate({ to: "/app/o/$slug/fila", params: { slug: orgSlug } });
  }

  async function handleLater() {
    try {
      await dismiss({ data: { orgId } });
      try {
        sessionStorage.setItem(`onboarding-auto:${orgSlug}`, "skipped");
      } catch {
        /* sessionStorage bloqueado: ignora */
      }
      toast.success("Sem pressa — o guia continua disponível na fila.");
      goToFila();
    } catch (err: any) {
      toast.error(err?.message ?? "Não foi possível adiar a conexão");
    }
  }

  return (
    <div className="space-y-5">
      {/* Cabeçalho do Passo + Botão "Conectar depois" no canto superior direito */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight text-slate-100">
            Conecte seu WhatsApp
          </h1>
          <p className="mt-1 text-xs text-slate-400 max-w-xl">
            Assim que o QR for escaneado, as mensagens dos clientes virão como demandas
            automáticas para a fila.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleLater()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-800 bg-slate-950/60 px-3 py-1.5 text-xs font-medium text-slate-400 transition hover:border-slate-700 hover:bg-slate-900 hover:text-slate-200"
        >
          <CalendarClock className="h-3.5 w-3.5 text-slate-500" />
          Conectar depois
        </button>
      </div>

      {/* Painel de Conexão com bordas e fundos no padrão Dark/Slate */}
      <div className="rounded-xl border border-slate-800/80 bg-slate-950/40 p-4 sm:p-6">
        <WhatsappConnectPanel orgId={orgId} onConnected={goToFila} />
      </div>
    </div>
  );
}
