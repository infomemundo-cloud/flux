import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  head: () => ({ meta: [{ title: "Entrar — Fluxo" }, { name: "description", content: "Acesse o painel do Fluxo." }] }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app" });
    });
  }, [navigate]);

  async function handleEmail(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin + "/app" },
        });
        if (error) throw error;
        toast.success("Conta criada. Entrando...");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/app" });
    } catch (err: any) {
      toast.error(err.message ?? "Falha na autenticação");
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    const res = await lovable.auth.signInWithOAuth("google", { redirect_uri: `${window.location.origin}/auth` });
    if (res.error) toast.error(res.error.message ?? "Erro Google");
    else if (!res.redirected) navigate({ to: "/app" });
  }

  return (
    <div className="min-h-screen grid md:grid-cols-2 bg-background">
      <div className="hidden md:flex flex-col justify-between p-10 bg-sidebar text-sidebar-foreground">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <span className="inline-block h-7 w-7 rounded-md bg-primary" /> Fluxo
        </Link>
        <div>
          <h2 className="text-3xl font-bold leading-tight">Nada importante esquecido.</h2>
          <p className="mt-3 text-sidebar-foreground/70 max-w-md">Conversas viram demandas. Demandas têm estado, prazo e responsável. Tudo fica registrado.</p>
        </div>
        <p className="text-xs text-sidebar-foreground/50">© Fluxo</p>
      </div>
      <div className="flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <h1 className="text-2xl font-bold tracking-tight">{mode === "signin" ? "Entrar" : "Criar conta"}</h1>
          <p className="text-sm text-muted-foreground mt-1">Acesse seu motor de demandas.</p>

          <button onClick={handleGoogle} className="mt-6 w-full h-10 border border-border rounded-md hover:bg-secondary font-medium text-sm">
            Continuar com Google
          </button>

          <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
            <div className="h-px flex-1 bg-border" /> OU <div className="h-px flex-1 bg-border" />
          </div>

          <form onSubmit={handleEmail} className="space-y-3">
            <input required type="email" placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background" />
            <input required minLength={6} type="password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full h-10 px-3 rounded-md border border-input bg-background" />
            <button disabled={loading} className="w-full h-10 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-60">
              {loading ? "Aguarde..." : mode === "signin" ? "Entrar" : "Criar conta"}
            </button>
          </form>

          <button className="mt-4 text-sm text-muted-foreground hover:text-foreground" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>
            {mode === "signin" ? "Não tem conta? Criar" : "Já tem conta? Entrar"}
          </button>

          <div className="mt-8 text-xs text-muted-foreground">
            <Link to="/" className="hover:text-foreground">← Voltar</Link>
          </div>
        </div>
      </div>
    </div>
  );
}