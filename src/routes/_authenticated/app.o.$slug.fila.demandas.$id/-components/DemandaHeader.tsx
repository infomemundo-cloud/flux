import { MessageCircle, PanelLeftClose, PanelLeftOpen, PanelRightOpen, Users, X } from "lucide-react";
import { toast } from "sonner";
import { ContactAvatar } from "@/components/contact-avatar";

type DemandaHeaderProps = {
  contactName: string;
  contactAvatarUrl: string | null;
  phone: string | null;
  isGroupChat: boolean;
  filaCollapsed: boolean;
  onToggleFila: () => void;
  railCollapsed: boolean;
  onExpandRail: () => void;
  onClose: () => void;
};

/**
 * Header do chat — altura FIXA h-12 (48px), idêntica à do header do trilho
 * de Propriedades, então as linhas border-b batem perfeitamente entre as
 * colunas. Uma única linha: toggle da fila (SEMPRE visível, antes do
 * avatar) → avatar compacto → nome · telefone (copiável) → badge do canal
 * → expandir propriedades (só com trilho recolhido) → X de fechar.
 */
export function DemandaHeader({
  contactName,
  contactAvatarUrl,
  phone,
  isGroupChat,
  filaCollapsed,
  onToggleFila,
  railCollapsed,
  onExpandRail,
  onClose,
}: DemandaHeaderProps) {
  const handleCopyPhone = async () => {
    if (!phone) return;
    try {
      await navigator.clipboard.writeText(phone);
      toast.success("Telefone copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  return (
    <header className="h-12 shrink-0 border-b border-border/50 bg-card px-3 flex items-center gap-2">
      {/* Toggle da fila — sempre visível, antes do avatar */}
      <button
        type="button"
        onClick={onToggleFila}
        title={filaCollapsed ? "Expandir fila" : "Recolher fila"}
        aria-label={filaCollapsed ? "Expandir fila" : "Recolher fila"}
        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
      >
        {filaCollapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
      </button>

      {/* Identidade do contato */}
      <ContactAvatar url={contactAvatarUrl} name={contactName} size="sm" tone="client" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5 text-xs">
          <span className="truncate font-bold text-foreground">{contactName}</span>
          {phone && (
            <>
              <span className="shrink-0 text-muted-foreground/50">·</span>
              <button
                type="button"
                onClick={handleCopyPhone}
                title="Clique para copiar"
                className="hidden truncate text-[11px] text-muted-foreground transition tabular-nums hover:text-primary md:inline md:max-w-[140px]"
              >
                {phone}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Canal + ações de layout + fechar */}
      <div className="flex shrink-0 items-center gap-1">
        <span
          title={isGroupChat ? "Conversa em grupo" : "WhatsApp"}
          aria-label={isGroupChat ? "Conversa em grupo" : "WhatsApp"}
          className="inline-flex items-center gap-1 rounded-md bg-[var(--pill-green-bg)] px-2 py-0.5 text-[10px] font-bold text-[var(--pill-green-fg)]"
        >
          {isGroupChat ? <Users className="h-3 w-3" /> : <MessageCircle className="h-3 w-3" />}
          {isGroupChat ? "Grupo" : "WhatsApp"}
        </span>
        {railCollapsed && (
          <button
            type="button"
            onClick={onExpandRail}
            title="Expandir propriedades"
            aria-label="Expandir propriedades"
            className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          >
            <PanelRightOpen className="h-4 w-4" />
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          title="Fechar demanda"
          aria-label="Fechar demanda"
          className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </header>
  );
}