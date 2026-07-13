import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { viewInvite } from "@/lib/invites.functions";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/convite/$token")({
  head: () => ({ meta: [{ title: "Convite — Fluxo" }] }),
  component: ConvitePage,
});

const LABEL: Record<string, string> = {
  admin: "Administrador", gerente: "Gerente", operador: "Operador", agente_ia: "Agente de IA",
};

function ConvitePage() {
  const { token } = useParams({ from: "/convite/$token" });
  const navigate = useNavigate();
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "need-login" }
    | { kind: "error"; msg: string }
    | { kind: "info"; info: Awaited<ReturnType<typeof viewInvite>> }
  >({ kind: "loading" });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        try { sessionStorage.setItem("post-login-redirect", `/convite/${token}`); } catch {}
        setState({ kind: "need-login" });
        return;
      }
      try {
        const info = await viewInvite({ data: { token } });
        setState({ kind: "info", info });
      } catch (e) {
        setState({ kind: "error", msg: friendlyError(e) });
      }
    })();
  }, [token]);

  if (state.kind === "loading") {
    return <Splash>Carregando convite…</Splash>;
  }
  if (state.kind === "need-login") {
    return (
      <Splash>
        <p className="text-sm text-muted-foreground">Entre com sua conta para continuar com o convite.</p>
        <button onClick={() => navigate({ to: "/auth" })} className="mt-4 h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm">
          Ir para o login
        </button>
      </Splash>
    );
  }
  if (state.kind === "error") {
    return <Splash><p className="text-sm text-destructive">{state.msg}</p></Splash>;
  }
  const info = state.info;
  if (info.already_member) {
    return (
      <Splash>
        <p className="text-sm">Você já faz parte de <b>{info.org?.name}</b>.</p>
        {info.org && (
          <button onClick={() => navigate({ to: "/app/o/$slug/fila", params: { slug: info.org!.slug } })}
            className="mt-4 h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm">
            Abrir organização
          </button>
        )}
      </Splash>
    );
  }
  if (info.status === "approved") {
    return (
      <Splash>
        <p className="text-sm">Seu acesso a <b>{info.org?.name}</b> foi aprovado como <b>{LABEL[info.approved_role ?? ""] ?? info.approved_role}</b>.</p>
        {info.org && (
          <button onClick={() => navigate({ to: "/app/o/$slug/fila", params: { slug: info.org!.slug } })}
            className="mt-4 h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm">
            Entrar
          </button>
        )}
      </Splash>
    );
  }
  if (info.status === "rejected") {
    return <Splash><p className="text-sm text-muted-foreground">Este convite foi rejeitado.</p></Splash>;
  }
  // pending
  return (
    <Splash>
      <h1 className="text-lg font-semibold">Solicitação enviada</h1>
      <p className="text-sm text-muted-foreground mt-1">
        Aguarde a aprovação de um gestor de <b>{info.org?.name}</b>. Papel sugerido:{" "}
        <b>{LABEL[info.suggested_role] ?? info.suggested_role}</b>.
      </p>
      <p className="text-xs text-muted-foreground mt-4">Você pode fechar esta página. Assim que for aprovado, poderá acessar a organização em /app.</p>
    </Splash>
  );
}

function Splash({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center">
        <div className="flex items-center justify-center gap-2 font-semibold mb-4">
          <span className="inline-block h-6 w-6 rounded-md bg-primary" /> Fluxo
        </div>
        {children}
      </div>
    </div>
  );
}