import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownWideNarrow,
  ArrowRight,
  Check,
  ClipboardList,
  Filter,
  GitBranch,
  History,
  Inbox,
  LayoutDashboard,
  Mail,
  MessageCircle,
  Plus,
  Search,
  ShieldCheck,
  Timer,
  Users,
  Webhook,
  Zap,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({ component: Landing });

/**
 * Revela o bloco com fade-in/slide-up quando entra na viewport.
 * Sem lib nova: IntersectionObserver + transições do Tailwind.
 * Respeita prefers-reduced-motion (mostra direto, sem animação).
 */
function Reveal({
  children,
  className = "",
  delay = 0,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          obs.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-6 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Mockup decorativo do painel REAL em tamanho de janela verdadeira
 * (max-w-[560px]): fila com header/filtros/ordem + chat aberto.
 * Réplica fiel das regras do produto: atrasadas/urgentes primeiro
 * (pip vermelho), faixa de estado à esquerda, prévia da última mensagem.
 */
function ProductMockup() {
  const queue = [
    {
      initials: "W",
      name: "Wagner",
      time: "há 2 h",
      preview: "Preciso remarcar a entrega de hoje…",
      stripe: "var(--state-aguardando)",
      pip: true,
    },
    {
      initials: "E",
      name: "Emplast",
      time: "há 5 min",
      preview: "Orçamento do rack de aço carbono",
      stripe: "var(--state-novo)",
      pip: true,
    },
    {
      initials: "R",
      name: "Rute Lopes",
      time: "há 26 min",
      preview: "vai demorar ainda?",
      stripe: "var(--state-novo)",
      pip: false,
    },
    {
      initials: "S",
      name: "Sergio Soares",
      time: "há 1 h",
      preview: "[Imagem]",
      stripe: "var(--state-analise)",
      pip: false,
    },
  ];
  const filterOptions = [
    { label: "Todas", dot: "bg-muted-foreground/30", active: true },
    { label: "Novo", dot: "bg-[var(--state-novo)]", active: false },
    { label: "Em análise", dot: "bg-[var(--state-analise)]", active: false },
    { label: "Aguardando cliente", dot: "bg-[var(--state-aguardando)]", active: false },
    { label: "Concluído", dot: "bg-[var(--state-resolvido)]", active: false },
  ];
  return (
    <div className="relative mx-auto w-full max-w-[560px] lg:mx-0" aria-hidden="true">
      {/* Glow radial suave atrás da janela */}
      <div className="pointer-events-none absolute -inset-6 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.14),transparent_60%)]" />
      <div className="relative overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-primary/10">
        {/* Chrome do navegador */}
        <div className="flex items-center gap-2 border-b border-border bg-secondary/60 px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-destructive/70" />
          <span className="h-2 w-2 rounded-full bg-amber-400/80" />
          <span className="h-2 w-2 rounded-full bg-emerald-400/80" />
          <div className="ml-2 flex-1 truncate rounded-md border border-border bg-background px-2.5 py-0.5 text-[10px] text-muted-foreground">
            app.fluxo.com/o/acme/fila
          </div>
        </div>
        {/* Corpo: sidebar + fila (header/filtros/ordem reais) + chat aberto */}
        <div className="grid grid-cols-1 sm:grid-cols-[2rem_minmax(0,1fr)_minmax(0,1.15fr)]">
          {/* Sidebar de ícones */}
          <div className="hidden sm:flex flex-col items-center gap-2.5 border-r border-border bg-sidebar py-3">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-sidebar-accent">
              <Inbox className="h-3 w-3 text-sidebar-accent-foreground" />
            </span>
            <span className="h-3.5 w-3.5 rounded bg-sidebar-accent/60" />
            <span className="h-3.5 w-3.5 rounded bg-sidebar-accent/60" />
            <span className="h-3.5 w-3.5 rounded bg-sidebar-accent/60" />
          </div>
          {/* Fila */}
          <div className="relative hidden sm:flex flex-col border-r border-border bg-background">
            <div className="flex items-center justify-between border-b border-border px-2 py-1.5">
              <div className="flex items-center gap-1">
                <span className="grid h-5 w-5 place-items-center rounded bg-primary/10">
                  <Inbox className="h-3 w-3 text-primary" />
                </span>
                <span className="text-[10px] font-bold text-foreground">Fila</span>
                <span className="rounded-full bg-primary/10 px-1 py-px text-[8px] font-semibold text-primary">49</span>
              </div>
              <div className="flex items-center gap-0.5">
                <span className="grid h-5 w-5 place-items-center rounded text-muted-foreground">
                  <Search className="h-2.5 w-2.5" />
                </span>
                <span className="relative grid h-5 w-5 place-items-center rounded text-muted-foreground">
                  <Filter className="h-2.5 w-2.5" />
                  <span className="absolute right-0 top-0 h-1 w-1 rounded-full bg-primary" />
                </span>
                <span className="grid h-5 w-5 place-items-center rounded bg-primary">
                  <Plus className="h-2.5 w-2.5 text-primary-foreground" />
                </span>
              </div>
            </div>
            {/* Menu de filtro aberto (mesmos estados do produto real) */}
            <div className="absolute right-1.5 top-8 z-10 w-28 rounded-md border border-border bg-card p-0.5 shadow-[var(--shadow-pop)]">
              {filterOptions.map((f) => (
                <div
                  key={f.label}
                  className={`flex items-center gap-1 rounded px-1 py-0.5 text-[9px] ${
                    f.active ? "font-semibold text-primary" : "text-foreground"
                  }`}
                >
                  <span className={`h-1 w-1 shrink-0 rounded-full ${f.dot}`} />
                  {f.label}
                  {f.active && <Check className="ml-auto h-2.5 w-2.5" />}
                </div>
              ))}
            </div>
            <div className="space-y-1 p-1.5 pt-2.5">
              {queue.map((q) => (
                <div
                  key={q.name}
                  className="relative flex gap-1.5 overflow-hidden rounded border border-border/70 bg-card py-1.5 pl-2 pr-1.5"
                >
                  <span className="absolute left-0 top-0 h-full w-[2px]" style={{ background: q.stripe }} />
                  <span className="relative grid h-6 w-6 shrink-0 place-items-center rounded-full bg-secondary text-[9px] font-bold text-foreground">
                    {q.initials}
                    {q.pip && (
                      <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-destructive ring-1 ring-card" />
                    )}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-1">
                      <span className="truncate text-[9px] font-semibold text-foreground">{q.name}</span>
                      <span className="shrink-0 text-[8px] text-muted-foreground">{q.time}</span>
                    </span>
                    <span className="mt-px block truncate text-[8px] text-muted-foreground">{q.preview}</span>
                  </span>
                </div>
              ))}
              {/* Paginação real da fila */}
              <div className="flex justify-center pt-0.5">
                <span className="rounded border border-border bg-card px-1.5 py-0.5 text-[8px] font-medium text-foreground">
                  Mais demandas (20/49)
                </span>
              </div>
            </div>
          </div>
          {/* Chat aberto — a conversa do primeiro card da fila */}
          <div className="flex flex-col bg-background">
            <div className="flex items-center justify-between border-b border-border px-2.5 py-1.5">
              <div className="flex min-w-0 items-center gap-1.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-secondary text-[8px] font-bold text-foreground">
                  W
                </span>
                <span className="truncate text-[10px] font-semibold text-foreground">Wagner</span>
                <span className="hidden rounded font-mono text-[8px] text-muted-foreground min-[420px]:inline">
                  DM-038F39
                </span>
              </div>
              <span className="pill-red inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-px text-[8px] font-bold">
                <span className="h-1 w-1 rounded-full bg-[var(--pill-red-fg)] animate-alert-blink" />
                SLA -2h
              </span>
            </div>
            <div className="space-y-1.5 p-2.5">
              <div className="max-w-[85%] rounded-lg rounded-tl-none border border-border bg-card px-2 py-1 text-[9px] text-foreground">
                Preciso remarcar a entrega de hoje…
              </div>
              <div className="ml-auto max-w-[85%] rounded-lg rounded-tr-none border border-primary/20 bg-primary/10 px-2 py-1 text-[9px] text-foreground">
                Oi Wagner! Já estou vendo aqui pra você ✔
              </div>
            </div>
            <div className="mt-auto flex items-center gap-1.5 border-t border-border px-2.5 py-1.5">
              <div className="h-5 flex-1 rounded border border-border bg-background" />
              <span className="grid h-5 w-5 place-items-center rounded bg-primary">
                <ArrowRight className="h-2.5 w-2.5 text-primary-foreground" />
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Landing() {
  const [user, setUser] = useState<{ email?: string | null; name?: string | null } | null | undefined>(undefined);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user;
      setUser(u ? { email: u.email, name: (u.user_metadata as any)?.full_name ?? (u.user_metadata as any)?.name ?? null } : null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      const u = session?.user;
      setUser(u ? { email: u.email, name: (u.user_metadata as any)?.full_name ?? (u.user_metadata as any)?.name ?? null } : null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);
  const isAuthed = !!user;
  const displayName = user?.name || user?.email || "";

  const integrations = [
    { icon: MessageCircle, label: "WhatsApp" },
    { icon: Zap, label: "Evolution API" },
    { icon: Webhook, label: "Webhooks" },
    { icon: Mail, label: "E-mail" },
    { icon: ClipboardList, label: "Formulários" },
  ];
  const kpis = [
    { icon: ShieldCheck, title: "100% Auditado", desc: "Toda transição registra autor e horário." },
    { icon: Inbox, title: "Atendimento Centralizado", desc: "WhatsApp, e-mail e formulários numa fila só." },
    { icon: Timer, title: "Gestão de SLA em Tempo Real", desc: "Atrasos sobem pro topo antes de virar reclamação." },
  ];
  /** Coluna editorial ao lado do mockup: o que olhar na janela. */
  const panelPoints = [
    {
      icon: ArrowDownWideNarrow,
      tint: "bg-[var(--pill-brand-bg)] text-[var(--pill-brand-fg)]",
      title: "Ordem que previne esquecimento",
      desc: "Atrasadas e urgentes sobem pro topo; o resto segue por atividade recente.",
    },
    {
      icon: Filter,
      tint: "bg-[var(--pill-violet-bg)] text-[var(--pill-violet-fg)]",
      title: "Filtros por estado em um clique",
      desc: "Os mesmos 5 estados do fluxo, sem planilha e sem decoreba.",
    },
    {
      icon: MessageCircle,
      tint: "bg-[var(--pill-green-bg)] text-[var(--pill-green-fg)]",
      title: "Prévia da última mensagem",
      desc: "Antes de abrir, você já sabe o que ficou prometido na conversa.",
    },
    {
      icon: Timer,
      tint: "bg-[var(--pill-red-bg)] text-[var(--pill-red-fg)]",
      title: "SLA vivo no header do chat",
      desc: "Tempo negativo pisca antes de o cliente precisar reclamar.",
    },
  ];
  const features = [
    {
      icon: MessageCircle,
      title: "Canais de entrada",
      desc: "Webhook público conecta WhatsApp (via Evolution API), e-mail, formulários e qualquer sistema externo.",
      tint: "bg-[var(--pill-brand-bg)] text-[var(--pill-brand-fg)]",
    },
    {
      icon: Users,
      title: "Multi-tenant",
      desc: "Organizações isoladas com papéis (owner, admin, agente) e Row-Level Security.",
      tint: "bg-[var(--pill-violet-bg)] text-[var(--pill-violet-fg)]",
    },
    {
      icon: History,
      title: "Histórico completo",
      desc: "Mudanças de estado, atribuições, prioridade e mensagens com autor e horário.",
      tint: "bg-[var(--pill-amber-bg)] text-[var(--pill-amber-fg)]",
    },
    {
      icon: LayoutDashboard,
      title: "Painel operacional",
      desc: "Fila filtrada, dashboard com contadores por estado, atrasos e produtividade.",
      tint: "bg-[var(--pill-green-bg)] text-[var(--pill-green-fg)]",
    },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="border-b border-border/60 backdrop-blur sticky top-0 z-10 bg-background/80">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary">
              <Inbox className="h-4 w-4 text-primary-foreground" strokeWidth={2.2} />
            </span>
            Fluxo
          </div>
          <nav className="flex items-center gap-2 text-sm">
            {isAuthed ? (
              <>
                <span className="hidden sm:inline text-muted-foreground px-2">Olá, {displayName}</span>
                <Link to="/app" className="px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90">
                  Abrir painel
                </Link>
                <button onClick={async () => { await supabase.auth.signOut(); }} className="px-3 py-2 rounded-md hover:bg-secondary">
                  Sair
                </button>
              </>
            ) : (
              <>
                <Link to="/auth" className="px-3 py-2 rounded-md hover:bg-secondary">Entrar</Link>
                <Link to="/auth" className="px-3 py-2 rounded-md bg-primary text-primary-foreground hover:opacity-90">
                  Começar grátis
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* ── HERO: copy + mockup em tamanho real + coluna editorial ── */}
      <section className="mx-auto max-w-6xl px-6 pt-20 pb-16">
        <Reveal>
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary">
              <span className="h-1.5 w-1.5 rounded-full bg-primary" /> Motor de demandas multi-canal
            </div>
            <h1 className="mt-6 text-4xl lg:text-6xl font-extrabold tracking-tight leading-[1.05]">
              Nada importante <span className="text-primary">esquecido</span> — de qualquer conversa até a resolução.
            </h1>
            <p className="mt-6 text-lg text-muted-foreground max-w-2xl">
              Fluxo é o motor que transforma conversas de WhatsApp, e-mail, formulários e APIs em demandas com estado,
              prazo, responsável e histórico completo.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to={isAuthed ? "/app" : "/auth"}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-3 font-medium text-primary-foreground shadow-lg shadow-primary/25 transition hover:scale-[1.02] hover:brightness-110"
              >
                Abrir painel <ArrowRight className="h-4 w-4" />
              </Link>
              <a href="#como-funciona" className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-3 transition hover:bg-secondary">
                Como funciona
              </a>
            </div>
          </div>
        </Reveal>

        <div className="mt-16 grid gap-10 lg:grid-cols-5 lg:items-center">
          {/* Janela do produto em tamanho real */}
          <Reveal delay={100} className="lg:col-span-3">
            <ProductMockup />
          </Reveal>

          {/* Coluna editorial: o que olhar na janela */}
          <Reveal delay={200} className="lg:col-span-2">
            <div className="text-xs font-semibold uppercase tracking-widest text-primary">O painel, sem maquiagem</div>
            <h2 className="mt-3 text-2xl font-bold tracking-tight">A fila que se organiza sozinha</h2>
            <ul className="mt-6 space-y-4">
              {panelPoints.map(({ icon: Icon, tint, title, desc }) => (
                <li key={title} className="flex items-start gap-3">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tint}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <div className="text-sm font-semibold">{title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
                  </div>
                </li>
              ))}
            </ul>
            {/* Legenda visual: como ler um card da fila */}
            <div className="mt-6 rounded-xl border border-border bg-card/80 p-4">
              <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Como ler um card
              </div>
              <div className="mt-3 space-y-2.5 text-[11px] text-muted-foreground">
                <div className="flex items-center gap-2.5">
                  <span className="relative grid h-5 w-5 shrink-0 place-items-center rounded-full bg-secondary">
                    <span className="text-[8px] font-bold text-foreground">W</span>
                    <span className="absolute -right-0.5 -top-0.5 h-1.5 w-1.5 rounded-full bg-destructive" />
                  </span>
                  Ponto vermelho = atrasada ou urgente (sobe pro topo)
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="relative grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded bg-secondary">
                    <span className="absolute left-0 top-0 h-full w-[2px] bg-[var(--state-aguardando)]" />
                  </span>
                  Faixa lateral = estado da demanda
                </div>
                <div className="flex items-center gap-2.5">
                  <span className="w-5 shrink-0 truncate rounded bg-secondary px-1 py-0.5 text-center text-[8px] text-foreground">
                    …
                  </span>
                  Prévia = última mensagem da conversa
                </div>
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── FAIXA DE INTEGRAÇÕES & MÉTRICAS ── */}
      <section className="border-y border-border bg-card/60">
        <div className="mx-auto max-w-6xl px-6 py-8 flex flex-col lg:flex-row lg:items-center gap-8">
          <Reveal className="lg:shrink-0">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Conecte nativamente com</div>
              <div className="mt-3 flex flex-wrap gap-2">
                {integrations.map(({ icon: Icon, label }) => (
                  <span key={label} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground">
                    <Icon className="h-3.5 w-3.5 text-primary" /> {label}
                  </span>
                ))}
              </div>
            </div>
          </Reveal>
          <div className="h-px lg:h-16 lg:w-px bg-border lg:shrink-0" />
          <Reveal delay={100} className="flex-1">
            <div className="grid sm:grid-cols-3 gap-6">
              {kpis.map(({ icon: Icon, title, desc }) => (
                <div key={title} className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </span>
                  <div>
                    <div className="text-sm font-bold text-foreground">{title}</div>
                    <div className="mt-0.5 text-xs text-muted-foreground">{desc}</div>
                  </div>
                </div>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* ── O MOTOR POR DENTRO (BENTO GRID) ── */}
      <section id="como-funciona" className="mx-auto max-w-6xl px-6 py-20">
        <Reveal>
          <h2 className="text-3xl font-bold tracking-tight">O motor por dentro</h2>
          <p className="text-muted-foreground mt-2 max-w-2xl">
            Cada mensagem vira uma demanda com ciclo de vida controlado. Estados, responsáveis e prazos garantem que
            nada trava sem alguém saber.
          </p>
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-4">
          {/* Card 1 — State machine (destaque, 2 cols) */}
          <Reveal className="md:col-span-2">
            <div className="h-full rounded-xl border border-border bg-card/80 p-6 backdrop-blur transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-pop)]">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--pill-brand-bg)]">
                  <GitBranch className="h-4 w-4 text-[var(--pill-brand-fg)]" />
                </span>
                <div className="font-semibold">State machine auditada</div>
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <span className="pill-brand rounded-full px-2.5 py-1 text-[11px] font-semibold">Novo</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="pill-amber rounded-full px-2.5 py-1 text-[11px] font-semibold">Em análise</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="pill-orange rounded-full px-2.5 py-1 text-[11px] font-semibold">Aguardando cliente</span>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="pill-green rounded-full px-2.5 py-1 text-[11px] font-semibold">Concluído</span>
              </div>
              <div className="mt-4 rounded-lg border border-border bg-background px-3 py-2 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">IA</span> mudou o estado de{" "}
                <span className="pill-brand rounded px-1.5 py-0.5 font-semibold">Novo</span> para{" "}
                <span className="pill-amber rounded px-1.5 py-0.5 font-semibold">Em análise</span> · há 2 min
              </div>
            </div>
          </Reveal>
          {/* Card 2 — SLA (destaque, 2 cols) */}
          <Reveal delay={80} className="md:col-span-2">
            <div className="h-full rounded-xl border border-border bg-card/80 p-6 backdrop-blur transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-pop)]">
              <div className="flex items-center gap-3">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-[var(--pill-red-bg)]">
                  <Timer className="h-4 w-4 text-[var(--pill-red-fg)]" />
                </span>
                <div className="font-semibold">SLA & prazos sob controle</div>
              </div>
              <div className="mt-5 space-y-2">
                <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                  <span className="pill-red inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold">
                    <span className="h-1.5 w-1.5 rounded-full bg-[var(--pill-red-fg)] animate-alert-blink" /> SLA estourado · 2h
                  </span>
                  <span className="text-[11px] text-muted-foreground">DM-1102 · Wagner</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                  <span className="pill-amber rounded-full px-2 py-0.5 text-[10px] font-bold">Vence em 4h</span>
                  <span className="text-[11px] text-muted-foreground">DM-0977 · Emplast</span>
                </div>
                <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2">
                  <span className="pill-green rounded-full px-2 py-0.5 text-[10px] font-bold">Dentro do prazo</span>
                  <span className="text-[11px] text-muted-foreground">DM-0954 · Rute Lopes</span>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">Alertas aparecem antes do cliente perceber o atraso.</p>
            </div>
          </Reveal>
          {/* Cards 3-6 — menores */}
          {features.map(({ icon: Icon, title, desc, tint }, i) => (
            <Reveal key={title} delay={i * 60}>
              <div className="h-full rounded-xl border border-border bg-card/80 p-5 backdrop-blur transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-pop)]">
                <span className={`grid h-9 w-9 place-items-center rounded-lg ${tint}`}>
                  <Icon className="h-4 w-4" />
                </span>
                <div className="mt-3 font-semibold text-sm">{title}</div>
                <p className="mt-1 text-xs text-muted-foreground">{desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <Reveal>
          <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-blue-950 p-10 md:p-14">
            {/* Malha de grade (mesmo idioma visual do login) */}
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(148,163,184,0.07)_1px,transparent_1px),linear-gradient(to_bottom,rgba(148,163,184,0.07)_1px,transparent_1px)] bg-[size:32px_32px]" />
            <div className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 rounded-full bg-sky-500/15 blur-3xl" />
            <div className="relative">
              <h2 className="text-3xl font-bold tracking-tight text-white">Pronto para operacionalizar sua operação?</h2>
              <p className="mt-3 max-w-xl text-slate-300">
                Crie uma organização, gere um token de webhook e comece a receber demandas hoje.
              </p>
              <Link
                to={isAuthed ? "/app" : "/auth"}
                className="mt-6 inline-flex items-center gap-2 rounded-md bg-white px-5 py-3 font-medium text-slate-900 shadow-lg shadow-sky-500/20 transition hover:scale-[1.02] hover:bg-slate-100"
              >
                Entrar no painel <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ── FOOTER ── */}
      <footer className="border-t border-border">
        <div className="mx-auto max-w-6xl px-6 py-10 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 font-semibold text-foreground">
            <span className="grid h-6 w-6 place-items-center rounded-md bg-primary">
              <Inbox className="h-3.5 w-3.5 text-primary-foreground" />
            </span>
            Fluxo
            <span className="font-normal text-muted-foreground">© {new Date().getFullYear()} — Motor de Demandas</span>
          </div>
          {/* Placeholders até existirem páginas próprias de Termos/Status */}
          <nav className="flex items-center gap-5">
            <a href="#" className="transition hover:text-foreground">Termos</a>
            <a href="#como-funciona" className="transition hover:text-foreground">Documentação</a>
            <a href="#" className="transition hover:text-foreground">Status</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}