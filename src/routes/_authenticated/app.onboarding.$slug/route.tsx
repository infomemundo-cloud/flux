import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, type ReactNode } from "react";
import { Inbox } from "lucide-react";
import { getOrgBySlug, getOnboardingState } from "@/lib/orgs.functions";
import { ListSkeleton } from "@/components/skeletons";
import { OnboardingStepProfile } from "./-components/onboarding-step-profile";
import { OnboardingStepConnect } from "./-components/onboarding-step-connect";

/**
 * Wizard de ativação (ciclo 1, §38): tela cheia FORA do shell da org
 * (irmão de `app.o.$slug`, filho de `_authenticated` → herda o guard de
 * sessão). Guards D6: org conectada → fila; papel não-gestor → fila
 * (aviso neutro); erro de membership → /app.
 * "Conectar depois" (dismiss) vive no step 2 — controla só o auto-abrir
 * futuro; a orientação na fila nunca some até conectar.
 * Step persistido por org em sessionStorage: remount (yank pós-scan)
 * NÃO volta mais pra etapa de perfil já vencida (bug do E2E 2026-09-30).
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
        <div className="py-24">
          <ListSkeleton rows={3} height="h-[72px]" />
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

/** Chrome mínimo do wizard: marca + progresso. Sem sidebar (foco total). */
function Shell({ step, orgName, children }: { step: 1 | 2; orgName?: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card">
        <div className="mx-auto max-w-3xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary">
              <Inbox className="h-4 w-4 text-primary-foreground" />
            </span>
            Fluxo
            {orgName && <span className="text-sm font-normal text-muted-foreground">· {orgName}</span>}
          </div>
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <span className={step === 1 ? "font-semibold text-foreground" : undefined}>1. Perfil</span>
            <span className="h-3 w-px bg-border" />
            <span className={step === 2 ? "font-semibold text-foreground" : undefined}>2. WhatsApp</span>
          </div>
        </div>
      </header>
      <main className="flex-1 px-6 py-10">
        <div className="mx-auto max-w-3xl">{children}</div>
      </main>
    </div>
  );
}
