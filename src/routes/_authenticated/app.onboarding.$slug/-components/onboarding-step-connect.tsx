import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CalendarClock } from "lucide-react";
import { dismissOnboarding } from "@/lib/orgs.functions";
import { WhatsappConnectPanel } from "@/components/whatsapp-connect-panel";

interface OnboardingStepConnectProps {
  orgId: string;
  orgSlug: string;
}

/** Step 2/2: conexão do WhatsApp (painel compartilhado) + escape "Conectar depois". */
export function OnboardingStepConnect({ orgId, orgSlug }: OnboardingStepConnectProps) {
  const navigate = useNavigate();
  const dismiss = useServerFn(dismissOnboarding);

  function goToFila() {
    navigate({ to: "/app/o/$slug/fila", params: { slug: orgSlug } });
  }

  async function handleLater() {
    try {
      await dismiss({ data: { orgId } });
      toast.success("Sem pressa — o guia continua disponível na fila.");
      goToFila();
    } catch (err: any) {
      toast.error(err?.message ?? "Não foi possível adiar a conexão");
    }
  }

  return (
    <div className="space-y-6">
      <div className="text-center space-y-2">
        <h1 className="text-2xl font-bold tracking-tight">Conecte seu WhatsApp</h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">
          Assim que o QR for escaneado, as mensagens dos clientes viram demandas
          automaticamente na sua fila.
        </p>
      </div>

      <div className="rounded-xl border border-border bg-card">
        <WhatsappConnectPanel orgId={orgId} onConnected={goToFila} />
      </div>

      <div className="flex justify-center">
        <button
          onClick={() => void handleLater()}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition"
        >
          <CalendarClock className="h-4 w-4" />
          Conectar depois — ir pra fila agora
        </button>
      </div>
    </div>
  );
}