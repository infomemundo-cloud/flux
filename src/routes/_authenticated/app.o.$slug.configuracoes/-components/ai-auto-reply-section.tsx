import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Bot } from "lucide-react";
import { toast } from "sonner";
import { getWhatsappConnection, setWhatsappAutoReply } from "@/lib/whatsapp.functions";
import { friendlyError } from "@/lib/friendly-error";

/**
 * Resposta automática por IA (toggle real): regra de ATENDIMENTO, não de
 * canal. Compartilha a query ["whatsapp-connection", orgId] com a
 * WhatsappSection — cache único.
 */
export function AiAutoReplySection({ orgId }: { orgId: string }) {
  const getFn = useServerFn(getWhatsappConnection);
  const autoFn = useServerFn(setWhatsappAutoReply);
  const qc = useQueryClient();
  const { data: conn } = useQuery({
    queryKey: ["whatsapp-connection", orgId],
    queryFn: () => getFn({ data: { orgId } }),
    retry: false,
  });
  const auto = useMutation({
    mutationFn: (enabled: boolean) => autoFn({ data: { orgId, enabled } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["whatsapp-connection", orgId] }),
    onError: (e) => toast.error(friendlyError(e)),
  });
  return (
    <div className="card-elevated p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Bot className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-semibold">Resposta automática por IA</h3>
          <p className="text-sm text-muted-foreground">
            Quando ligado, o atendimento pode responder automaticamente via WhatsApp.
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={!!conn?.auto_reply_enabled}
          aria-label="Resposta automática por IA"
          onClick={() => auto.mutate(!conn?.auto_reply_enabled)}
          className={`relative h-6 w-11 shrink-0 rounded-full transition ${conn?.auto_reply_enabled ? "bg-primary" : "bg-secondary"}`}
        >
          <span
            className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-all ${
              conn?.auto_reply_enabled ? "left-[22px]" : "left-0.5"
            }`}
          />
        </button>
      </div>
    </div>
  );
}