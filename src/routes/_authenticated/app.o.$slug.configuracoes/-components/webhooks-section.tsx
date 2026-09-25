import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Copy, Eye, EyeOff, KeyRound, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import {
  createWebhookToken,
  deleteWebhookToken,
  listWebhookTokens,
} from "@/lib/demandas/webhook-tokens.functions";
import { InfoTip } from "@/components/info-tip";
import { Input } from "@/components/ui/input";

const EXAMPLE_BODY = `{ "message": "Cliente pediu segunda via da fatura", "contact": { "name": "Maria", "phone": "+5511999999999" }, "channel_kind": "whatsapp", "priority": "media" }`;

/** Mostra só o começo/fim do token por padrão — é um segredo de verdade. */
function maskToken(token: string) {
  if (token.length <= 12) return token;
  return `${token.slice(0, 7)}${"•".repeat(10)}${token.slice(-4)}`;
}

/**
 * Card 3 (coluna direita): Webhooks & APIs denso — título + 1 linha de
 * descrição (endpoint + body de exemplo vivem no tooltip do (i)), form
 * inline e lista de tokens em linha única com ações em ícone.
 */
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
    <div className="card-elevated space-y-3 p-4">
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5 text-sm font-semibold">
          Webhooks & APIs
          <InfoTip text={`Endpoint: POST ${origin}/api/public/ingest/{token} · Body exemplo: ${EXAMPLE_BODY}`} />
        </div>
        <p className="text-[11px] text-muted-foreground">
          Aponte a Evolution (ou qualquer sistema) pra cá; cada mensagem vira demanda.
        </p>
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (tokName.trim()) createM.mutate();
        }}
      >
        <Input
          value={tokName}
          onChange={(e) => setTokName(e.target.value)}
          placeholder="Nome do token"
          className="h-9 min-w-0 flex-1 text-sm"
        />
        <button
          type="submit"
          className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:opacity-90"
        >
          <Plus className="h-3.5 w-3.5" /> Gerar Token
        </button>
      </form>

      <div className="overflow-hidden rounded-lg border border-border">
        {tokens?.length === 0 && (
          <div className="p-3 text-xs text-muted-foreground">Nenhum token gerado ainda.</div>
        )}
        {tokens?.map((t: any) => {
          const revealed = revealedTokens.has(t.id);
          return (
            <div
              key={t.id}
              className="row-zebra flex items-center gap-2 border-b border-border px-3 py-2 last:border-0"
            >
              <KeyRound className="h-3.5 w-3.5 shrink-0 text-[var(--pill-green-fg)]" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold">{t.name}</div>
                <code className="block truncate text-[10px] text-muted-foreground">
                  {revealed ? t.token : maskToken(t.token)}
                </code>
              </div>
              <button
                title={revealed ? "Ocultar token" : "Revelar token"}
                aria-label={revealed ? "Ocultar token" : "Revelar token"}
                onClick={() => toggleReveal(t.id)}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                {revealed ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
              <button
                title="Copiar"
                aria-label="Copiar token"
                onClick={() => {
                  navigator.clipboard.writeText(t.token);
                  toast.success("Copiado");
                }}
                className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <Copy className="h-3.5 w-3.5" />
              </button>
              {confirmDeleteTokenId === t.id ? (
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    onClick={() => deleteM.mutate(t.id)}
                    disabled={deleteM.isPending}
                    className="h-7 rounded-md bg-destructive px-2 text-[10px] font-semibold text-destructive-foreground disabled:opacity-60"
                  >
                    {deleteM.isPending ? "..." : "Confirmar"}
                  </button>
                  <button
                    onClick={() => setConfirmDeleteTokenId(null)}
                    className="h-7 rounded-md border border-border px-2 text-[10px] hover:bg-secondary"
                  >
                    Cancelar
                  </button>
                </span>
              ) : (
                <button
                  title="Remover"
                  aria-label="Remover token"
                  onClick={() => setConfirmDeleteTokenId(t.id)}
                  className="shrink-0 rounded-md p-1.5 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}