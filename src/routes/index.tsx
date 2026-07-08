import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2, Clock, GitBranch, MessageSquare, Shield, Zap } from "lucide-react";

export const Route = createFileRoute("/")({ component: Landing });

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 backdrop-blur sticky top-0 z-10 bg-background/80">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="inline-block h-7 w-7 rounded-md bg-primary" />
            Fluxo
          </div>
          <nav className="flex items-center gap-2 text-sm">
            <Link to="/auth" className="px-3 py-2 rounded-md hover:bg-secondary">Entrar</Link>
            <Link to="/auth" className="px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90">Começar grátis</Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 pt-20 pb-16">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground border border-border rounded-full px-3 py-1 mb-6">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Motor de demandas multi‑canal
          </div>
          <h1 className="text-5xl md:text-6xl font-bold tracking-tight leading-[1.05]">
            Nada importante <span className="text-primary">esquecido</span> — de qualquer conversa até a resolução.
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
            Fluxo é o motor que transforma conversas de WhatsApp, e‑mail, formulários e APIs em demandas com estado, prazo, responsável e histórico completo.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/auth" className="inline-flex items-center gap-2 px-5 py-3 rounded-md bg-primary text-primary-foreground font-medium hover:opacity-90">
              Abrir painel <ArrowRight className="h-4 w-4" />
            </Link>
            <a href="#como-funciona" className="inline-flex items-center gap-2 px-5 py-3 rounded-md border border-border hover:bg-secondary">
              Como funciona
            </a>
          </div>
        </div>
      </section>

      <section id="como-funciona" className="mx-auto max-w-6xl px-6 py-16 border-t border-border">
        <h2 className="text-3xl font-bold tracking-tight">O motor por dentro</h2>
        <p className="text-muted-foreground mt-2 max-w-2xl">Cada mensagem vira uma demanda com ciclo de vida controlado. Estados, responsáveis e prazos garantem que nada trava sem alguém saber.</p>

        <div className="mt-10 grid md:grid-cols-3 gap-4">
          {[
            { icon: MessageSquare, title: "Canais de entrada", desc: "Webhook público conecta WhatsApp (via Evolution API), e‑mail, formulários e qualquer sistema externo." },
            { icon: GitBranch, title: "State machine", desc: "Novo → Em análise → Aguardando cliente → Resolvido → Fechado. Transições auditadas." },
            { icon: Clock, title: "SLA & prazos", desc: "Cada demanda tem prazo. Vencidos ficam em destaque no painel." },
            { icon: Shield, title: "Multi‑tenant", desc: "Organizações isoladas com papéis (owner, admin, agente, viewer) e Row‑Level Security." },
            { icon: Zap, title: "Histórico completo", desc: "Toda mudança de estado, atribuição, prioridade e mensagem fica registrada com autor e horário." },
            { icon: CheckCircle2, title: "Painel operacional", desc: "Fila filtrada, dashboard com contadores por estado, atrasos e produtividade dos últimos 14 dias." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-xl border border-border bg-card p-6">
              <Icon className="h-5 w-5 text-primary" />
              <div className="mt-4 font-semibold">{title}</div>
              <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 border-t border-border">
        <div className="rounded-2xl bg-sidebar text-sidebar-foreground p-10 md:p-14">
          <h2 className="text-3xl font-bold tracking-tight">Pronto para operacionalizar sua operação?</h2>
          <p className="mt-3 text-sidebar-foreground/70 max-w-xl">Crie uma organização, gere um token de webhook e comece a receber demandas hoje.</p>
          <Link to="/auth" className="mt-6 inline-flex items-center gap-2 px-5 py-3 rounded-md bg-primary text-primary-foreground font-medium">
            Entrar no painel <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </section>

      <footer className="mx-auto max-w-6xl px-6 py-10 text-sm text-muted-foreground border-t border-border">
        © {new Date().getFullYear()} Fluxo — Motor de Demandas
      </footer>
    </div>
  );
}
