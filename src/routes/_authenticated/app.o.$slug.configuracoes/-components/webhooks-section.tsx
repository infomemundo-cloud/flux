import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Eye, EyeOff, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  listWebhookTokens,
  createWebhookToken,
  deleteWebhookToken,
} from "@/lib/demandas/webhook-tokens.functions";

const EXAMPLE_BODY = `{ "message": "Cliente pediu segunda via da fatura", "contact": { "name": "Maria", "phone": "+5511999999999" }, "channel_kind": "whatsapp", "priority": "media" }`;

/** Mostra só o começo/fim do token por padrão — é um segredo de verdade. */
function maskToken(token: string) {
  if (token.length <= 12) return token;
  return `${token.slice(0, 7)}${"•".repeat(10)}${token.slice(-4)}`;
}

/** Endpoint público de ingestão + CRUD de tokens (guard assertOrgAdmin no servidor). */
export function WebhooksSection({ orgId, origin }: { orgId: string; origin: string }) {
  const tokensFn = useServerFn(listWebhookTokens);
  const createTok = useServerFn(createWebhookToken);
  const deleteTok = useServerFn(deleteWebhookToken);
  const qc = useQueryClient();
  const { data: tokens } = useQuery({
    queryKey: ["tokens", orgId],
    queryFn: () => tokensFn({ data: { orgId } }),
  });
  const [tokName, setTokName] = useState("");
  const [revealedTokens, setRevealedTokens] = useState<Set<string>>(new Set());
  const [confirmDeleteTokenId, setConfirmDeleteTokenId] = useState<string | null>(null);

  const toggleReveal = (id: string) =>
    setRevealedTokens((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const createM = useMutation({
    mutationFn: () => createTok({ data: { orgId, name: tokName } }),
    onSuccess: () => {
      setTokName("");
      qc.invalidateQueries({ queryKey: ["tokens"] });
      toast.success("Token criado");
    },
    onError: (e: any) => toast.error(e.message),
  });
  const deleteM = useMutation({
    mutationFn: (id: string) => deleteTok({ data: { id } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tokens"] });
      toast.success("Removido");
      setConfirmDeleteTokenId(null);
    },
  });

  return (
    <div className="space-y-4">
      <div className="card-elevated space-y-2 p-4 font-mono text-xs">
        <div>
          <span className="text-muted-foreground">POST</span> {origin}/api/public/ingest/<b>{"{token}"}</b>
        </div>
        <div className="text-muted-foreground">Body:</div>
        <pre className="overflow-x-auto rounded-md bg-secondary/60 p-3">{EXAMPLE_BODY}</pre>
      </div>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (tokName.trim()) createM.mutate();
        }}
      >
        <input
          value={tokName}
          onChange={(e) => setTokName(e.target.value)}
          placeholder="Nome do token (ex: Evolution WhatsApp)"
          className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-card px-3 text-sm placeholder:text-muted-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        />
        <button className="inline-flex h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90">
          <Plus className="h-4 w-4" /> Gerar token
        </button>
      </form>
      <div className="card-elevated overflow-hidden">
        {tokens?.length === 0 && (
          <div className="p-4 text-sm text-muted-foreground">Nenhum token gerado ainda.</div>
        )}
        {tokens?.map((t: any) => {
          const revealed = revealedTokens.has(t.id);
          return (
            <div key={t.id} className="row-zebra flex flex-wrap items-center gap-3 border-b border-border p-3 last:border-0">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg pill-green">
                <KeyRound className="h-4 w-4" strokeWidth={2.2} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{t.name}</div>
                <code className="break-all text-xs text-muted-foreground">
                  {revealed ? t.token : maskToken(t.token)}
                </code>
              </div>
              <button
                title={revealed ? "Ocultar token" : "Revelar token"}
                aria-label={revealed ? "Ocultar token" : "Revelar token"}
                onClick={() => toggleReveal(t.id)}
                className="shrink-0 rounded-md p-2 hover:bg-secondary"
              >
                {revealed ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
              <button
                title="Copiar"
                aria-label="Copiar token"
                onClick={() => {
                  navigator.clipboard.writeText(t.token);
                  toast.success("Copiado");
                }}
                className="shrink-0 rounded-md p-2 hover:bg-secondary"
              >
                <Copy className="h-4 w-4" />
              </button>
              {confirmDeleteTokenId === t.id ? (
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    onClick={() => deleteM.mutate(t.id)}
                    disabled={deleteM.isPending}
                    className="h-8 rounded-md bg-destructive px-2.5 text-xs font-semibold text-destructive-foreground disabled:opacity-60"
                  >
                    {deleteM.isPending ? "..." : "Confirmar"}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteTokenId(null)}
                    className="h-8 rounded-md border border-border px-2.5 text-xs hover:bg-secondary"
                  >
                    Cancelar
                  </button>
                </div>
              ) : (
                <button
                  title="Remover"
                  aria-label="Remover token"
                  onClick={() => setConfirmDeleteTokenId(t.id)}
                  className="shrink-0 rounded-md p-2 text-destructive hover:bg-destructive/10"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}