import { Instagram, Mail, Send } from "lucide-react";

/**
 * Card promocional de próximos canais (linguagem de gestor):
 * - Ícones ilustrativos do Instagram, Telegram e E-mail
 * - Título e descrição humanizados
 * - Badge "Em breve"
 */
export function UpcomingChannels() {
  return (
    <div className="card-elevated space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Novos Canais de Atendimento</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Em breve você poderá conectar o Instagram Direct, Telegram e E-mail de suporte no mesmo painel.
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Em breve
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex -space-x-1.5">
          <span className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-muted-foreground ring-2 ring-card">
            <Instagram className="h-4 w-4" />
          </span>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-muted-foreground ring-2 ring-card">
            <Send className="h-4 w-4" />
          </span>
          <span className="grid h-8 w-8 place-items-center rounded-full bg-secondary text-muted-foreground ring-2 ring-card">
            <Mail className="h-4 w-4" />
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          Instagram · Telegram · E-mail
        </span>
      </div>
    </div>
  );
}