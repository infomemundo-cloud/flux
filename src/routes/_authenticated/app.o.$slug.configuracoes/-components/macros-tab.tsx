import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Plus, Search, Trash2, X, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  listQuickReplies,
  createQuickReply,
  updateQuickReply,
  deleteQuickReply,
  type QuickReply,
} from "@/lib/quick-replies.functions";
import { friendlyError } from "@/lib/friendly-error";

const LABEL_MAX = 60;
const CONTENT_MAX = 4000;

/**
 * Aba Macros — Master-Detail compacto em grid 12 colunas:
 * - ESQUERDA (lg:col-span-5): acervo com busca instantânea; a lista
 *   ABRAÇA o conteúdo (sem min-height) e só rola ao passar de
 *   max-h-[420px] — 1 macro = card pequeno, N macros = card cresce;
 * - DIREITA (lg:col-span-7): editor com a PRÓPRIA altura (grid com
 *   items-start — colunas não casam mais altura), textarea rows={4}
 *   e estado neutro py-10;
 * - Mobile: empilha e rola até o editor ao selecionar.
 *
 * BOTÕES DE AJUSTE DE TAMANHO (procure estas classes):
 *   max-h-[420px]  → teto da lista antes do scroll interno
 *   rows={4}       → altura do textarea do editor
 *   py-10          → respiro do estado neutro
 *   items-start    → colunas com alturas independentes
 *   lg:col-span-5/7→ proporção das colunas
 *
 * Cache ["quick-replies", orgId] sincronizado com o picker `/` do composer;
 * RBAC owner/admin na rota; guards de escrita no server; validação client
 * espelha o zod do server (controlled state, padrão do projeto).
 */
type EditorMode = { kind: "idle" } | { kind: "create" } | { kind: "edit"; id: string };

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
  });
}

