import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { ShieldCheck, LogIn, CheckCircle, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { acceptPlatformAdminInvite } from "@/lib/platform-admin.functions";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/platform_admin/convite/$token")({
  head: () => ({ meta: [{ title: "Aceitar Convite — Platform Admin" }] }),
  component: AcceptInvite,
});

/**
 * Rota pública para aceite de convite de admin da plataforma (Fase 1.8).
 * 
 * FLUXO:
 * 1. Usuário clica no link recebido por email.
 * 2. Se não estiver logado, pede para fazer login com o email exato do convite.
 * 3. Se estiver logado, pede para definir a senha (mínimo 12 caracteres).
 * 4. Ao submeter, chama acceptPlatformAdminInvite (que valida token, email e cria o user).
 * 5. Em caso de sucesso, redireciona para o /platform_admin.
 */
function AcceptInvite() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const acceptFn = useServerFn(acceptPlatformAdminInvite);

  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [success, setSuccess] = useState(false);
  const [loadingSession, setLoadingSession] = useState(true);

  // Verifica sessão atual ao montar
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionEmail(session?.user?.email ?? null);
      setLoadingSession(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user?.email ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  const acceptMutation = useMutation({
    mutationFn: () => acceptFn({ data: { token, password } }),
    onSuccess: () => {
      setSuccess(true);
      toast.success("Convite aceito! Redirecionando...");
      setTimeout(() => navigate({ to: "/platform_admin" }), 1500);
    },
    onError: (e) => {
      toast.error(friendlyError(e));
    },
  });

  const handleLogin = async () => {
    // Redireciona para o login do admin, passando o token na URL para voltar depois
    navigate({ to: "/platform_admin/login", search: { redirect: `/platform_admin/convite/${token}` } });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < 12) {
      toast.error("A senha deve ter pelo menos 12 caracteres.");
      return;
    }
    acceptMutation.mutate();
  };

  if (loadingSession) {
    return (
      <div className="dark min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="text-xs text-slate-500">Verificando sessão...</div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="dark min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="w-full max-w-sm rounded-2xl bg-slate-900 ring-1 ring-slate-800 p-6 text-center">
          <div className="mx-auto w-12 h-12 rounded-full bg-emerald-900/30 flex items-center justify-center mb-4">
            <CheckCircle className="h-6 w-6 text-emerald-400" />
          </div>
          <h1 className="text-lg font-bold text-slate-100 mb-2">Convite Aceito!</h1>
          <p className="text-xs text-slate-400">
            Sua conta de administrador foi criada com sucesso. Redirecionando para o painel...
          </p>
        </div>
      </div>
    );
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
              <div className="text-[11px] text-slate-400">Aceitar Convite</div>
            </div>
          </div>

          {!sessionEmail ? (
            // Estado 1: Não logado
            <div className="space-y-4">
              <div className="rounded-lg border border-amber-800/60 bg-amber-950/40 px-3 py-2.5 text-[11px] text-amber-200 flex gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                <p>
                  Você precisa fazer login com o <strong>email exato</strong> que recebeu o convite para poder aceitá-lo.
                </p>
              </div>
              <button
                onClick={handleLogin}
                className="w-full h-10 rounded-xl bg-slate-100 text-slate-950 text-xs font-bold transition hover:bg-white flex items-center justify-center gap-2"
              >
                <LogIn className="h-3.5 w-3.5" /> Fazer Login
              </button>
            </div>
          ) : (
            // Estado 2: Logado - Mostrar form de senha
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="rounded-lg bg-slate-800/50 p-3 text-[11px] text-slate-300">
                <p className="mb-1">Logado como:</p>
                <p className="font-semibold text-slate-100 break-all">{sessionEmail}</p>
                <p className="mt-2 text-slate-400">
                  Defina uma senha forte para ativar seu acesso de administrador.
                </p>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">
                  Nova Senha (mínimo 12 caracteres)
                </label>
                <input
                  type="password"
                  required
                  minLength={12}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full h-10 px-3 rounded-xl border border-slate-700 bg-slate-950 text-xs text-slate-100 outline-none transition focus:border-slate-500 focus:ring-2 focus:ring-slate-700/40"
                />
              </div>

              <button
                type="submit"
                disabled={acceptMutation.isPending || password.length < 12}
                className="w-full h-10 rounded-xl bg-slate-100 text-slate-950 text-xs font-bold transition hover:bg-white disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {acceptMutation.isPending ? "Processando..." : "Aceitar Convite"}
              </button>

              <div className="text-center">
                <button
                  type="button"
                  onClick={async () => {
                    await supabase.auth.signOut();
                    setSessionEmail(null);
                  }}
                  className="text-[10px] text-slate-500 hover:text-slate-300 underline underline-offset-2"
                >
                  Não é este email? Sair e usar outra conta
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
