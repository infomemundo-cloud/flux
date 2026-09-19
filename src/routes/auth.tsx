import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowRight, Inbox, Loader2, Lock, Mail, MessageCircle, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [{ title: "Entrar — Fluxo" }, { name: "description", content: "Acesse o painel do Fluxo." }],
  }),
  component: AuthPage,
});

/** SVG vetorial oficial do Google (4 cores). */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.275c0-.79-.07-1.54-.19-2.275H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.815z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"
      />
    </svg>
  );
}

/**
 * Logo + badge de marca.
 * dark = painel esquerdo (fundo navy); fixedLight = coluna direita, que é
 * light fixa em todos os temas (marca legível sobre o slate sem depender
 * de tokens de tema).
 */
function BrandMark({ dark, fixedLight }: { dark?: boolean; fixedLight?: boolean }) {
  const iconBox = dark
    ? "bg-sky-500/15 ring-1 ring-sky-400/30"
    : fixedLight
      ? "bg-sky-600/10 ring-1 ring-sky-600/25"
      : "bg-sky-600/10 ring-1 ring-sky-600/25 dark:bg-sky-500/15 dark:ring-sky-400/30";
  const iconColor = dark ? "text-sky-300" : fixedLight ? "text-sky-600" : "text-sky-600 dark:text-sky-300";
  const nameColor = dark ? "text-white" : fixedLight ? "text-slate-900" : "text-foreground";
  const badgeClass = dark
    ? "border border-white/15 bg-white/10 text-sky-200"
    : fixedLight
      ? "border border-slate-200 bg-slate-100 text-slate-500"
      : "border border-border bg-secondary text-muted-foreground";
  return (
    <div className="flex items-center gap-2.5">
      <span className={`grid h-9 w-9 place-items-center rounded-xl ${iconBox}`}>
        <Inbox className={`h-5 w-5 ${iconColor}`} strokeWidth={2.2} />
      </span>
      <span className={`text-lg font-bold tracking-tight ${nameColor}`}>Fluxo</span>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${badgeClass}`}
      >
        SaaS Platform
      </span>
    </div>
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        const dest = safeRedirect();
        navigate({ to: dest, replace: true });
      } else {
        setChecking(false);
      }
    });
  }, [navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: window.location.origin + "/app" },
        });
        if (error) throw error;
        toast.success("Conta criada. Entrando...");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: safeRedirect() });
    } catch (err: any) {
      toast.error(err.message ?? "Falha na autenticação");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: `${window.location.origin}/auth` },
      });
      if (error) throw error;
    } catch (err: any) {
      toast.error(err.message ?? "Erro ao conectar com Google");
    }
  }

  /** Recuperação de senha real: Supabase envia o e-mail com redirect pro /auth. */
  async function handleForgot() {
    if (!email.trim()) {
      toast.error("Digite seu e-mail no campo acima para recuperar a senha.");
      return;
    }
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth`,
      });
      if (error) throw error;
      toast.success("E-mail de recuperação enviado. Confira sua caixa de entrada.");
    } catch (err: any) {
      toast.error(err?.message ?? "Não foi possível enviar o e-mail de recuperação.");
    }
  }

  function safeRedirect(): string {
    try {
      const dest = sessionStorage.getItem("post-login-redirect");
      if (dest && dest.startsWith("/")) {
        sessionStorage.removeItem("post-login-redirect");
        return dest;
      }
    } catch {}
    return "/app";
  }

  return (
    /* min-h-dvh = altura real do viewport (sem contar chrome do navegador).
       Layout compacto por padrão (cabe em ~640–768px de altura sem rolagem);
       o visual generoso volta como realce em telas altas (min-height:860px). */
    <div className="grid min-h-dvh bg-background lg:grid-cols-2">
      {/* ─────────────────────────────────────────────────────────────
          PAINEL ESQUERDO — branding fixo dark (superfície de marca,
          independente do tema): gradiente + malha de grade + glow.
          Em telas baixas o mockup aparece em versão reduzida (sem a
          citação e sem o chip flutuante); em telas altas, completo.
      ───────────────────────────────────────────────────────────── */}
      <div className="relative hidden overflow-hidden bg-slate-950 p-8 lg:flex lg:flex-col lg:justify-between [@media(min-height:860px)]:p-12">
        {/* Malha de grade suave */}
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.07)_1px,transparent_1px)] bg-[size:32px_32px]" />
        {/* Gradiente radial sky no topo + glow inferior */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(2,132,199,0.28),transparent_55%)]" />
        <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-sky-500/15 blur-3xl" />

        {/* Header: logo + badge */}
        <div className="relative z-10">
          <BrandMark dark />
        </div>

        {/* Copy principal + mockup glassmorphism da Fila */}
        <div className="relative z-10 space-y-6 [@media(min-height:860px)]:space-y-10">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white [@media(min-height:860px)]:text-4xl">
              Nada importante esquecido.
            </h1>
            <p className="mt-3 max-w-md text-slate-300 [@media(min-height:860px)]:mt-4">
              Conversas viram demandas. Demandas têm estado, prazo e responsável. Tudo fica registrado.
            </p>
          </div>
          {/* Proof-of-product: card glass simulando um evento real da Fila */}
          <div className="relative max-w-sm">
            <div className="rounded-2xl border border-white/10 bg-white/[0.06] p-3 shadow-[0_24px_60px_-24px_rgba(2,132,199,0.45)] backdrop-blur-md [@media(min-height:860px)]:p-4">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-semibold text-sky-300">DM-038F39</span>
                <span className="text-[11px] text-slate-400">há 3 min</span>
              </div>
              <div className="mt-2 flex-2.5 flex items-center gap-2.5">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-700/80 text-[11px] font-bold text-slate-100">
                  W
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">Wagner</div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                    <span className="text-[11px] text-slate-300">Aguardando resposta</span>
                  </div>
                </div>
              </div>
              {/* Citação do mockup: só em telas altas (economiza ~40px) */}
              <div className="mt-3 hidden truncate rounded-lg bg-slate-900/60 px-2.5 py-1.5 text-[11px] text-slate-300 [@media(min-height:860px)]:block">
                "Preciso remarcar a entrega de hoje…"
              </div>
            </div>
            {/* Chip flutuante: só em telas altas (não soma altura na sua) */}
            <div className="absolute -bottom-5 -right-4 hidden items-center gap-2 rounded-xl border border-white/10 bg-slate-900/85 px-3 py-2 backdrop-blur-md [@media(min-height:860px)]:flex">
              <MessageCircle className="h-3.5 w-3.5 text-emerald-400" />
              <span className="text-[11px] font-medium text-slate-300">WhatsApp conectado</span>
            </div>
          </div>
        </div>

        {/* Footer do painel: status do sistema + selo de integração */}
        <div className="relative z-10 flex items-center gap-4 text-xs text-slate-400">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
            Todos os sistemas operacionais
          </span>
          <span className="h-3 w-px bg-slate-700" />
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-sky-400" />
            Integração WhatsApp via Evolution API
          </span>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          PAINEL DIREITO — coluna light fixa (slate) com o formulário em
          card branco elevado. Compacto por padrão; generoso em telas altas.
      ───────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-center bg-slate-50 p-5 sm:p-8 [@media(min-height:860px)]:p-10">
        <div className="w-full max-w-md">
          {/* Marca no mobile (painel esquerdo some abaixo de lg) */}
          <div className="mb-5 flex justify-center lg:hidden [@media(min-height:860px)]:mb-6">
            <BrandMark fixedLight />
          </div>

          {checking ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
            </div>
          ) : (
            <>
              {/* Card do formulário */}
              <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-xl shadow-slate-200/50 sm:p-8 [@media(min-height:860px)]:p-10">
                <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                  {mode === "signin" ? "Bem-vindo de volta" : "Crie sua conta"}
                </h1>
                <p className="mt-1 text-sm text-slate-500 [@media(min-height:860px)]:mt-1.5">
                  {mode === "signin"
                    ? "Insira suas credenciais para gerenciar a fila de demandas."
                    : "Comece a transformar conversas em demandas hoje."}
                </p>

                {/* Botão Google (SVG oficial + acabamento refinado) */}
                <button
                  type="button"
                  onClick={handleGoogle}
                  className="mt-6 flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border border-slate-200 bg-white font-medium text-slate-700 shadow-sm transition-all hover:border-slate-300 hover:bg-slate-50/50 active:scale-[0.99] [@media(min-height:860px)]:mt-8 [@media(min-height:860px)]:h-11"
                >
                  <GoogleIcon className="h-[18px] w-[18px]" />
                  Continuar com Google
                </button>

                {/* Divisor */}
                <div className="my-5 flex items-center gap-3 [@media(min-height:860px)]:my-6">
                  <div className="h-px flex-1 bg-slate-200" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Ou continuar com e-mail
                  </span>
                  <div className="h-px flex-1 bg-slate-200" />
                </div>

                <form className="space-y-3 [@media(min-height:860px)]:space-y-4" onSubmit={handleEmail}>
                  <div>
                    <label htmlFor="email" className="mb-1 block text-xs font-semibold text-slate-700 [@media(min-height:860px)]:mb-1.5">
                      E-mail corporativo
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="email"
                        type="email"
                        required
                        placeholder="voce@empresa.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50/50 pl-9 pr-3 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-500/20 [@media(min-height:860px)]:h-11"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-1 flex items-center justify-between [@media(min-height:860px)]:mb-1.5">
                      <label htmlFor="password" className="text-xs font-semibold text-slate-700">
                        Senha
                      </label>
                      {mode === "signin" && (
                        <button
                          type="button"
                          onClick={handleForgot}
                          className="text-xs font-semibold text-sky-600 transition hover:text-sky-700"
                        >
                          Esqueceu a senha?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <input
                        id="password"
                        type="password"
                        required
                        minLength={6}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50/50 pl-9 pr-3 text-sm text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-sky-500 focus:bg-white focus:ring-2 focus:ring-sky-500/20 [@media(min-height:860px)]:h-11"
                      />
                    </div>
                  </div>

                  {/* Botão de ação com seta */}
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-sky-600 font-semibold text-white shadow-md shadow-sky-600/20 transition-all hover:bg-sky-500 active:bg-sky-700 disabled:pointer-events-none disabled:opacity-60 [@media(min-height:860px)]:h-11"
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {loading
                      ? mode === "signin"
                        ? "Entrando..."
                        : "Criando conta..."
                      : mode === "signin"
                        ? "Entrar"
                        : "Criar conta"}
                    {!loading && <ArrowRight className="h-4 w-4" />}
                  </button>
                </form>
              </div>

              {/* Rodapé e links — centralizados abaixo do card */}
              <p className="mt-5 text-center text-sm text-slate-500 [@media(min-height:860px)]:mt-6">
                {mode === "signin" ? "Ainda não tem conta?" : "Já tem conta?"}{" "}
                <button
                  type="button"
                  onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                  className="font-semibold text-sky-600 transition hover:text-sky-700"
                >
                  {mode === "signin" ? "Cadastre-se" : "Entrar"}
                </button>
              </p>
              <div className="mt-2 text-center [@media(min-height:860px)]:mt-3">
                <Link to="/" className="text-xs text-slate-400 transition hover:text-slate-600">
                  ← Voltar para o site
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}