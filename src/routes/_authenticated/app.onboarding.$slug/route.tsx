import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
import { Check, Inbox } from "lucide-react";
import { getOrgBySlug, getOnboardingState } from "@/lib/orgs.functions";
import { ListSkeleton } from "@/components/skeletons";
import { OnboardingStepProfile } from "./-components/onboarding-step-profile";
import { OnboardingStepConnect } from "./-components/onboarding-step-connect";

/**
 * Wizard de ativação (ciclo 1, §38): tela cheia FORA do shell da org
 * (irmão de `app.o.$slug`, filho de `_authenticated` → herda o guard de
 * sessão). Guards D6: org conectada → fila; papel não-gestor → fila
 * (aviso neutro); erro de membership → /app.
 * Step persistido por org em sessionStorage: remount (yank pós-scan)
 * NÃO volta pra etapa de perfil já vencida (bug do E2E 2026-09-30).
 * Shell: superfície de marca slate fixa, contida em max-w-4xl — mesma
 * família de contenção do Hub (/app), com largura própria pros grids
 * de 2 colunas dos steps (D9).
 */
export const Route = createFileRoute("/_authenticated/app/onboarding/$slug")({
  head: () => ({ meta: [{ title: "Configuração inicial — Fluxo" }] }),
  component: OnboardingWizard,
});

function OnboardingWizard() {
  const { slug } = Route.useParams();
  const getOrg = useServerFn(getOrgBySlug);
  const getState = useServerFn(getOnboardingState);

  // Step sobrevivente a remounts: perfil completo → step 2 persistido.
  const stepKey = `onboarding-step:${slug}`;
  const [step, setStep] = useState<1 | 2>(() => {
    try {
      return sessionStorage.getItem(stepKey) === "2" ? 2 : 1;
    } catch {
      return 1;
    }
  });

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
      <Shell step={step} orgName={orgQ.data?.name}>
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
    <Shell step={step} orgName={org.name}>
      {step === 1 ? (
        <OnboardingStepProfile
          org={{ id: org.id, name: org.name, slug: org.slug, logo_url: org.logo_url }}
          onComplete={() => {
            try {
              sessionStorage.setItem(stepKey, "2");
            } catch {
              /* sessionStorage bloqueado: segue só com estado local */
            }
            setStep(2);
          }}
        />
      ) : (
        <OnboardingStepConnect orgId={org.id} orgSlug={slug} />
      )}
    </Shell>
  );
}

/**
 * Shell Contido & Moderno: centralizado na tela, com suporte a grids de
 * 2 colunas (max-w-4xl). Escopo `dark` no root: filhos token-based
 * (ListSkeleton, WhatsappConnectPanel) renderizam escuros dentro da
 * superfície slate mesmo em tema light (D9).
 */
function Shell({
  step,
  orgName,
  children,
}: {
  step: 1 | 2;
  orgName?: string;
  children: ReactNode;
}) {
  return (
    <div className="dark min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4 sm:p-6">
      <div className="w-full max-w-4xl space-y-4">
        {/* Header Superior Compacto (Marca + Stepper em Pílula) */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-1">
          {/* Logo / Contexto da Organização */}
          <div className="flex items-center gap-2">
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
          {/* Stepper num Badge / Pílula elegante */}
          <div className="flex items-center gap-2 rounded-full border border-slate-800 bg-slate-900/90 px-3.5 py-1 text-[11px] font-medium shadow-sm">
            <span
              className={`flex items-center gap-1.5 ${
                step === 1 ? "text-primary font-semibold" : "text-slate-400"
              }`}
            >
              {step > 1 ? (
                <span className="grid h-3.5 w-3.5 place-items-center rounded-full bg-primary/20 text-primary">
                  <Check className="h-2.5 w-2.5" />
                </span>
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
              )}
              1. Perfil
            </span>
            <span className="h-3 w-px bg-slate-800" />
            <span
              className={`flex items-center gap-1.5 ${
                step === 2 ? "text-primary font-semibold" : "text-slate-500"
              }`}
            >
              {step === 2 && <span className="h-1.5 w-1.5 rounded-full bg-primary" />}
              2. Conectar WhatsApp
            </span>
          </div>
        </div>

        {/* Card Mestre (proporção max-w-4xl ideal pra formulários/QR Code) */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5 sm:p-7 shadow-2xl backdrop-blur-sm">
          {children}
        </div>

        {/* Footer / Nota Informativa */}
        <p className="text-center text-[11px] text-slate-500">
          Você poderá alterar e gerenciar estas configurações posteriormente no painel da organização.
        </p>
      </div>
    </div>
  );
}
