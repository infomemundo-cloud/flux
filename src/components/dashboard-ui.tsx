import { Check, ChevronDown, Copy, Sparkles, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";

/** Mini gráfico de tendência (sparkline) desenhado em SVG. */
export function Sparkline({
  values,
  className = "text-primary",
  height = 34,
}: {
  values: number[];
  className?: string;
  height?: number;
}) {
  const w = 100;
  const h = height;
  const max = Math.max(1, ...values);
  const step = values.length > 1 ? w / (values.length - 1) : w;
  const pts = values.map((v, i) => [i * step, h - 2 - (v / max) * (h - 6)] as const);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${w},${h} L0,${h} Z`;
  const id = `sg-${values.length}-${max}-${Math.round(pts[0]?.[1] ?? 0)}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={`w-full ${className}`} style={{ height }} aria-hidden>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.28" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {pts.length > 0 && <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.4" fill="currentColor" />}
    </svg>
  );
}

/** Iniciais de um membro (nome, e-mail ou id). */
export function initialsOf(label?: string | null) {
  const s = (label ?? "").trim();
  if (!s) return "?";
  const base = s.includes("@") ? s.split("@")[0] : s;
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return base.slice(0, 2).toUpperCase();
}

const AVATAR_TONES = [
  "bg-[oklch(0.55_0.2_264/0.14)] text-[oklch(0.42_0.18_264)]",
  "bg-[oklch(0.62_0.15_162/0.16)] text-[oklch(0.4_0.13_162)]",
  "bg-[oklch(0.68_0.17_45/0.16)] text-[oklch(0.45_0.15_42)]",
  "bg-[oklch(0.65_0.16_300/0.16)] text-[oklch(0.44_0.15_300)]",
  "bg-[oklch(0.6_0.16_215/0.16)] text-[oklch(0.4_0.14_215)]",
];

export function MemberAvatar({
  label,
  seed,
  size = 24,
  title,
}: {
  label?: string | null;
  seed?: string;
  size?: number;
  title?: string;
}) {
  const key = seed ?? label ?? "";
  let n = 0;
  for (let i = 0; i < key.length; i++) n = (n + key.charCodeAt(i)) % 997;
  const tone = label ? AVATAR_TONES[n % AVATAR_TONES.length] : "bg-secondary text-muted-foreground";
  return (
    <span
      title={title ?? label ?? "Sem responsável"}
      className={`grid place-items-center shrink-0 rounded-full font-bold ${tone}`}
      style={{ height: size, width: size, fontSize: Math.max(9, size * 0.4) }}
    >
      {label ? initialsOf(label) : "—"}
    </span>
  );
}

export type TeamOption = { value: string; label: string; sub?: string; kind: "me" | "triage" | "all" | "member" };

/** Seletor de equipe moderno (substitui o <select> nativo). */
export function TeamSelector({
  value,
  options,
  onChange,
}: {
  value: string;
  options: TeamOption[];
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = options.find((o) => o.value === value) ?? options[0];

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-2.5 h-11 pl-2 pr-3 rounded-xl border border-border bg-card shadow-[var(--shadow-card)] hover:border-primary/40 transition-colors"
      >
        {current?.kind === "all" ? (
          <span className="grid place-items-center h-7 w-7 rounded-full bg-primary/10 text-primary">
            <Users className="h-3.5 w-3.5" strokeWidth={2.3} />
          </span>
        ) : (
          <MemberAvatar label={current?.kind === "triage" ? null : current?.label} seed={current?.value} size={28} />
        )}
        <span className="min-w-0 text-left">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground leading-none">
            Visualizando
          </span>
          <span className="block text-[13px] font-semibold truncate max-w-[160px] leading-tight mt-0.5">
            {current?.label}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[266px] rounded-xl border border-border bg-card p-1.5 shadow-[0_20px_45px_-20px_oklch(0.2_0.05_264/0.35)]">
          {options.map((o, i) => {
            const active = o.value === value;
            const prev = options[i - 1];
            return (
              <div key={o.value}>
                {prev && prev.kind !== "member" && o.kind === "member" && (
                  <div className="px-2.5 pt-2 pb-1 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
                    Time
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                  className={`w-full flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors ${
                    active ? "bg-primary/[0.07]" : "hover:bg-secondary"
                  }`}
                >
                  {o.kind === "all" ? (
                    <span className="grid place-items-center h-7 w-7 rounded-full bg-primary/10 text-primary">
                      <Users className="h-3.5 w-3.5" strokeWidth={2.3} />
                    </span>
                  ) : (
                    <MemberAvatar label={o.kind === "triage" ? null : o.label} seed={o.value} size={28} />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold truncate">{o.label}</span>
                    {o.sub && <span className="block text-[11px] text-muted-foreground truncate">{o.sub}</span>}
                  </span>
                  {active && <Check className="h-4 w-4 text-primary shrink-0" strokeWidth={2.6} />}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const AI_SUGGESTIONS: { tag: string; text: string }[] = [
  {
    tag: "Segunda via",
    text: "Olá [Cliente], recebi sua solicitação de segunda via. Já estou gerando o documento e envio aqui em até 1 dia útil.",
  },
  {
    tag: "Primeiro contato",
    text: "Olá [Cliente], sua demanda foi registrada com o protocolo [Protocolo]. Nossa equipe já está analisando e você recebe atualizações por aqui.",
  },
  {
    tag: "Aguardando cliente",
    text: "Olá [Cliente], para seguir com o atendimento preciso apenas de [Documento/Informação]. Pode me enviar por aqui?",
  },
  {
    tag: "Conclusão",
    text: "Olá [Cliente], sua solicitação foi concluída. Qualquer nova necessidade, basta responder esta conversa que reabrimos o atendimento.",
  },
];

/** Cartão de sugestões da IA para respostas rápidas. */
export function AiSuggestionsCard() {
  const [copied, setCopied] = useState<number | null>(null);

  async function copy(text: string, i: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(i);
      setTimeout(() => setCopied((c) => (c === i ? null : c)), 1600);
    } catch {
      /* clipboard indisponível */
    }
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-card p-4 sm:p-5 shadow-[var(--shadow-card)]">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -right-16 h-56 w-56 rounded-full bg-primary/10 blur-3xl"
      />
      <div className="relative flex items-start gap-3">
        <span className="grid place-items-center h-9 w-9 shrink-0 rounded-xl bg-primary/10 text-primary">
          <Sparkles className="h-[18px] w-[18px]" strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold tracking-tight">Sugestões da IA para Atendimento Eficiente</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Textos prontos para as demandas mais comuns. Toque para copiar e ajustar.
          </p>
        </div>
      </div>

      <ul className="relative mt-4 grid gap-2.5 sm:grid-cols-2">
        {AI_SUGGESTIONS.map((s, i) => (
          <li key={s.tag}>
            <button
              type="button"
              onClick={() => copy(s.text, i)}
              className="group h-full w-full text-left rounded-xl border border-border bg-background p-3 hover:border-primary/35 hover:bg-primary/[0.03] transition-colors"
            >
              <span className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  <Sparkles className="h-3 w-3" strokeWidth={2.4} />
                  {s.tag}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-primary opacity-0 group-hover:opacity-100 transition-opacity">
                  {copied === i ? <Check className="h-3 w-3" strokeWidth={3} /> : <Copy className="h-3 w-3" strokeWidth={2.6} />}
                  {copied === i ? "Copiado" : "Copiar"}
                </span>
              </span>
              <span className="mt-2 block text-[13px] leading-relaxed text-foreground/85">{s.text}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}