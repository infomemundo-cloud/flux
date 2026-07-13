import { createFileRoute, useParams } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { getOrgBySlug, listMembers } from "@/lib/orgs.functions";
import { createInvite, listInvites, approveInvite, rejectInvite, updateMemberRole, removeMember } from "@/lib/invites.functions";
import { toast } from "sonner";
import { friendlyError } from "@/lib/friendly-error";
import { Copy, Check, X, Trash2, UserPlus, Bot } from "lucide-react";

export const Route = createFileRoute("/_authenticated/app/o/$slug/equipe")({
  head: () => ({ meta: [{ title: "Gestão de Equipe — Fluxo" }] }),
  component: EquipePage,
});

const ROLE_LABEL: Record<string, string> = {
  owner: "Owner",
  admin: "Administrador",
  gerente: "Gerente",
  operador: "Operador",
  agente_ia: "Agente de IA",
};

const ROLE_OPTIONS = ["admin", "gerente", "operador", "agente_ia"] as const;
const MANAGER_ROLES = new Set(["owner", "admin", "gerente"]);

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
  const qc = useQueryClient();

  const { data: members } = useQuery({
    queryKey: ["members", org?.id], enabled: !!org?.id,
    queryFn: () => membersFn({ data: { orgId: org!.id } }),
  });
  const { data: invites } = useQuery({
    queryKey: ["invites", org?.id], enabled: !!org?.id && !!isManager,
    queryFn: () => invitesFn({ data: { orgId: org!.id } }),
  });

  const [suggestedRole, setSuggestedRole] = useState<(typeof ROLE_OPTIONS)[number]>("operador");
  const [email, setEmail] = useState("");

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
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["members"] }); toast.success("Membro removido"); },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  return (
    <div className="p-4 sm:p-6 pb-24 sm:pb-6 max-w-4xl">
      <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Gestão de Equipe</h1>
      <p className="text-xs sm:text-sm text-muted-foreground">Convide pessoas, aprove solicitações e defina papéis.</p>

      {isManager && (
        <section className="mt-6 rounded-lg border border-border bg-card p-4">
          <h2 className="font-semibold flex items-center gap-2 text-sm"><UserPlus className="h-4 w-4" /> Novo convite</h2>
          <form
            onSubmit={(e) => { e.preventDefault(); createM.mutate(); }}
            className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_180px_auto] gap-2"
          >
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="E-mail (opcional, informativo)"
              className="h-10 px-3 rounded-md border border-input bg-background text-sm" />
            <select value={suggestedRole} onChange={(e) => setSuggestedRole(e.target.value as any)}
              className="h-10 px-3 rounded-md border border-input bg-background text-sm">
              {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
            </select>
            <button disabled={createM.isPending} className="h-10 px-4 rounded-md bg-primary text-primary-foreground font-medium disabled:opacity-60 text-sm">
              {createM.isPending ? "Gerando..." : "Gerar link"}
            </button>
          </form>
          <p className="text-xs text-muted-foreground mt-2">Envie o link para a pessoa. Após ela abrir e entrar, aparece aqui como pendente para você aprovar.</p>
        </section>
      )}

      {isManager && (
        <section className="mt-6">
          <h2 className="font-semibold text-sm">Convites</h2>
          <div className="mt-2 rounded-lg border border-border bg-card overflow-hidden">
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
        <h2 className="font-semibold text-sm">Membros</h2>
        <div className="mt-2 rounded-lg border border-border bg-card overflow-hidden">
          {members?.map((m: any) => (
            <div key={m.id} className="flex flex-wrap items-center gap-2 p-3 border-b border-border last:border-0">
              <div className="flex items-center gap-2 flex-1 min-w-0 text-sm">
                {m.role === "agente_ia" && <Bot className="h-4 w-4 text-primary shrink-0" />}
                <span className="truncate">{m.email ?? m.user_id}</span>
              </div>
              {isManager && m.role !== "owner" ? (
                <select
                  value={m.role}
                  onChange={(e) => roleM.mutate({ userId: m.user_id, role: e.target.value as any })}
                  className="h-8 px-2 rounded border border-input bg-background text-xs"
                >
                  {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              ) : (
                <span className="text-xs px-2 py-0.5 rounded bg-secondary text-secondary-foreground">{ROLE_LABEL[m.role] ?? m.role}</span>
              )}
              {isManager && m.role !== "owner" && (
                <button onClick={() => { if (confirm("Remover este membro?")) removeM.mutate(m.user_id); }}
                  className="p-2 rounded-md hover:bg-destructive/10 text-destructive" title="Remover">
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
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
      <select value={role} onChange={(e) => setRole(e.target.value as any)}
        className="h-9 px-2 rounded-md border border-input bg-background text-xs">
        {ROLE_OPTIONS.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
      </select>
      <button onClick={() => onApprove(role)} className="h-9 px-3 rounded-md bg-primary text-primary-foreground text-sm inline-flex items-center gap-1">
        <Check className="h-4 w-4" /> Aprovar
      </button>
    </div>
  );
}

const ROLE_LABEL_EXPORT = ROLE_LABEL;
export { ROLE_LABEL_EXPORT as ROLE_LABEL };