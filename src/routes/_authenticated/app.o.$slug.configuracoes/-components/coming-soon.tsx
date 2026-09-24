import { Tags } from "lucide-react";

/** Card "Em breve" reutilizável pras pendências do plano de governança. */
export function ComingSoon({
  icon: Icon,
  title,
  description,
}: {
  icon: typeof Tags;
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card/60 p-10 text-center">
      <span className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" strokeWidth={2.2} />
      </span>
      <div className="mt-3 text-sm font-semibold">{title}</div>
      <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted-foreground">{description}</p>
      <span className="mt-3 inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
        Em breve
      </span>
    </div>
  );
}