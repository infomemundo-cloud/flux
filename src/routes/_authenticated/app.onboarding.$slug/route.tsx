import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { type ReactNode } from "react";
import { Inbox } from "lucide-react";
import { getOrgBySlug, getOnboardingState } from "@/lib/orgs.functions";
import { ListSkeleton } from "@/components/skeletons";
import { OnboardingStepConnect } from "./-components/onboarding-step-connect";

/**
 * Wizard de ativação (ciclo 1, §38) — ETAPA ÚNICA após o corte de atrito:
 * criar empresa → conectar WhatsApp → fila. Identidade (nome/logo) deixa
 * de ser etapa bloqueante e vira edição opcional em Configurações → Geral
 * (OrgIdentitySection), como o mercado faz (WATI/Respond.io não perguntam
 * perfil antes do QR).
 * Guards D6 intactos: org conectada → fila; papel não-gestor → fila
 * (aviso neutro); erro de membership → /app.
 * Shell: superfície de marca slate fixa, contida em max-w-4xl (D9).
 */
export const Route = createFileRoute("/_authenticated/app/onboarding/$slug")({
  head: () => ({ meta: [{ title: "Configuração inicial — Fluxo" }] }),
  component: OnboardingWizard,
});

function OnboardingWizard() {
  const { slug } = Route.useParams();
  const getOrg = useServerFn(getOrgBySlug);
  const getState = useServerFn(getOnboardingState);

  const orgQ = useQuery({
    queryKey: ["org", slug],
    queryFn: () => getOrg({ data: { slug } }),
  });
  const stateQ = useQuery({
    queryKey: ["onboarding-state", orgQ.data?.id],
    queryFn: () => getState({ data: { orgId: orgQ.data!.id } }),
    enabled: !!orgQ.data,
  });

  if (orgQ.isLoading || (orgQ.data && stateQ.isLoading)) {
    return (
      <Shell orgName={orgQ.data?.name}>
        <div className="py-12">
          <ListSkeleton rows={3} height="h-[68px]" />
        </div>
      </Shell>
    );
  }

  if (orgQ.error || !orgQ.data) {
    return <Navigate to="/app" />;
  }

  const state = stateQ.data;

  // D6: org conectada não passa pelo wizard
  if (state?.connected) {
    return <Navigate to="/app/o/$slug/fila" params={{ slug }} />;
  }
  // D6: wizard é owner/admin; demais papéis caem na fila com aviso neutro
  if (state && !["owner", "admin"].includes(state.role)) {
    return <Navigate to="/app/o/$slug/fila" params={{ slug }} />;
  }

  const org = orgQ.data;

  return (
    <Shell orgName={org.name}>
      <OnboardingStepConnect orgId={org.id} orgSlug={slug} />
    </Shell>
  );
}

/**
 * Shell contido (max-w-4xl) em slate fixo com escopo `dark` (D9).
 * Sem stepper: etapa única não precisa de progresso — o header traz
 * marca + org, e o rodapé lembra onde editar a identidade depois.
 */
function Shell({ orgName, children }: { orgName?: string; children: ReactNode }) {
  return (
    <div className="dark min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-4xl space-y-4">
        {/* Header: marca + contexto da organização */}
        <div className="flex items-center gap-2 px-1">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-primary shadow-sm">
            <Inbox className="h-4 w-4 text-primary-foreground" strokeWidth={2.5} />
          </span>
          <span className="text-sm font-semibold tracking-wide text-slate-100">Fluxo</span>
          {orgName && (
            <>
              <span className="h-1 w-1 rounded-full bg-slate-700" />
              <span className="text-xs font-medium text-slate-400 truncate max-w-[240px]">
                {orgName}
              </span>
            </>
          )}
        </div>

        {/* Card mestre */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 sm:p-7 shadow-2xl backdrop-blur-sm">
          {children}
        </div>

        {/* Rodapé: identidade é editável depois (tirou o peso do wizard) */}
        <p className="text-center text-[11px] text-slate-500">
          Nome e logotipo da empresa podem ser ajustados depois em Configurações → Geral.
        </p>
      </div>
    </div>
  );
}
