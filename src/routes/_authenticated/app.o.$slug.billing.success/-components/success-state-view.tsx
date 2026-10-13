import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { getCurrentSubscription } from "@/lib/billing/mp-checkout.functions";
import { Loader2, CheckCircle2, Clock } from "lucide-react";
import { Route } from "../route";

type Phase = "polling" | "active" | "timeout";

// Janelas crescentes: ~65s total. Para cedo quando o webhook já processou (caso comum).
const POLL_MS = [5000, 10000, 20000, 30000];
const LIVE_STATES = ["active", "grace_period", "past_due"];

export function SuccessStateView() {
  const navigate = useNavigate();
  const { slug } = useParams({ strict: false }) as { slug: string };
  // orgId vem PRONTO do loader (já validado RBAC). Zero query extra no client.
  const { orgId, orgName } = Route.useLoaderData();
  const getSub = useServerFn(getCurrentSubscription);
  const [phase, setPhase] = useState<Phase>("polling");
  const timers = useRef<number[]>([]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      if (cancelled) return;
      try {
        const sub = await getSub({ data: { orgId } });
        if (cancelled) return;
        if (sub && LIVE_STATES.includes(sub.state)) {
          setPhase("active");
          return true; // sinaliza sucesso p/ parar os próximos polls
        }
      } catch {
        /* silencia erros transitórios de rede/auth durante o polling */
      }
      return false;
    };

    // Primeira tentativa imediata (webhook costuma chegar em 1-3s).
    void check().then((done) => {
      if (done || cancelled) return;
      POLL_MS.forEach((ms) => {
        const id = window.setTimeout(() => {
          void check().then((ok) => {
            if (ok) timers.current.forEach(clearTimeout);
          });
        }, ms);
        timers.current.push(id);
      });
      // Timeout final: esgotou a janela sem virar active.
      const last = window.setTimeout(() => {
        if (!cancelled) setPhase("timeout");
      }, POLL_MS.reduce((a, b) => a + b, 0) + 1000);
      timers.current.push(last);
    });

    return () => {
      cancelled = true;
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [orgId, getSub]);

  const goConfig = () =>
    navigate({ to: "/app/o/$slug/configuracoes", params: { slug } });

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm space-y-4">
        {phase === "polling" && (
          <>
            <Loader2 className="mx-auto h-10 w-10 animate-spin text-primary" />
            <h1 className="text-lg font-semibold">Confirmando sua assinatura…</h1>
            <p className="text-sm text-muted-foreground">
              Estamos aguardando a confirmação do pagamento para{" "}
              <span className="font-medium text-foreground">{orgName}</span>. Isso leva alguns segundos.
            </p>
          </>
        )}
        {phase === "active" && (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <h1 className="text-lg font-semibold">Assinatura ativada!</h1>
            <p className="text-sm text-muted-foreground">
              Seu plano já está disponível para uso em {orgName}.
            </p>
            <button
              onClick={goConfig}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:brightness-110"
            >
              Ir para Configurações
            </button>
          </>
        )}
        {phase === "timeout" && (
          <>
            <Clock className="mx-auto h-10 w-10 text-amber-500" />
            <h1 className="text-lg font-semibold">Pagamento em processamento</h1>
            <p className="text-sm text-muted-foreground">
              Ainda não recebemos a confirmação final. Assim que o Mercado Pago aprovar,
              sua assinatura será ativada automaticamente. Você pode acompanhar em
              Configurações → Financeiro.
            </p>
            <button
              onClick={goConfig}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground hover:brightness-110"
            >
              Ver Financeiro
            </button>
          </>
        )}
      </div>
    </div>
  );
}
