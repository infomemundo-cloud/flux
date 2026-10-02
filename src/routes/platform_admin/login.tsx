import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState, type FormEvent } from "react";
import { ShieldCheck, LogOut, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { getPlatformAdminSession } from "@/lib/platform-admin.functions";
import { bumpRedirectHops, resetRedirectHops } from "@/lib/platform-admin-redirect-guard";

export const Route = createFileRoute("/platform_admin/login")({
  head: () => ({ meta: [{ title: "Admin — Fluxo" }] }),
  component: PlatformAdminLogin,
});

/**
 * Login EXCLUSIVO do platform_admin (D7): email+senha, sem "criar conta",
 * sem "esqueci senha" (provisionamento é manual via script). Superfície de
 * marca: slate fixo com escopo dark forçado (D9).
 * ANTI-CONGELAMENTO: nenhum <Navigate> em fase de renderização — toda
 * navegação acontece em useEffect (cede a main thread entre hops) com
 * circuit breaker de hops (login ↔ shell não podem ciclar em loop).
 */
function PlatformAdminLogin() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const sessionFn = useServerFn(getPlatformAdminSession);
  const { data: session, isLoading } = useQuery({
    queryKey: ["platform-admin-session"],
    queryFn: async () => {
      try {
        return await sessionFn();
      } catch {
        return null; // sem sessão / não admin → renderiza o form normalmente
      }
    },
    retry: false,
  });
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [authedButNotAdmin, setAuthedButNotAdmin] = useState(false);
  const [loop, setLoop] = useState(false);

  // Já é admin → entra direto, MAS via effect + hop guard (nunca em render).
  useEffect(() => {
    if (isLoading || !session) return;
    if (bumpRedirectHops() > 2) {
      setLoop(true);
      return;
    }
    navigate({ to: "/platform_admin" });
  }, [session, isLoading, navigate]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setPending(true);
    setAuthedButNotAdmin(false);
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        toast.error("Credenciais inválidas.");
        return;
      }
      const probe = await sessionFn();
      if (!probe) {
        // Autenticou mas não é admin da plataforma: sinaliza e não navega.
        setAuthedButNotAdmin(true);
        return;
      }
      resetRedirectHops();
      qc.invalidateQueries({ queryKey: ["platform-admin-session"] });
      navigate({ to: "/platform_admin" });
    } finally {
      setPending(false);
    }
  }

  async function signOutCurrent() {
    await supabase.auth.signOut();
    qc.clear();
    resetRedirectHops();
    setAuthedButNotAdmin(false);
    toast.success("Sessão encerrada.");
  }

  return (
    <div className="dark min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="rounded-2xl bg-slate-900 ring-1 ring-slate-800 p-6 shadow-xl">
          <div className="flex items-center gap-2.5 mb-5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-800 text-slate-100">
              <ShieldCheck className="h-5 w-5" strokeWidth={1.8} />
            </span>
            <div>
              <div className="text-sm font-bold text-slate-100">Platform Admin</div>
              <div className="text-[11px] text-slate-400">Acesso restrito · Fluxo</div>
            </div>
          </div>

          {loop ? (
            <div className="space-y-3">
              <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2.5 text-[11px] text-red-200">
                Loop de redirecionamento detectado entre login e painel.
                Isso indica estado de sessão inconsistente no navegador.
              </div>
              <button
                onClick={() => {
                  resetRedirectHops();
                  setLoop(false);
                  qc.clear();
                }}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-100 text-xs font-bold text-slate-950 transition hover:bg-white"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Limpar estado e tentar de novo
              </button>
              <button
                onClick={signOutCurrent}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-lg bg-slate-800 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
              >
                <LogOut className="h-3.5 w-3.5" /> Sair de todas as sessões
              </button>
            </div>
          ) : (
            <>
              {authedButNotAdmin && (
                <div className="mb-4 rounded-lg border border-amber-800/60 bg-amber-950/40 px-3 py-2.5 text-[11px] text-amber-200">
                  A sessão atual não é de administrador da plataforma.
                  <button
                    type="button"
                    onClick={signOutCurrent}
                    className="ml-1.5 inline-flex items-center gap-1 font-semibold underline underline-offset-2"
                  >
                    <LogOut className="h-3 w-3" /> Sair da conta atual
                  </button>
                </div>
              )}
              <form onSubmit={onSubmit} className="space-y-3">
                <input
                  type="email"
                  required
                  autoComplete="username"
                  placeholder="E-mail"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-700 bg-slate-950 text-xs text-slate-100 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-700/40"
                />
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-slate-700 bg-slate-950 text-xs text-slate-100 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-700/40"
                />
                <button
                  disabled={pending}
                  className="w-full h-10 rounded-xl bg-slate-100 text-slate-950 text-xs font-bold transition hover:bg-white disabled:opacity-60"
                >
                  {pending ? "Entrando…" : "Entrar"}
                </button>
              </form>
              <p className="mt-4 text-center text-[10px] text-slate-500">
                Admins são provisionados manualmente pelo operador da plataforma.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