export function MacrosTab({ orgId }: { orgId: string }) {
  const qc = useQueryClient();
  const listFn = useServerFn(listQuickReplies);
  const createFn = useServerFn(createQuickReply);
  const updateFn = useServerFn(updateQuickReply);
  const deleteFn = useServerFn(deleteQuickReply);

  const [search, setSearch] = useState("");
  const [mode, setMode] = useState<EditorMode>({ kind: "idle" });
  const [label, setLabel] = useState("");
  const [content, setContent] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<QuickReply | null>(null);
  const editorRef = useRef<HTMLDivElement | null>(null);

  const { data: macros, isLoading } = useQuery({
    queryKey: ["quick-replies", orgId],
    queryFn: () => listFn({ data: { orgId } }),
  });

  const create = useMutation({
    mutationFn: () =>
      createFn({ data: { orgId, label: label.trim(), content: content.trim() } }),
    onSuccess: () => {
      setMode({ kind: "idle" });
      setLabel("");
      setContent("");
      qc.invalidateQueries({ queryKey: ["quick-replies", orgId] });
      toast.success("Macro criada");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const update = useMutation({
    mutationFn: (id: string) =>
      updateFn({ data: { id, label: label.trim(), content: content.trim() } }),
    onSuccess: () => {
      setMode({ kind: "idle" });
      qc.invalidateQueries({ queryKey: ["quick-replies", orgId] });
      toast.success("Macro atualizada");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: (_r, id) => {
      setConfirmDelete(null);
      setMode((m) => (m.kind === "edit" && m.id === id ? { kind: "idle" } : m));
      qc.invalidateQueries({ queryKey: ["quick-replies", orgId] });
      toast.success("Macro excluída");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const startCreate = () => {
    setMode({ kind: "create" });
    setLabel("");
    setContent("");
  };

  const startEdit = (m: QuickReply) => {
    setMode({ kind: "edit", id: m.id });
    setLabel(m.label);
    setContent(m.content);
  };

  const cancelEdit = () => setMode({ kind: "idle" });

  // Mobile: ao abrir o editor, rola até ele (colunas empilham).
  useEffect(() => {
    if (mode.kind === "idle") return;
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      editorRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [mode]);

  const filtered = (macros ?? []).filter((m) => {
    const q = search.trim().toLowerCase();
    return !q || m.label.toLowerCase().includes(q) || m.content.toLowerCase().includes(q);
  });

  const selectedId = mode.kind === "edit" ? mode.id : null;
  const labelOk = label.trim().length >= 1 && label.trim().length <= LABEL_MAX;
  const contentOk = content.trim().length >= 1 && content.trim().length <= CONTENT_MAX;
  const canSave = labelOk && contentOk;
  const saving = create.isPending || update.isPending;

  return (
    <section>
      {/* items-start: cada coluna com a própria altura (sem card gigante) */}
      <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
        {/* COLUNA ESQUERDA — Acervo (5/12), altura abraça o conteúdo */}
        <div className="lg:col-span-5">
          <div className="card-elevated flex flex-col overflow-hidden">
            <div className="flex items-center justify-between gap-2 border-b border-border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <Zap className="h-4 w-4 shrink-0 text-primary" strokeWidth={2.2} />
                  <span className="truncate text-sm font-semibold">Respostas Rápidas (Macros)</span>
                </div>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Textos prontos que a equipe usa no composer (gatilho "/").
                </p>
              </div>
              <button
                type="button"
                onClick={startCreate}
                className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-sm transition hover:brightness-110"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                Nova Macro
              </button>
            </div>

            <div className="border-b border-border p-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar por atalho ou conteúdo..."
                  className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-7 text-xs outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => setSearch("")}
                    aria-label="Limpar busca"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            </div>

            {/* Lista: SEM min-height — cresce com as macros até o teto,
                depois rola internamente. */}
            <div className="max-h-[420px] overflow-y-auto scrollbar-thin p-2">
              {isLoading ? (
                <div className="grid place-items-center p-6 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : (macros ?? []).length === 0 ? (
                <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
                    <Zap className="h-5 w-5" strokeWidth={2} />
                  </span>
                  <div>
                    <div className="text-xs font-semibold">Nenhuma macro ainda</div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Crie a primeira resposta rápida pra equipe ganhar velocidade.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={startCreate}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:brightness-110"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.5} />
                    Criar primeira macro
                  </button>
                </div>
              ) : filtered.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  Nenhuma macro encontrada para "{search}".
                </div>
              ) : (
                <div className="space-y-1.5">
                  {filtered.map((m) => {
                    const selected = selectedId === m.id;
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => startEdit(m)}
                        className={`w-full rounded-lg border p-3 text-left transition ${
                          selected
                            ? "border-primary/60 bg-primary/5 ring-1 ring-primary/30"
                            : "border-border hover:border-primary/40 hover:bg-secondary/40"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="truncate font-mono text-xs font-semibold text-primary">
                            /{m.label}
                          </span>
                          <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
                            {shortDate(m.created_at)}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                          {m.content}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* COLUNA DIREITA — Editor (7/12), altura própria */}
        <div className="lg:col-span-7">
          <div ref={editorRef} className="card-elevated scroll-mt-4 p-4">
            {mode.kind === "idle" ? (
              <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-secondary text-muted-foreground">
                  <Zap className="h-5 w-5" strokeWidth={1.8} />
                </span>
                <div>
                  <div className="text-sm font-semibold">Nenhuma macro selecionada</div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Selecione uma macro para editar ou crie uma nova.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold">
                    {mode.kind === "create" ? "Nova macro" : "Editando macro"}
                  </span>
                  <button
                    type="button"
                    onClick={cancelEdit}
                    aria-label="Fechar editor"
                    className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Atalho / Rótulo
                  </label>
                  <div className="relative">
                    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">
                      /
                    </span>
                    <input
                      value={label}
                      onChange={(e) => setLabel(e.target.value)}
                      maxLength={LABEL_MAX}
                      placeholder="boas-vindas, prazo, pix..."
                      className="h-10 w-full rounded-lg border border-border bg-card pl-7 pr-3 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Conteúdo da mensagem
                  </label>
                  <div className="relative">
                    <textarea
                      value={content}
                      onChange={(e) => setContent(e.target.value)}
                      maxLength={CONTENT_MAX}
                      rows={4}
                      placeholder="Texto que será inserido no composer..."
                      className="w-full resize-y rounded-lg border border-border bg-card p-3 pb-6 text-sm outline-none transition focus:border-primary/50 focus:ring-2 focus:ring-primary/15"
                    />
                    <span className="pointer-events-none absolute bottom-2 right-3 text-[10px] tabular-nums text-muted-foreground/70">
                      {content.length} / {CONTENT_MAX}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 border-t border-border pt-3">
                  {mode.kind === "edit" ? (
                    <button
                      type="button"
                      onClick={() => {
                        const m = (macros ?? []).find((x) => x.id === mode.id);
                        if (m) setConfirmDelete(m);
                      }}
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-destructive transition hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Excluir Macro
                    </button>
                  ) : (
                    <span />
                  )}
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-xs font-semibold transition hover:bg-secondary"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      disabled={!canSave || saving}
                      onClick={() =>
                        mode.kind === "create" ? create.mutate() : update.mutate(mode.id)
                      }
                      className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-xs font-semibold text-primary-foreground shadow-sm transition hover:brightness-110 disabled:opacity-60"
                    >
                      {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {mode.kind === "create" ? "Criar macro" : "Salvar Alterações"}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de confirmação de exclusão (2 passos) */}
      {confirmDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Confirmar exclusão de macro"
          className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4 backdrop-blur-sm"
          onClick={() => setConfirmDelete(null)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-card p-5 shadow-[var(--shadow-pop)] ring-1 ring-border/50"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm font-bold">Excluir macro?</div>
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="font-mono font-semibold text-foreground">/{confirmDelete.label}</span>{" "}
              será removida pra toda a equipe. Essa ação não pode ser desfeita.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="h-9 flex-1 rounded-xl bg-secondary text-xs font-semibold text-secondary-foreground transition hover:bg-secondary/80"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={remove.isPending}
                onClick={() => remove.mutate(confirmDelete.id)}
                className="h-9 flex-1 rounded-xl bg-destructive text-xs font-semibold text-destructive-foreground transition hover:brightness-110 disabled:opacity-50"
              >
                {remove.isPending ? <Loader2 className="mx-auto h-4 w-4 animate-spin" /> : "Excluir"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}