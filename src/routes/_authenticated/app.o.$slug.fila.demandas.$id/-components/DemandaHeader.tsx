import { Link } from "@tanstack/react-router";
import { PanelLeftClose, PanelRightOpen, X, MessageCircle } from "lucide-react";
import { ContactAvatar } from "@/components/contact-avatar";

/**
 * Área 1 do detalhe: identidade do contato (avatar real, nome, chip de grupo,
 * protocolo, telefone) + controles de layout (recolher fila, reabrir trilho,
 * fechar painel). Puramente apresentacional: ações chegam prontas via props.
 */
export function DemandaHeader({
  slug,
  contactName,
  contactAvatarUrl,
  phone,
  protocol,
  isGroupChat,
  onCollapseFila,
  railCollapsed,
  onExpandRail,
}: {
  slug: string;
  contactName: string;
  contactAvatarUrl: string | null;
  phone?: string | null;
  protocol?: string | null;
  isGroupChat: boolean;
  onCollapseFila: () => void;
  railCollapsed: boolean;
  onExpandRail: () => void;
}) {
  return (
    <div className="shrink-0 border-b border-border bg-card p-3 flex items-center gap-2.5">
      <button
        onClick={onCollapseFila}
        title="Recolher fila"
        aria-label="Recolher fila"
        className="hidden sm:grid shrink-0 place-items-center h-8 w-8 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition"
      >
        <PanelLeftClose className="h-4 w-4" />
      </button>
      <ContactAvatar url={contactAvatarUrl} name={contactName} tone="client" />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-1.5 min-w-0">
          <span className="truncate text-sm font-semibold text-foreground">{contactName}</span>
          {isGroupChat && (
            <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide pill-brand">
              Grupo
            </span>
          )}
          <span className="shrink-0 text-xs text-muted-foreground">· {protocol}</span>
        </div>
        {phone && (
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <MessageCircle className="h-3 w-3" strokeWidth={2.2} /> {phone}
          </div>
        )}
      </div>
      {railCollapsed && (
        <button
          onClick={onExpandRail}
          title="Expandir painel lateral"
          aria-label="Expandir painel lateral"
          className="hidden md:grid shrink-0 place-items-center h-8 w-8 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition"
        >
          <PanelRightOpen className="h-4 w-4" />
        </button>
      )}
      <Link
        to="/app/o/$slug/fila"
        params={{ slug }}
        title="Fechar"
        aria-label="Fechar painel"
        className="shrink-0 grid place-items-center h-8 w-8 rounded-lg text-muted-foreground hover:bg-secondary hover:text-foreground transition"
      >
        <X className="h-4 w-4" />
      </Link>
    </div>
  );
}
