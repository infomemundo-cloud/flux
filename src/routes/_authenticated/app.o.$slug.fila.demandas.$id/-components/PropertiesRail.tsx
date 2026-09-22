import { useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarClock,
  Check,
  ChevronDown,
  Copy,
  FileText,
  History,
  PanelRightClose,
  Plus,
  Search,
  Tag,
  Trash2,
  User,
  UserCheck,
  UserRound,
  UserX,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { StateEnum, PriorityEnum } from "@/lib/demandas/demandas-guard";
import { STATE_LABEL, formatRelative } from "@/components/demandas-ui";
import {
  listOrgTags,
  DEFAULT_TAG_SUGGESTIONS,
  type ContactTag,
} from "@/lib/contacts.functions";
import { ContactAvatar } from "@/components/contact-avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

/** Mesmos tokens de cor dos pips/bordas da fila — consistência visual. */
const STATE_DOT: Record<string, string> = {
  novo: "bg-[var(--state-novo)]",
  em_analise: "bg-[var(--state-analise)]",
  aguardando_cliente: "bg-[var(--state-aguardando)]",
  aguardando_revisao_humana: "bg-[var(--pill-violet-fg)]",
  concluido: "bg-[var(--state-resolvido)]",
};

/** Pílula discreta (key-value à direita): sem borda, fundo sutil, h-8. */
const PILL_TRIGGER =
  "inline-flex h-8 items-center gap-1.5 rounded-lg bg-secondary/60 pl-2.5 pr-2 text-[11px] font-medium text-foreground/85 transition hover:bg-secondary";

/** Prioridade ATIVA: cores semânticas via pills do design system. */
const PRIORITY_ACTIVE: Record<string, string> = {
  baixa: "pill-neutral font-semibold",
  media: "pill-amber font-semibold",
  alta: "pill-orange font-semibold",
  urgente: "pill-red font-bold",
};

/** Borda sutil da prioridade ativa: o próprio foreground da pill em 30–40%. */
const PRIORITY_EDGE: Record<string, string> = {
  baixa: "border-[color-mix(in_oklch,var(--pill-neutral-fg)_30%,transparent)]",
  media: "border-[color-mix(in_oklch,var(--pill-amber-fg)_30%,transparent)]",
  alta: "border-[color-mix(in_oklch,var(--pill-orange-fg)_30%,transparent)]",
  urgente: "border-[color-mix(in_oklch,var(--pill-red-fg)_40%,transparent)]",
};

/** Dot de prioridade no menu (mesma família de cor da pill ativa). */
const PRIORITY_DOT: Record<string, string> = {
  baixa: "bg-muted-foreground/50",
  media: "bg-[var(--pill-amber-fg)]",
  alta: "bg-[var(--pill-orange-fg)]",
  urgente: "bg-[var(--pill-red-fg)]",
};

/** Etiquetas do contato: pills do design system (tematizadas de graça). */
const TAG_PILL: Record<ContactTag["color"], string> = {
  brand: "pill-brand",
  amber: "pill-amber",
  orange: "pill-orange",
  violet: "pill-violet",
  green: "pill-green",
  red: "pill-red",
  neutral: "pill-neutral",
};

const TAG_DOT: Record<ContactTag["color"], string> = {
  brand: "bg-[var(--pill-brand-fg)]",
  amber: "bg-[var(--pill-amber-fg)]",
  orange: "bg-[var(--pill-orange-fg)]",
  violet: "bg-[var(--pill-violet-fg)]",
  green: "bg-[var(--pill-green-fg)]",
  red: "bg-[var(--pill-red-fg)]",
  neutral: "bg-[var(--pill-neutral-fg)]",
};

const TAG_COLOR_KEYS = Object.keys(TAG_PILL) as ContactTag["color"][];

/** Cor determinística pra etiqueta recém-criada (sem picker pesado). */
function colorForLabel(label: string): ContactTag["color"] {
  const h = (label.charCodeAt(0) || 65) + label.length;
  return TAG_COLOR_KEYS[h % TAG_COLOR_KEYS.length];
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * Prazo em pílula inline: popover com Calendar + hora + atalhos, abrindo pro
 * lado do chat (estável em telas menores). Carmim sutil quando vencido.
 */
function DueDatePicker({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
}) {
  const parts = value ? new Date(value) : null;
  const time = parts
    ? `${String(parts.getHours()).padStart(2, "0")}:${String(parts.getMinutes()).padStart(2, "0")}`
    : "18:00";
  const overdue = !!parts && parts.getTime() < Date.now();

  const commit = (d: Date, t: string) => {
    const [h, m] = t.split(":").map(Number);
    const nd = new Date(d);
    nd.setHours(h || 0, m || 0, 0, 0);
    onChange(nd.toISOString());
  };
  const quick = (days: number, hour: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hour, 0, 0, 0);
    onChange(d.toISOString());
  };

  const label = parts
    ? `${String(parts.getDate()).padStart(2, "0")}/${String(parts.getMonth() + 1).padStart(2, "0")} · ${time}`
    : "Sem prazo";

  return (
    <div className="relative inline-flex">
      <Popover>
        <PopoverTrigger asChild>
          <button type="button" className={`${PILL_TRIGGER} pr-7 ${overdue ? "text-destructive" : ""}`}>
            <CalendarClock
              className={`h-3.5 w-3.5 shrink-0 ${overdue ? "text-destructive" : "text-muted-foreground"}`}
            />
            <span className="tabular-nums">{label}</span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="left"
          align="end"
          sideOffset={12}
          collisionPadding={16}
          sticky="always"
          className="w-auto max-h-[calc(100dvh-6rem)] overflow-y-auto rounded-2xl p-0"
        >
          <Calendar
            mode="single"
            selected={parts ?? undefined}
            onSelect={(d) => d && commit(d, time)}
            className="rounded-none"
          />
          <div className="flex items-center gap-2 border-t border-border/50 px-3 py-2">
            <input
              type="time"
              value={time}
              onChange={(e) => parts && commit(parts, e.target.value)}
              className="h-8 rounded-lg border border-border/60 bg-background px-2 text-[11px] tabular-nums outline-none transition focus:border-primary/50"
            />
            <div className="flex flex-1 justify-end gap-1">
              <button
                type="button"
                onClick={() => quick(0, 18)}
                className="rounded-md bg-secondary/70 px-1.5 py-1 text-[10px] font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                Hoje 18h
              </button>
              <button
                type="button"
                onClick={() => quick(1, 9)}
                className="rounded-md bg-secondary/70 px-1.5 py-1 text-[10px] font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                Amanhã 9h
              </button>
              <button
                type="button"
                onClick={() => quick(7, 18)}
                className="rounded-md bg-secondary/70 px-1.5 py-1 text-[10px] font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                +7 dias
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {parts && (
        <button
          type="button"
          title="Limpar prazo"
          aria-label="Limpar prazo"
          onClick={() => onChange(null)}
          className="absolute right-1.5 top-1/2 grid h-5 w-5 -translate-y-1/2 place-items-center rounded-md text-muted-foreground transition hover:bg-card hover:text-foreground"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

/** Linha key-value horizontal: rótulo à esquerda (w-20), controle à direita. */
function KVRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <span className="w-20 shrink-0 text-[11px] font-medium text-muted-foreground">{label}</span>
      <div className="flex min-w-0 flex-1 justify-end">{children}</div>
    </div>
  );
}

type PropertiesRailProps = {
  demanda: any;
  onUpdate: (patch: any) => void;
  onCollapseRail: () => void;
  orgUserId: string | undefined;
  isManager: boolean;
  operators: any[];
  nameOf: (uid?: string | null) => string;
  canDelete: boolean;
  onDelete: () => void;
  deletePending: boolean;
  onSaveContact: (patch: {
    notes?: string | null;
    tags?: ContactTag[];
    company?: string | null;
  }) => void;
  contactSaving: boolean;
  onOpenDemanda: (id: string) => void;
};

/**
 * Trilho de propriedades com abas (Demanda / Contato / Notas).
 * Aba Contato (CRM): topo com avatar real + nome + telefone copiável;
 * e-mail (leitura) e empresa (edição inline no blur/Enter); combobox de
 * etiquetas com sugestões da org + sementes padrão + criação inline;
 * badges coloridos com X discreto. Salvamento via updateContact com
 * feedback sutil (salvando… / salvo).
 */
export function PropertiesRail({
  demanda,
  onUpdate,
  onCollapseRail,
  orgUserId,
  isManager,
  operators,
  nameOf,
  canDelete,
  onDelete,
  deletePending,
  onSaveContact,
  contactSaving,
  onOpenDemanda,
}: PropertiesRailProps) {
  const [activeTab, setActiveTab] = useState<"demanda" | "contato" | "notas">("demanda");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [notes, setNotes] = useState("");
  const [company, setCompany] = useState("");
  const [tagOpen, setTagOpen] = useState(false);
  const [tagQuery, setTagQuery] = useState("");

  const qc = useQueryClient();
  const orgTagsFn = useServerFn(listOrgTags);

  const contact = demanda.contacts;
  const hasContact = !!contact;
  const tags: ContactTag[] = Array.isArray(contact?.tags) ? contact.tags : [];
  const contactStats = demanda.contactStats ?? null;

  // Sugestões de etiqueta da org (só busca quando a aba Contato está aberta).
  const { data: orgTags } = useQuery({
    queryKey: ["org-tags", demanda.org_id],
    queryFn: () => orgTagsFn({ data: { orgId: demanda.org_id } }),
    enabled: !!demanda.org_id && activeTab === "contato",
  });

  const suggestions = useMemo<ContactTag[]>(() => {
    const map = new Map<string, ContactTag>();
    for (const t of orgTags ?? []) map.set(t.label.toLowerCase(), t);
    for (const t of DEFAULT_TAG_SUGGESTIONS) {
      const k = t.label.toLowerCase();
      if (!map.has(k)) map.set(k, t);
    }
    return [...map.values()].sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
  }, [orgTags]);

  const selectedKeys = new Set(tags.map((t) => t.label.toLowerCase()));
  const filteredSuggestions = useMemo(() => {
    const q = tagQuery.trim().toLowerCase();
    return suggestions
      .filter((s) => !selectedKeys.has(s.label.toLowerCase()))
      .filter((s) => (q ? s.label.toLowerCase().includes(q) : true))
      .slice(0, 8);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suggestions, tagQuery, tags]);

  const exactExists =
    suggestions.some((s) => s.label.toLowerCase() === tagQuery.trim().toLowerCase()) ||
    selectedKeys.has(tagQuery.trim().toLowerCase());
  const canCreateTag = tagQuery.trim().length > 0 && tagQuery.trim().length <= 24 && !exactExists;

  // Sincroniza rascunhos quando troca o contato ou o valor salvo muda.
  useEffect(() => {
    setNotes(contact?.notes ?? "");
    setCompany(contact?.company ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contact?.id, contact?.notes, contact?.company]);

  const notesDirty = notes !== (contact?.notes ?? "");
  const companyDirty = company !== (contact?.company ?? "");

  // Feedback sutil de salvamento: flash "salvo" após cada mutation concluir.
  const wasSaving = useRef(false);
  const [savedFlash, setSavedFlash] = useState(false);
  useEffect(() => {
    if (wasSaving.current && !contactSaving) {
      setSavedFlash(true);
      wasSaving.current = contactSaving;
      const t = window.setTimeout(() => setSavedFlash(false), 1600);
      return () => window.clearTimeout(t);
    }
    wasSaving.current = contactSaving;
  }, [contactSaving]);

  const addTag = (tag: ContactTag) => {
    onSaveContact({ tags: [...tags, tag] });
    setTagOpen(false);
    setTagQuery("");
  };
  const createTag = (label: string) => {
    const clean = label.trim();
    if (!clean) return;
    addTag({ label: clean, color: colorForLabel(clean) });
    // Nova etiqueta vira sugestão da org inteira na hora.
    qc.invalidateQueries({ queryKey: ["org-tags", demanda.org_id] });
  };
  const removeTag = (label: string) => {
    onSaveContact({ tags: tags.filter((t) => t.label !== label) });
  };
  const saveCompany = () => {
    if (companyDirty) onSaveContact({ company: company.trim() || null });
  };
  const handleCopyPhone = async () => {
    if (!contact?.phone) return;
    try {
      await navigator.clipboard.writeText(contact.phone);
      toast.success("Telefone copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const memberLabel = (op: any) => op.name ?? op.email ?? nameOf(op.user_id);
  const assigneeOp = operators.find((op: any) => op.user_id === demanda.assignee_id);
  const assigneeLabel = assigneeOp
    ? memberLabel(assigneeOp)
    : demanda.assignee_id
      ? nameOf(demanda.assignee_id)
      : null;
  const protocolUpper = (demanda.protocol ?? "").toUpperCase();
  const confirmMatches = confirmText.trim().toUpperCase() === protocolUpper && protocolUpper !== "";

  const handleCopyProtocol = async () => {
    if (!demanda.protocol) return;
    try {
      await navigator.clipboard.writeText(demanda.protocol);
      toast.success("Protocolo copiado");
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const savingHint = contactSaving ? (
    <span className="text-[10px] text-muted-foreground animate-pulse">salvando…</span>
  ) : savedFlash ? (
    <span className="inline-flex items-center gap-1 text-[10px] text-[var(--pill-green-fg)]">
      <Check className="h-3 w-3" /> salvo
    </span>
  ) : null;

  return (
    <aside className="hidden lg:flex w-[320px] 2xl:w-[340px] shrink-0 flex-col border-l border-border/60 bg-surface/70">
      {/* Header FIXO h-12 (mesma altura do header do chat) */}
      <header className="h-12 shrink-0 border-b border-border/50 px-4 flex items-center justify-between">
        <h2 className="text-sm font-bold text-foreground">Propriedades</h2>
        <button
          type="button"
          onClick={onCollapseRail}
          title="Recolher propriedades"
          aria-label="Recolher propriedades"
          className="grid h-7 w-7 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </header>

      {/* Tabs */}
      <div className="shrink-0 border-b border-border/50 px-2">
        <div className="flex gap-1 py-2">
          {[
            { key: "demanda", label: "Demanda", icon: FileText },
            { key: "contato", label: "Contato", icon: User },
            { key: "notas", label: "Notas", icon: Tag },
          ].map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  activeTab === tab.key
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                }`}
              >
                <Icon className="h-3 w-3" />
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Conteúdo da aba */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-4 py-3">
        {activeTab === "demanda" && (
          <div className="space-y-1">
            {/* Protocolo em destaque no topo */}
            <KVRow label="Protocolo">
              <span className="inline-flex items-center gap-1">
                <span className="inline-flex h-8 items-center rounded-lg border border-border/60 bg-secondary/60 px-2.5 font-mono text-[11px] font-semibold tracking-wide text-foreground/80">
                  {demanda.protocol ?? "—"}
                </span>
                <button
                  type="button"
                  onClick={handleCopyProtocol}
                  title="Copiar protocolo"
                  aria-label="Copiar protocolo"
                  className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                >
                  <Copy className="h-3.5 w-3.5" />
                </button>
              </span>
            </KVRow>

            {/* Histórico do contato */}
            {contactStats && (
              <KVRow label="Histórico">
                {contactStats.total <= 1 ? (
                  <span className="inline-flex h-8 items-center rounded-lg bg-secondary/60 px-2.5 text-[11px] font-medium text-muted-foreground">
                    1ª demanda deste contato
                  </span>
                ) : (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button type="button" className={PILL_TRIGGER} title="Demandas deste contato">
                        <History className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="tabular-nums">
                          #{contactStats.posicao} de {contactStats.total}
                        </span>
                        <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                      </button>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-64 rounded-xl p-1.5">
                      <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                        Anteriores
                      </div>
                      {contactStats.anteriores.map((a: any) => (
                        <button
                          key={a.id}
                          type="button"
                          onClick={() => onOpenDemanda(a.id)}
                          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition hover:bg-secondary"
                        >
                          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
                            {a.protocol ?? "—"}
                          </span>
                          <span className="min-w-0 flex-1 truncate">{STATE_LABEL[a.state] ?? a.state}</span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {formatRelative(a.created_at)}
                          </span>
                        </button>
                      ))}
                      {contactStats.anteriores.length === 0 && (
                        <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                          Nenhuma anterior — esta é a mais recente do contato.
                        </div>
                      )}
                    </PopoverContent>
                  </Popover>
                )}
              </KVRow>
            )}

            {/* Estado */}
            <KVRow label="Estado">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button type="button" className={PILL_TRIGGER}>
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${STATE_DOT[demanda.state] ?? "bg-muted-foreground/40"}`}
                    />
                    <span>{STATE_LABEL[demanda.state] ?? demanda.state}</span>
                    <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52 rounded-xl">
                  {StateEnum.options.map((s) => (
                    <DropdownMenuItem
                      key={s}
                      onClick={() => onUpdate({ state: s })}
                      className="gap-2 rounded-lg text-xs cursor-pointer"
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${STATE_DOT[s] ?? "bg-muted-foreground/40"}`} />
                      <span className="flex-1">{STATE_LABEL[s]}</span>
                      {demanda.state === s && <Check className="h-3.5 w-3.5 text-primary" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </KVRow>

            {/* Prioridade */}
            <KVRow label="Prioridade">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={`inline-flex h-8 items-center gap-1.5 rounded-lg border px-2.5 text-[10px] font-bold uppercase tracking-wide transition ${PRIORITY_ACTIVE[demanda.priority]} ${PRIORITY_EDGE[demanda.priority]}`}
                  >
                    {demanda.priority}
                    <ChevronDown className="h-3 w-3 shrink-0 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44 rounded-xl">
                  {PriorityEnum.options.map((p) => (
                    <DropdownMenuItem
                      key={p}
                      onClick={() => onUpdate({ priority: p })}
                      className="gap-2 rounded-lg text-xs cursor-pointer"
                    >
                      <span className={`h-2 w-2 shrink-0 rounded-full ${PRIORITY_DOT[p]}`} />
                      <span className="flex-1 text-[10px] font-bold uppercase tracking-wide">{p}</span>
                      {demanda.priority === p && <Check className="h-3.5 w-3.5 text-primary" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </KVRow>

            {/* Prazo */}
            <KVRow label="Prazo">
              <DueDatePicker value={demanda.due_at ?? null} onChange={(v) => onUpdate({ due_at: v })} />
            </KVRow>

            {/* Responsável */}
            <KVRow label="Responsável">
              {isManager ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button type="button" className={PILL_TRIGGER} title={assigneeLabel ?? "Sem responsável"}>
                      {assigneeLabel ? (
                        <>
                          <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-primary/15 text-[8px] font-bold text-primary">
                            {initials(assigneeLabel)}
                          </span>
                          <span className="max-w-[150px] truncate">{assigneeLabel}</span>
                        </>
                      ) : (
                        <>
                          <UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                          <span className="text-muted-foreground">Atribuir</span>
                        </>
                      )}
                      <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-60 rounded-xl">
                    <DropdownMenuItem
                      onClick={() => onUpdate({ assignee_id: orgUserId ?? null })}
                      className="gap-2 rounded-lg text-xs cursor-pointer"
                    >
                      <UserCheck className="h-3.5 w-3.5" />
                      Atribuir pra mim
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {operators.map((op: any) => {
                      const label = memberLabel(op);
                      return (
                        <DropdownMenuItem
                          key={op.user_id}
                          onClick={() => onUpdate({ assignee_id: op.user_id })}
                          className="gap-2 rounded-lg text-xs cursor-pointer"
                        >
                          <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-secondary text-[8px] font-bold text-secondary-foreground">
                            {initials(label)}
                          </span>
                          <span className="flex-1 truncate">{label}</span>
                          <span className="shrink-0 text-[9px] uppercase tracking-wide text-muted-foreground/70">
                            {op.role}
                          </span>
                          {demanda.assignee_id === op.user_id && <Check className="h-3.5 w-3.5 text-primary" />}
                        </DropdownMenuItem>
                      );
                    })}
                    {demanda.assignee_id && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => onUpdate({ assignee_id: null })}
                          className="gap-2 rounded-lg text-xs cursor-pointer text-destructive focus:text-destructive"
                        >
                          <UserX className="h-3.5 w-3.5" />
                          Remover responsável
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-secondary/40 pl-2.5 pr-2.5 text-[11px] font-medium text-muted-foreground"
                  title={assigneeLabel ?? "Sem responsável"}
                >
                  {assigneeLabel ? (
                    <>
                      <span className="grid h-4 w-4 shrink-0 place-items-center rounded-full bg-secondary text-[8px] font-bold text-secondary-foreground">
                        {initials(assigneeLabel)}
                      </span>
                      <span className="max-w-[150px] truncate">{assigneeLabel}</span>
                    </>
                  ) : (
                    <>
                      <UserRound className="h-3.5 w-3.5" />
                      <span>Sem responsável</span>
                    </>
                  )}
                </span>
              )}
            </KVRow>
          </div>
        )}

        {activeTab === "contato" && (
          <div className="space-y-4">
            {hasContact ? (
              <>
                {/* Topo: avatar real + nome + telefone copiável */}
                <div className="flex items-center gap-3">
                  <ContactAvatar url={contact.avatar_url ?? null} name={contact.name || "Sem nome"} tone="client" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-foreground">
                      {contact.name || "Sem nome"}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <span className="truncate tabular-nums">{contact.phone || "Sem telefone"}</span>
                      {contact.phone && (
                        <button
                          type="button"
                          onClick={handleCopyPhone}
                          title="Copiar telefone"
                          aria-label="Copiar telefone"
                          className="grid h-5 w-5 shrink-0 place-items-center rounded text-muted-foreground/70 transition hover:bg-secondary hover:text-foreground"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* E-mail (leitura) + Empresa (edição inline) */}
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2 py-1.5">
                    <span className="w-20 shrink-0 text-[11px] font-medium text-muted-foreground">E-mail</span>
                    <span
                      className="min-w-0 flex-1 truncate text-right text-xs text-foreground/85"
                      title={contact.email ?? undefined}
                    >
                      {contact.email || "—"}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2 py-1.5">
                    <span className="w-20 shrink-0 text-[11px] font-medium text-muted-foreground">Empresa</span>
                    <input
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                      onBlur={saveCompany}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      placeholder="—"
                      maxLength={120}
                      className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-right text-xs text-foreground outline-none transition hover:border-border/60 focus:border-primary/50 focus:bg-background"
                    />
                  </div>
                </div>

                {/* Etiquetas: badges + combobox de sugestões/criação */}
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <span className="text-[11px] font-semibold text-muted-foreground">Etiquetas</span>
                    <span className="flex items-center gap-1.5">
                      {savingHint}
                      <span className="text-[10px] tabular-nums text-muted-foreground">{tags.length}/12</span>
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {tags.map((t) => (
                      <span
                        key={t.label}
                        className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold ${TAG_PILL[t.color] ?? "pill-neutral"}`}
                      >
                        {t.label}
                        <button
                          type="button"
                          onClick={() => removeTag(t.label)}
                          title={`Remover ${t.label}`}
                          aria-label={`Remover ${t.label}`}
                          className="opacity-70 transition hover:opacity-100"
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </span>
                    ))}
                    <Popover
                      open={tagOpen}
                      onOpenChange={(o) => {
                        setTagOpen(o);
                        if (!o) setTagQuery("");
                      }}
                    >
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          disabled={tags.length >= 12}
                          title={tags.length >= 12 ? "Limite de 12 etiquetas" : "Adicionar etiqueta"}
                          className="inline-flex h-7 items-center gap-1.5 rounded-md border border-dashed border-border/70 px-2 text-[10px] font-medium text-muted-foreground transition hover:border-primary/40 hover:text-foreground disabled:opacity-50"
                        >
                          <Plus className="h-3 w-3" />
                          Etiqueta
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-56 rounded-xl p-1.5">
                        <div className="relative mb-1">
                          <Search className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
                          <input
                            autoFocus
                            value={tagQuery}
                            onChange={(e) => setTagQuery(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                const exact = filteredSuggestions.find(
                                  (s) => s.label.toLowerCase() === tagQuery.trim().toLowerCase(),
                                );
                                if (exact) addTag(exact);
                                else if (canCreateTag) createTag(tagQuery);
                              }
                            }}
                            placeholder="Buscar ou criar..."
                            maxLength={24}
                            className="h-8 w-full rounded-md border border-border/60 bg-background pl-7 pr-2 text-[11px] outline-none transition focus:border-primary/50"
                          />
                        </div>
                        <div className="max-h-40 overflow-y-auto scrollbar-thin">
                          {filteredSuggestions.map((s) => (
                            <button
                              key={s.label}
                              type="button"
                              onClick={() => addTag(s)}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] transition hover:bg-secondary"
                            >
                              <span className={`h-2 w-2 shrink-0 rounded-full ${TAG_DOT[s.color]}`} />
                              <span className="min-w-0 flex-1 truncate">{s.label}</span>
                            </button>
                          ))}
                          {canCreateTag && (
                            <button
                              type="button"
                              onClick={() => createTag(tagQuery)}
                              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] font-medium text-primary transition hover:bg-secondary"
                            >
                              <Plus className="h-3 w-3 shrink-0" />
                              <span className="truncate">Criar etiqueta “{tagQuery.trim()}”</span>
                            </button>
                          )}
                          {filteredSuggestions.length === 0 && !canCreateTag && (
                            <div className="px-2 py-1.5 text-[11px] text-muted-foreground">
                              Nenhuma sugestão encontrada.
                            </div>
                          )}
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                  <User className="h-5 w-5" strokeWidth={1.8} />
                </div>
                <div className="text-sm font-semibold text-foreground">Sem contato</div>
                <p className="text-xs text-muted-foreground max-w-[240px]">
                  Esta demanda não está vinculada a um contato.
                </p>
              </div>
            )}
          </div>
        )}

        {activeTab === "notas" && (
          hasContact ? (
            <div className="space-y-2">
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Anotações permanentes sobre este cliente (preferências, contexto recorrente)..."
                maxLength={4000}
                className="min-h-28 w-full resize-y rounded-xl border border-border/60 bg-background p-3 text-xs outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
              />
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-[10px] tabular-nums text-muted-foreground">
                  {notes.length}/4000 {savingHint}
                </span>
                <button
                  type="button"
                  disabled={!notesDirty || contactSaving}
                  onClick={() => onSaveContact({ notes })}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-[11px] font-semibold text-primary-foreground transition hover:brightness-110 disabled:opacity-50"
                >
                  {!notesDirty && savedFlash && <Check className="h-3 w-3" />}
                  {contactSaving ? "Salvando..." : notesDirty ? "Salvar notas" : savedFlash ? "Salvo" : "Salvar notas"}
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-border/60 bg-secondary/30 p-3 text-[11px] text-muted-foreground">
              Sem contato vinculado — notas indisponíveis.
            </div>
          )
        )}
      </div>

      {/* Zona de perigo DISCRETA */}
      {canDelete && (
        <div className="shrink-0 border-t border-border/50 px-4 py-2.5">
          <button
            type="button"
            onClick={() => {
              setConfirmText("");
              setConfirmOpen(true);
            }}
            className="mx-auto flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-medium text-destructive/70 transition hover:bg-destructive/10 hover:text-destructive"
          >
            <Trash2 className="h-3 w-3" />
            Excluir demanda
          </button>
        </div>
      )}

      {/* Confirmação de exclusão: digitar o protocolo exatamente */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 backdrop-blur-sm p-4"
          onClick={() => setConfirmOpen(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-[var(--shadow-pop)] ring-1 ring-border/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-foreground">Excluir demanda</div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Ação permanente: histórico, mensagens e mídias serão removidos. Digite o protocolo para confirmar.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-center font-mono text-sm font-bold tracking-wide text-destructive">
              {demanda.protocol}
            </div>
            <input
              autoFocus
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder={demanda.protocol ?? "DM-XXXXXX"}
              className="mt-3 h-10 w-full rounded-xl border border-border/60 bg-background px-3 text-center font-mono text-xs outline-none transition focus:border-destructive/50 focus:ring-2 focus:ring-destructive/15"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="h-9 flex-1 rounded-xl bg-secondary text-xs font-semibold text-secondary-foreground transition hover:bg-secondary/80"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={!confirmMatches || deletePending}
                onClick={() => {
                  setConfirmOpen(false);
                  onDelete();
                }}
                className="h-9 flex-1 rounded-xl bg-destructive text-xs font-semibold text-destructive-foreground transition hover:brightness-110 disabled:opacity-50"
              >
                {deletePending ? "Excluindo..." : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}