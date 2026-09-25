import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * Ícone (i) com tooltip pra explicação técnica/regra sem poluir o layout.
 * FONTE ÚNICA: aba Canais (badges + switch de grupos), Geral (slug na
 * identidade) e Zona de Perigo (consequências da exclusão).
 * Hover E foco abrem o tooltip (acessível por teclado).
 */
export function InfoTip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label="Mais informações"
            className="grid h-5 w-5 shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <Info className="h-3.5 w-3.5" strokeWidth={2.2} />
          </button>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[280px] text-xs leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}