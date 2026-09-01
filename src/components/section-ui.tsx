import type { LucideIcon } from "lucide-react";

/** Título de seção com ícone representativo. */
export function SectionTitle({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h2 className="flex items-center gap-2 text-sm font-bold tracking-tight">
          <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md pill-brand">
            <Icon className="h-3.5 w-3.5" strokeWidth={2.3} />
          </span>
          {title}
        </h2>
        {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
      </div>
      {action}
    </div>
  );
}

/** Cartão de métrica simples. */
export function StatCard({
  icon: Icon,
  label,
  value,
  tone = "brand",
}: {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  tone?: "brand" | "green" | "amber" | "violet" | "neutral";
}) {
  const pill = `pill-${tone}`;
  return (
    <div className="card-elevated flex items-center gap-3 p-3.5">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${pill}`}>
        <Icon className="h-4 w-4" strokeWidth={2.2} />
      </span>
      <div className="min-w-0">
        <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
        <div className="text-lg font-extrabold leading-tight tabular-nums">{value}</div>
      </div>
    </div>
  );
}
