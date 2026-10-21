import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getOrgBySlug, listMembers } from "@/lib/orgs.functions";
import { createInvite, listInvites, approveInvite, rejectInvite, updateMemberRole, removeMember } from "@/lib/invites.functions";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { Copy, Check, X, Trash2, UserPlus, Bot, Users, MailPlus, AlertTriangle } from "lucide-react";
import { SectionTitle, StatCard } from "@/components/section-ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// 👇 NOVAS IMPORTAÇÕES PARA GATE DE OPERADORES
import { getAccountAccess } from "@/lib/billing/account-access";
import { isWithinLimit } from "@/lib/billing/tier-contracts";

export const Route = createFileRoute("/_authenticated/app/o/$slug/equipe")({
  head: () => ({ meta: [{ title: "Gestão de Equipe — Fluxo" }] }),
  component: EquipePage,
});

const ROLE_LABEL: Record<string, string> = {
  owner: "Proprietário",
  admin: "Administrador",
  gerente: "Gerente",
  operador: "Operador",
  agente_ia: "Agente de IA",
};

const ROLE_OPTIONS = ["admin", "gerente", "operador", "agente_ia"] as const;
const MANAGER_ROLES = new Set(["owner", "admin", "gerente"]);

function initials(text: string) {
  return text.split(/[\s._@-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");
}

function MemberAvatar({ isAI, label }: { isAI: boolean; label: string }) {
  return (
    <span className={`h-8 w-8 shrink-0 rounded-full grid place-items-center text-[11px] font-bold ${isAI ? "pill-violet" : "pill-brand"}`}>
      {isAI ? "IA" : initials(label) || "?"}
    </span>
  );
}

/** Select do shadcn estilizado no mesmo tom compacto usado no resto do app. */
function RoleSelect({
  value, onChange, className = "",
}: {
  value: (typeof ROLE_OPTIONS)[number];
  onChange: (v: (typeof ROLE_OPTIONS)[number]) => void;
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as (typeof ROLE_OPTIONS)[number])}>
      <SelectTrigger className={`h-8 text-xs ${className}`}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {ROLE_OPTIONS.map((r) => (
          <SelectItem key={r} value={r} className="text-xs">{ROLE_LABEL[r]}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// 👇 COMPONENTE AUXILIAR: INDICADOR DE CAPACIDADE DA EQUIPE
function TeamCapacityIndicator({ 
  current, 
  limit, 
  tierCode 
}: { 
  current: number; 
  limit: number; 
  tierCode: string;
}) {
  // Evita divisão por zero se limit for 0 ou undefined
  const safeLimit = limit > 0 ? limit : 1;
  const percentage = Math.min(100, Math.round((current / safeLimit) * 100));
  const isFull = current >= limit;
  const isWarning = percentage >= 80 && !isFull;

  return (
    <div className="mb-4 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className={`font-medium ${isFull ? 'text-destructive' : 'text-muted-foreground'}`}>
          {isFull ? '⚠️ Limite atingido' : 'Uso da equipe'}: 
          <span className="ml-1 font-bold text-foreground">{current} de {limit} operadores</span>
        </span>
        {!isFull && (
          <span className={`font-mono ${isWarning ? 'text-amber-500' : 'text-muted-foreground'}`}>
            {percentage}%
          </span>
        )}
      </div>
      
      {/* Barra de Progresso Visual */}
      <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
        <div 
          className={`h-full transition-all duration-500 ease-out rounded-full ${
            isFull 
              ? 'bg-destructive' 
              : isWarning 
                ? 'bg-amber-500' 
                : 'bg-primary'
          }`} 
          style={{ width: `${percentage}%` }} 
        />
      </div>

      {isFull && (
        <p className="text-[11px] text-destructive leading-relaxed">
          Seu plano atual ({tierCode === 'operacao' ? 'Operação' : tierCode === 'crescimento' ? 'Crescimento' : 'Escala'}) suporta até {limit} membros. 
          <button 
            onClick={() => {
              // Navegação programática segura para a aba financeiro
              const slug = window.location.pathname.split('/')[3];
              window.location.href = `/app/o/${slug}/configuracoes?tab=financeiro`;
            }}
            className="ml-1 underline font-semibold hover:text-destructive/80"
          >
            Faça upgrade para liberar mais vagas.
          </button>
        </p>
      )}
    </div>
  );
}

function EquipePage() {
  const { slug } = useParams({ from: "/_authenticated/app/o/$slug/equipe" });
  const orgFn = useServerFn(getOrgBySlug);
  const { data: org } = useQuery({ queryKey: ["org", slug], queryFn: () => orgFn({ data: { slug } }) });
  const isManager = org && MANAGER_ROLES.has(org.role);

  const membersFn = useServerFn(listMembers);
  const invitesFn = useServerFn(listInvites);
  const createFn = useServerFn(createInvite);
  const approveFn = useServerFn(approveInvite);
  const rejectFn = useServerFn(rejectInvite);
  const updateRoleFn = useServerFn(updateMemberRole);
  const removeMemberFn = useServerFn(removeMember);
  
  // 👇 NOVA SERVER FN: Acesso da Conta (Tier + Features)
  const accessFn = useServerFn(getAccountAccess);
  
  const qc = useQueryClient();

  const { data: members } = useQuery({
    queryKey: ["members", org?.id], enabled: !!org?.id,
    queryFn: () => membersFn({ data: { orgId: org!.id } }),
  });

  const { data: invites } = useQuery({
    queryKey: ["invites", org?.id], enabled: !!org?.id && !!isManager,
    queryFn: () => invitesFn({ data: { orgId: org!.id } }),
  });

  // 👇 NOVA QUERY: Buscar acesso/features do tier atual
  const { data: access } = useQuery({
    queryKey: ["account-access", org?.id],
    queryFn: () => accessFn({ data: { orgId: org!.id } }),
    enabled: !!org?.id,
    staleTime: 1000 * 60 * 5, // 5 min cache
    retry: 0,
  });

  const [suggestedRole, setSuggestedRole] = useState<(typeof ROLE_OPTIONS)[number]>("operador");
  const [email, setEmail] = useState("");
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  // 👇 LÓGICA DE GATE: Verifica se pode adicionar membro baseado no tier
  const currentMembersCount = members?.length ?? 0;
  const tierCode = access?.tierCode ?? "operacao";
  const maxMembers = access?.features.maxTeamMembers ?? 2; // Fallback seguro
  const canAddMember = isWithinLimit(tierCode, "maxTeamMembers", currentMembersCount);
  const limitMessage = `Limite de ${maxMembers} operadores atingido. Faça upgrade em Configurações > Financeiro.`;

  const createM = useMutation({
    mutationFn: () => createFn({ data: { orgId: org!.id, suggestedRole, email: email || undefined } }),
    onSuccess: () => { setEmail(""); qc.invalidateQueries({ queryKey: ["invites"] }); toast.success("Convite criado. Copie o link e envie."); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const approveM = useMutation({
    mutationFn: (v: { id: string; role: (typeof ROLE_OPTIONS)[number] }) => approveFn({ data: { inviteId: v.id, role: v.role } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invites"] }); qc.invalidateQueries({ queryKey: ["members"] }); toast.success("Aprovado"); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const rejectM = useMutation({
    mutationFn: (id: string) => rejectFn({ data: { inviteId: id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["invites"] }); toast.success("Rejeitado"); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const roleM = useMutation({
    mutationFn: (v: { userId: string; role: (typeof ROLE_OPTIONS)[number] }) => updateRoleFn({ data: { orgId: org!.id, userId: v.userId, role: v.role } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["members"] }); toast.success("Papel atualizado"); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const removeM = useMutation({
    mutationFn: (userId: string) => removeMemberFn({ data: { orgId: org!.id, userId } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["members"] }); toast.success("Membro removido"); setConfirmRemoveId(null); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="p-4 sm:p-6 pb-24 sm:pb-6 max-w-4xl">
      <h1 className="flex items-center gap-2 text-xl sm:text-2xl font-bold tracking-tight">
        <Users className="h-5 w-5 text-primary" strokeWidth={2.2} /> Gestão de Equipe
      </h1>
      <p className="text-xs sm:text-sm text-muted-foreground">Convide pessoas, aprove solicitações e defina papéis.</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <StatCard icon={Users} label="Total de membros" value={members?.length ?? "—"} />
        <StatCard icon={Bot} label="Agentes de IA" value={(members ?? []).filter((m: any) => m.role === "agente_ia").length} tone="violet" />
        <StatCard icon={MailPlus} label="Convites pendentes" value={(invites ?? []).filter((i: any) => i.status === "pending").length} tone="amber" />
      </div>

      {isManager && (
        <section className="mt-6 rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold flex items-center gap-2 text-sm mb-4"><UserPlus className="h-4 w-4" /> Novo convite</h2>
          
          {/* 👇 INDICADOR DE CAPACIDADE (Sempre visível para gestores) */}
          <TeamCapacityIndicator 
            current={currentMembersCount} 
            limit={maxMembers} 
            tierCode={tierCode}
          />

          {/* 👇 AVISO VISUAL DE LIMITE ATINGIDO (Aparece apenas se cheio) */}
          {!canAddMember && (
            <div className="mb-4 flex items-start gap-2 rounded-md bg-destructive/10 p-3 text-xs text-destructive border border-destructive/20">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <p>{limitMessage}</p>
            </div>
          )}

          <form
            onSubmit={(e) => { e.preventDefault(); if (canAddMember) createM.mutate(); }}
            className="grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-2"
          >
            <input 
              value={email} 
              onChange={(e) => setEmail(e.target.value)} 
              type="email" 
              placeholder="E-mail (opcional, informativo)"
              className="h-10 px-3 rounded-md border border-input bg-background text-sm disabled:opacity-50 disabled:bg-muted/20"
              disabled={!canAddMember}
            />
            <RoleSelect 
              value={suggestedRole} 
              onChange={setSuggestedRole} 
              className="h-10" 
            />
            
            {/* 👇 BOTÃO DESABILITADO SE LIMITE ATINGIDO */}
            <button 
              disabled={createM.isPending || !canAddMember} 
              className={`h-10 px-4 rounded-md font-medium text-sm transition-colors ${
                canAddMember 
                  ? "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60" 
                  : "bg-muted text-muted-foreground cursor-not-allowed border border-border"
              }`}
              title={!canAddMember ? limitMessage : undefined}
            >
              {createM.isPending ? "Gerando..." : (canAddMember ? "Gerar link" : "Indisponível")}
            </button>
          </form>
          
          {!canAddMember ? (
             <p className="text-[11px] text-muted-foreground mt-2 italic">
               Remova um membro existente ou faça upgrade de plano para gerar novos convites.
             </p>
          ) : (
             <p className="text-xs text-muted-foreground mt-2">Envie o link para a pessoa. Após ela abrir e entrar, aparece aqui como pendente para você aprovar.</p>
          )}
        </section>
      )}

      {isManager && (
        <section className="mt-6">
          <SectionTitle icon={MailPlus} title="Convites" hint="Links gerados e solicitações aguardando aprovação." />
          <div className="card-elevated overflow-hidden">
            {(invites ?? []).length === 0 && <div className="p-4 text-sm text-muted-foreground">Nenhum convite.</div>}
            {invites?.map((inv: any) => {
              const link = `${origin}/convite/${inv.token}`;
              return (
                <div key={inv.id} className="p-3 sm:p-4 border-b border-border last:border-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={inv.status} />
                    <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">Sugerido: {ROLE_LABEL[inv.suggested_role] ?? inv.suggested_role}</span>
                    {inv.email && <span className="text-xs text-muted-foreground truncate">{inv.email}</span>}
                  </div>
                  {inv.status === "pending" && !inv.requested_by && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <code className="text-[11px] text-muted-foreground break-all flex-1 min-w-0">{link}</code>
                      <button onClick={() => { navigator.clipboard.writeText(link); toast.success("Link copiado"); }}
                        className="p-2 rounded-md hover:bg-secondary shrink-0" title="Copiar link"><Copy className="h-4 w-4" /></button>
                    </div>
                  )}
                  {inv.status === "pending" && inv.requested_by && (
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-sm flex-1 min-w-[180px]">
                        Solicitação de <b>{inv.requester_email ?? "usuário"}</b>
                      </div>
                      <ApproveControls onApprove={(role) => approveM.mutate({ id: inv.id, role })} defaultRole={inv.suggested_role} />
                      <button onClick={() => rejectM.mutate(inv.id)} className="h-9 px-3 rounded-md border border-border text-sm hover:bg-secondary inline-flex items-center gap-1">
                        <X className="h-4 w-4" /> Rejeitar
                      </button>
                    </div>
                  )}
                  {inv.status === "approved" && (
                    <div className="text-xs text-muted-foreground">Aprovado como {ROLE_LABEL[inv.approved_role] ?? inv.approved_role}</div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="mt-8">
        <SectionTitle icon={Users} title="Membros" hint="Papéis definem o que cada pessoa pode fazer." />
        <div className="card-elevated overflow-hidden">
          {members?.map((m: any) => {
            const isAI = m.role === "agente_ia";
            const label = m.email ?? m.user_id.slice(0, 8);
            const isMe = m.user_id === org?.userId;
            return (
              <div key={m.id} className="row-zebra flex flex-wrap items-center gap-3 p-3 border-b border-border last:border-0">
                <MemberAvatar isAI={isAI} label={label} />
                <div className="flex items-center gap-1.5 flex-1 min-w-0 text-sm">
                  <span className="truncate">{label}</span>
                  {isMe && <span className="shrink-0 text-[10px] font-semibold text-primary">Você</span>}
                </div>
                {isManager && m.role !== "owner" ? (
                  <RoleSelect
                    value={m.role}
                    onChange={(role) => roleM.mutate({ userId: m.user_id, role })}
                    className="w-[150px]"
                  />
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">{ROLE_LABEL[m.role] ?? m.role}</span>
                )}
                {isManager && m.role !== "owner" && (
                  confirmRemoveId === m.user_id ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs text-muted-foreground hidden sm:inline">Remover?</span>
                      <button
                        onClick={() => removeM.mutate(m.user_id)}
                        disabled={removeM.isPending}
                        className="h-8 px-2.5 rounded-md bg-destructive text-destructive-foreground text-xs font-semibold disabled:opacity-60"
                      >
                        {removeM.isPending ? "..." : "Confirmar"}
                      </button>
                      <button
                        onClick={() => setConfirmRemoveId(null)}
                        className="h-8 px-2.5 rounded-md border border-border text-xs hover:bg-secondary"
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmRemoveId(m.user_id)}
                      className="p-2 rounded-md hover:bg-destructive/10 text-destructive"
                      title="Remover"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending: "bg-[oklch(0.65_0.18_80/0.15)] text-[oklch(0.42_0.15_80)] border-[oklch(0.65_0.18_80/0.3)]",
    approved: "bg-[oklch(0.6_0.17_160/0.15)] text-[oklch(0.4_0.17_160)] border-[oklch(0.6_0.17_160/0.3)]",
    rejected: "bg-muted text-muted-foreground border-border",
  };
  const label: Record<string, string> = { pending: "Pendente", approved: "Aprovado", rejected: "Rejeitado" };
  return <span className={`text-xs px-2 py-0.5 rounded border ${map[status] ?? ""}`}>{label[status] ?? status}</span>;
}

function ApproveControls({ onApprove, defaultRole }: { onApprove: (role: (typeof ROLE_OPTIONS)[number]) => void; defaultRole: string }) {
  const initial = (ROLE_OPTIONS as readonly string[]).includes(defaultRole) ? defaultRole as (typeof ROLE_OPTIONS)[number] : "operador";
  const [role, setRole] = useState<(typeof ROLE_OPTIONS)[number]>(initial);
  return (
    <div className="flex items-center gap-1">
      <RoleSelect value={role} onChange={setRole} className="w-[140px]" />
      <button onClick={() => onApprove(role)} className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm inline-flex items-center gap-1">
        <Check className="h-4 w-4" /> Aprovar
      </button>
    </div>
  );
}