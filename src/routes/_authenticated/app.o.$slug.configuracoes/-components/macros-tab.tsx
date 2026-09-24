import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, Plus, Save, Trash2, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  listQuickReplies,
  createQuickReply,
  updateQuickReply,
  deleteQuickReply,
  type QuickReply,
} from "@/lib/quick-replies.functions";
import { friendlyError } from "@/lib/friendly-error";
import { SectionTitle } from "@/components/section-ui";

/**
 * Aba Macros: CRUD completo de respostas rápidas da org.
 * Cache ["quick-replies", orgId] sincronizado com o picker do composer
 (DemandaComposer) — criar/editar/excluir aqui reflete lá na hora.
 */
export function MacrosTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listQuickReplies);
  const createFn = useServerFn(createQuickReply);
  const updateFn = useServerFn(updateQuickReply);
  const deleteFn = useServerFn(deleteQuickReply);

  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editContent, setEditContent] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [newContent, setNewContent] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { data: macros, isLoading } = useQuery({
    queryKey: ["quick-replies", orgId],
    queryFn: () => listFn({ data: { orgId } }),
  });

  const create = useMutation({
    mutationFn: () =>
      createFn({ data: { orgId, label: newLabel.trim(), content: newContent.trim() } }),
    onSuccess: () => {
      setNewLabel("");
      setNewContent("");
      qc.invalidateQueries({ queryKey: ["quick-replies", orgId] });
      toast.success("Macro criada");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
  const update = useMutation({
    mutationFn: () =>
      updateFn({ data: { id: editingId!, label: editLabel.trim(), content: editContent.trim() } }),
    onSuccess: () => {
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["quick-replies", orgId] });
      toast.success("Macro atualizada");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });
  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      setConfirmDeleteId(null);
      qc.invalidateQueries({ queryKey: ["quick-replies", orgId] });
      toast.success("Macro excluída");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const startEdit = (m: QuickReply) => {
    setEditingId(m.id);
    setEditLabel(m.label);
    setEditContent(m.content);
  };
  const cancelEdit = () => {
    setEditingId(null);
    setEditLabel("");
    setEditContent("");
  };
  const filtered = (macros ?? []).filter((m) => {
    const q = search.trim().toLowerCase();
    return !q || m.label.toLowerCase().includes(q) || m.content.toLowerCase().includes(q);
  });

  return (
    <section className="space-y-6">
      <SectionTitle
        icon={Zap}
        title="Macros / Respostas Rápidas"
        hint="Textos prontos que a equipe usa no composer (gatilho '/' ou botão de atalho). Compartilhadas por toda a organização."
      />
      <div className="card-elevated space-y-3 p-4">
        <div className="flex items-center gap-2">
          <Plus className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Criar nova macro</span>
        </div>
        <input
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          placeholder="Nome da macro (ex: boas-vindas, prazo)"
          maxLength={60}
          className="h-10 w-full rounded-lg border border-border bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        <textarea
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          placeholder="Texto que será inserido no composer..."
          rows={3}
          maxLength={4000}
          className="w-full rounded-lg border border-border bg-card p-3 text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        <div className="flex justify-end">
          <button
            type="button"
            disabled={!newLabel.trim() || !newContent.trim() || create.isPending}
            onClick={() => create.mutate()}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
          >
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Criar macro
          </button>
        </div>
      </div>
      <div className="card-elevated overflow-hidden">
        <div className="border-b border-border p-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou conteúdo..."
            className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
          />
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            <Loader2 className="mx-auto h-5 w-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-sm text-muted-foreground">
            {macros?.length === 0 ? "Nenhuma macro criada ainda." : "Nenhuma macro encontrada."}
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((m) => (
              <div key={m.id} className="p-4">
                {editingId === m.id ? (
                  <div className="space-y-3">
                    <input
                      value={editLabel}
                      onChange={(e) => setEditLabel(e.target.value)}
                      placeholder="Nome da macro"
                      maxLength={60}
                      className="h-9 w-full rounded-lg border border-border bg-card px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    />
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      placeholder="Conteúdo da macro"
                      rows={3}
                      maxLength={4000}
                      className="w-full rounded-lg border border-border bg-card p-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={!editLabel.trim() || !editContent.trim() || update.isPending}
                        onClick={() => update.mutate()}
                        className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground transition hover:opacity-90 disabled:opacity-60"
                      >
                        {update.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Salvar
                      </button>
                      <button
                        type="button"
                        onClick={cancelEdit}
                        className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm font-semibold hover:bg-secondary"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
                      <Zap className="h-4 w-4" strokeWidth={2.2} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold">{m.label}</div>
                      <div className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{m.content}</div>
                      <div className="mt-1 text-[10px] text-muted-foreground/70">
                        Criada em {new Date(m.created_at).toLocaleDateString("pt-BR")}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button
                        type="button"
                        title="Editar"
                        aria-label="Editar macro"
                        onClick={() => startEdit(m)}
                        className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      {confirmDeleteId === m.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={remove.isPending}
                            onClick={() => remove.mutate(m.id)}
                            className="h-8 rounded-lg bg-destructive px-2.5 text-xs font-semibold text-destructive-foreground disabled:opacity-60"
                          >
                            {remove.isPending ? "..." : "Confirmar"}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="h-8 rounded-lg border border-border px-2.5 text-xs hover:bg-secondary"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          title="Excluir"
                          aria-label="Excluir macro"
                          onClick={() => setConfirmDeleteId(m.id)}
                          className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}