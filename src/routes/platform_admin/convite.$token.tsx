import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import { ShieldCheck, LogIn, AlertCircle, XCircle, LogOut } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  getPlatformAdminInviteInfo,
  acceptPlatformAdminInviteNew,
  acceptPlatformAdminInviteExisting,
} from "@/lib/platform-admin.functions";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/platform_admin/convite/$token")({
  head: () => ({ meta: [{ title: "Aceitar Convite — Platform Admin" }] }),
  component: AcceptInvite,
});

/**
 * Rota pública de aceite de convite de admin (Fase 1.8, FLUXO CORRIGIDO).
 *
 * DOIS CAMINHOS decididos por getPlatformAdminInviteInfo:
 * - Email NOVO (sem conta): a própria página coleta a senha (mín. 12) e
 *   cria tudo — NÃO exige login antes (login era beco sem saída: a conta
 *   não existia). Após criar, faz signIn automático e entra no shell.
 * - Email JÁ EXISTENTE (conta criada depois do convite): pede login com o
 *   email exato e um clique de confirmação promove.
 * Estados terminais (revogado/expirado/aceito/inexistente) → card de erro.
 */
function AcceptInvite() {
  const { token } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const infoFn = useServerFn(getPlatformAdminInviteInfo);
  const acceptNewFn = useServerFn(acceptPlatformAdminInviteNew);
  const acceptExistingFn = useServerFn(acceptPlatformAdminInviteExisting);

  const [password, setPassword] = useState("");
  const [sessionEmail, setSessionEmail] = useState<string | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);

  const { data: info, isLoading } = useQuery({
    queryKey: ["platform-admin-invite-info", token],
    queryFn: () => infoFn({ data: { token } }),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionEmail(session?.user?.email?.toLowerCase() ?? null);
      setSessionChecked(true);
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionEmail(session?.user?.email?.toLowerCase() ?? null);
    });
    return () => subscription.unsubscribe();
  }, []);

  const acceptNewMutation = useMutation({
    mutationFn: () => acceptNewFn({ data: { token, password } }),
    onSuccess: async (res) => {
      // Auto-login com a senha recém-definida (obtém sessão pra entrar no shell)
      const { error } = await supabase.auth.signInWithPassword({
        email: res.email,
        password,
      });
      if (error) {
        toast.success("Conta criada! Faça login para continuar.");
        navigate({ to: "/platform_admin/login" });
        return;
      }
      qc.invalidateQueries({ queryKey: ["platform-admin-session"] });
      toast.success("Convite aceito! Bem-vindo ao Platform Admin.");
      navigate({ to: "/platform_admin" });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const acceptExistingMutation = useMutation({
    mutationFn: () => acceptExistingFn({ data: { token } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["platform-admin-session"] });
      toast.success("Convite aceito! Bem-vindo ao Platform Admin.");
      navigate({ to: "/platform_admin" });
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const shell = (inner: React.ReactNode) => (
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
          {inner}
        </div>
      </div>
    </div>
  );

  if (isLoading || !sessionChecked) {
    return shell(<div className="text-xs text-slate-500">Verificando convite...</div>);
  }

  // Estados terminais
  if (!info || info.status !== "open") {
    const msg =
      info?.status === "revoked"
        ? "Convite revogado por um administrador."
        : info?.status === "expired"
          ? "Convite expirado."
          : info?.status === "accepted"
            ? "Convite já foi aceito."
            : "Convite não encontrado.";
    return shell(
      <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-3 py-2.5 text-[11px] text-red-200 flex gap-2">
        <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
        <p>{msg}</p>
      </div>,
    );
  }

  // Caminho 1: email NOVO → define a senha aqui mesmo (sem login prévio)
  if (!info.accountExists) {
    return shell(
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (password.length < 12) {
            toast.error("A senha deve ter pelo menos 12 caracteres.");
            return;
          }
          acceptNewMutation.mutate();
        }}
        className="space-y-4"
      >
        <div className="rounded-lg bg-slate-800/50 p-3 text-[11px] text-slate-300">
          <p className="mb-1">Você foi convidado como:</p>
          <p className="font-semibold text-slate-100 break-all">{info.email}</p>
          <p className="mt-2 text-slate-400">
            Defina uma senha forte (mínimo 12 caracteres) para ativar seu acesso
            de administrador. Nenhum login prévio é necessário.
          </p>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-400 mb-1.5">
            Nova senha (mínimo 12 caracteres)
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
          disabled={acceptNewMutation.isPending || password.length < 12}
          className="w-full h-10 rounded-xl bg-slate-100 text-slate-950 text-xs font-bold transition hover:bg-white disabled:opacity-50"
        >
          {acceptNewMutation.isPending ? "Criando conta..." : "Criar conta e aceitar"}
        </button>
      </form>,
    );
  }

  // Caminho 2: email JÁ EXISTENTE → login com o email exato + confirmação
  if (!sessionEmail) {
    return shell(
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/40 px-3 py-2.5 text-[11px] text-amber-200 flex gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Este convite é para <strong>{info.email}</strong>, que já possui conta.
            Faça login com esse email exato para aceitar.
          </p>
        </div>
        <button
          onClick={() =>
            navigate({
              to: "/platform_admin/login",
              search: { redirect: `/platform_admin/convite/${token}` },
            })
          }
          className="w-full h-10 rounded-xl bg-slate-100 text-slate-950 text-xs font-bold transition hover:bg-white flex items-center justify-center gap-2"
        >
          <LogIn className="h-3.5 w-3.5" /> Fazer Login
        </button>
      </div>,
    );
  }

  if (sessionEmail !== info.email.toLowerCase()) {
    return shell(
      <div className="space-y-4">
        <div className="rounded-lg border border-amber-800/60 bg-amber-950/40 px-3 py-2.5 text-[11px] text-amber-200 flex gap-2">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <p>
            Você está logado como <strong>{sessionEmail}</strong>, mas o convite é
            para <strong>{info.email}</strong>.
          </p>
        </div>
        <button
          onClick={async () => {
            await supabase.auth.signOut();
            setSessionEmail(null);
          }}
          className="w-full h-10 rounded-xl bg-slate-800 text-slate-200 text-xs font-semibold transition hover:bg-slate-700 flex items-center justify-center gap-2"
        >
          <LogOut className="h-3.5 w-3.5" /> Sair e usar outra conta
        </button>
      </div>,
    );
  }

  return shell(
    <div className="space-y-4">
      <div className="rounded-lg bg-slate-800/50 p-3 text-[11px] text-slate-300">
        <p className="mb-1">Logado como:</p>
        <p className="font-semibold text-slate-100 break-all">{sessionEmail}</p>
        <p className="mt-2 text-slate-400">Confirme para ativar seu acesso de administrador.</p>
      </div>
      <button
        onClick={() => acceptExistingMutation.mutate()}
        disabled={acceptExistingMutation.isPending}
        className="w-full h-10 rounded-xl bg-slate-100 text-slate-950 text-xs font-bold transition hover:bg-white disabled:opacity-50"
      >
        {acceptExistingMutation.isPending ? "Confirmando..." : "Confirmar acesso de administrador"}
      </button>
    </div>,
  );
}
