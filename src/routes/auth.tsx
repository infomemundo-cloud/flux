import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  Copy,
  Inbox,
  Loader2,
  Lock,
  Mail,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar — Fluxo" },
      {
        name: "description",
        content:
          "Acesse sua organização no Fluxo: fila única para WhatsApp e webhooks, SLA vivo e histórico auditado.",
      },
    ],
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

function BrandMark({ onBrand }: { onBrand?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <span
        className={`grid h-9 w-9 place-items-center rounded-xl ${
          onBrand ? "bg-white/15 ring-1 ring-white/25" : "bg-primary/10 ring-1 ring-primary/25"
        }`}
      >
        <Inbox className={`h-5 w-5 ${onBrand ? "text-white" : "text-primary"}`} strokeWidth={2.2} />
      </span>
      <span className={`text-lg font-bold tracking-tight ${onBrand ? "text-white" : "text-foreground"}`}>
        Fluxo
      </span>
      <span
        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${
          onBrand
            ? "border border-white/20 bg-white/10 text-white/80"
            : "border border-border bg-secondary text-muted-foreground"
        }`}
      >
        Motor de demandas
      </span>
    </div>
  );
}

const BRAND_BULLETS = [
  "Fila única: WhatsApp, webhooks e APIs no mesmo lugar",
  "SLA vivo: atrasos sobem pro topo antes do cliente reclamar",
  "Cobrança Pix com chave copiável em um toque",
  "Histórico auditado: autor e horário em cada ação",
];

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
        toast.success("Conta criada com sucesso! Entrando...");
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
    <div className="grid min-h-dvh bg-background lg:grid-cols-2">
      {/* ── PAINEL DE MARCA ── */}
      <div className="relative hidden overflow-hidden bg-primary p-10 lg:flex lg:flex-col lg:justify-between xl:p-14">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:32px_32px]" />
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.14),transparent_55%)]" />
        <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-white/10 blur-3xl" />

        <div className="relative z-10">
          <BrandMark onBrand />
        </div>

        <div className="relative z-10 space-y-8">
          <div>
            <h1 className="max-w-md text-3xl font-bold leading-tight tracking-tight text-white xl:text-4xl">
              Nenhuma conversa esquecida. Nenhum cliente no vácuo.
            </h1>
            <p className="mt-4 max-w-md text-sm leading-relaxed text-white/80">
              O Fluxo transforma mensagens e chamadas de API em demandas com dono, prazo e
              histórico completo. Sua equipe abre o painel sabendo por onde começar.
            </p>
          </div>

          <div className="relative max-w-sm">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.45)] backdrop-blur-md">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[11px] font-semibold text-white/70">DM-038F39</span>
                <span className="text-[11px] text-white/60">há 3 min</span>
              </div>
              <div className="mt-3 space-y-2">
                <div className="max-w-[85%] rounded-xl rounded-tl-none bg-white/10 px-3 py-1.5 text-[11px] leading-relaxed text-white/90">
                  Preciso remarcar a entrega de hoje…
                </div>
                <div className="ml-auto max-w-[90%] rounded-xl rounded-tr-none bg-white/15 px-3 py-1.5 text-[11px] leading-relaxed text-white">
                  Segue o Pix pra remarcação 🙌
                  <span className="mt-1 flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold">Chave Pix: 95159606300</span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-white/20 px-1.5 py-0.5 text-[9px] font-semibold">
                      <Copy className="h-2.5 w-2.5" /> Copiar chave
                    </span>
                  </span>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-4 -right-3 flex items-center gap-2 rounded-xl border border-white/15 bg-black/20 px-3 py-2 backdrop-blur-md">
              <MessageCircle className="h-3.5 w-3.5 text-emerald-300" />
              <span className="text-[11px] font-medium text-white/90">WhatsApp conectado</span>
            </div>
          </div>

          <ul className="space-y-2.5">
            {BRAND_BULLETS.map((b) => (
              <li key={b} className="flex items-center gap-2.5 text-sm text-white/90">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white/15">
                  <Check className="h-3 w-3 text-white" strokeWidth={3} />
                </span>
                {b}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 flex items-center gap-4 text-xs text-white/70">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
            Todos os sistemas operacionais
          </span>
          <span className="h-3 w-px bg-white/20" />
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-white/80" />
            Dados isolados por organização (RLS)
          </span>
        </div>
      </div>

      {/* ── COLUNA DO FORMULÁRIO ── */}
      <div className="flex items-center justify-center bg-background p-5 sm:p-8">
        <div className="w-full max-w-md">
          <div className="mb-6 flex justify-center lg:hidden">
            <BrandMark />
          </div>

          {checking ? (
            <div className="flex h-64 items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-pop)] sm:p-8">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {mode === "signin" ? "Bem-vindo de volta" : "Crie sua organização"}
                </h1>
                <p className="mt-1.5 text-sm text-muted-foreground">
                  {mode === "signin"
                    ? "Entre para continuar atendendo pela fila."
                    : "Leva menos de um minuto. Sem cartão de crédito."}
                </p>

                <button
                  type="button"
                  onClick={handleGoogle}
                  className="mt-6 flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-card font-medium text-foreground shadow-sm transition hover:bg-secondary active:scale-[0.99]"
                >
                  <GoogleIcon className="h-[18px] w-[18px]" />
                  Continuar com Google
                </button>

                <div className="my-5 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    ou continue com e-mail
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                <form className="space-y-4" onSubmit={handleEmail}>
                  <div>
                    <label
                      htmlFor="email"
                      className="mb-1.5 block text-xs font-semibold text-foreground"
                    >
                      E-mail
                    </label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                      <input
                        id="email"
                        type="email"
                        required
                        placeholder="voce@empresa.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="h-10 w-full rounded-lg border border-border/60 bg-background pl-9 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="mb-1.5 flex items-center justify-between">
                      <label
                        htmlFor="password"
                        className="text-xs font-semibold text-foreground"
                      >
                        Senha
                      </label>
                      {mode === "signin" && (
                        <button
                          type="button"
                          onClick={handleForgot}
                          className="text-xs font-semibold text-primary transition hover:underline"
                        >
                          Esqueceu a senha?
                        </button>
                      )}
                    </div>
                    <div className="relative">
                      <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/70" />
                      <input
                        id="password"
                        type="password"
                        required
                        minLength={6}
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="h-10 w-full rounded-lg border border-border/60 bg-background pl-9 pr-3 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                      />
                    </div>
                    {mode === "signup" && (
                      <p className="mt-1 text-[11px] text-muted-foreground">Mínimo de 6 caracteres.</p>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary font-semibold text-primary-foreground shadow-[var(--shadow-card)] transition hover:brightness-110 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-60"
                  >
                    {loading && <Loader2 className="h-4 w-4 animate-spin" />}
                    {loading
                      ? mode === "signin"
                        ? "Entrando..."
                        : "Criando conta..."
                      : mode === "signin"
                        ? "Entrar"
                        : "Criar conta grátis"}
                    {!loading && <ArrowRight className="h-4 w-4" />}
                  </button>
                </form>
              </div>

              <p className="mt-4 flex items-center justify-center gap-2 text-center text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />
                Ambiente seguro · toda ação é auditada com autor e horário
              </p>

              <p className="mt-5 text-center text-sm text-muted-foreground">
                {mode === "signin" ? "Ainda não tem conta?" : "Já tem conta?"}{" "}
                <button
                  type="button"
                  onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                  className="font-semibold text-primary transition hover:underline"
                >
                  {mode === "signin" ? "Cadastre-se" : "Entrar"}
                </button>
              </p>
              <div className="mt-2 text-center">
                <Link
                  to="/"
                  className="text-xs text-muted-foreground/70 transition hover:text-foreground"
                >
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
