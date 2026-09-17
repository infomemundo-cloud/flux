import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * Linha de evento de sistema (mudança de estado/prioridade/atribuição/criação).
 * Puramente apresentacional: recebe ícone, conteúdo e carimbo de tempo.
 */
export function SystemLine({
  icon: Icon,
  children,
  when,
}: {
  icon: LucideIcon;
  children: ReactNode;
  when: string;
}) {
  return (
    <li className="relative pl-9">
      <span className="absolute left-[11px] top-0 h-full w-px bg-border" aria-hidden />
      <span className="absolute left-0 top-1 grid h-[22px] w-[22px] place-items-center rounded-full border border-border bg-background text-muted-foreground">
        <Icon className="h-3 w-3" strokeWidth={2.3} />
      </span>
      <div className="py-1.5 text-xs leading-relaxed text-muted-foreground">
        {children} <span className="opacity-70">· {when}</span>
      </div>
    </li>
  );
}
