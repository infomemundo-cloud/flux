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
 * Step 2/2 do wizard: header com escape lateral ("Conectar depois" no canto
 * direito, não centralizado embaixo) + painel compartilhado em 2 colunas.
 * Diretriz §34: nada de card 100% empilhado em desktop.
 *
 * goToFila sincroniza o cache de onboarding ANTES de navegar: o layout da
 * org lê a MESMA key pra decidir o auto-open; cache stale (connected=false)
 * era o yank de volta pro wizard logo após o scan (bug do E2E 2026-09-30).
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Conecte seu WhatsApp</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Assim que o QR for escaneado, as mensagens dos clientes viram demandas
            automaticamente na sua fila.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleLater()}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <CalendarClock className="h-3.5 w-3.5" /> Conectar depois
        </button>
      </div>

      <div className="rounded-xl border border-border bg-card p-5 sm:p-6">
        <WhatsappConnectPanel orgId={orgId} onConnected={goToFila} />
      </div>
    </div>
  );
}
