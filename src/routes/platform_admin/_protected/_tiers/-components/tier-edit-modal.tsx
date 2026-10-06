import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TierRow } from "@/lib/platform-admin/tiers.functions";

/**
 * Modal compacto de edição (diretriz §6): campos NOMEADOS — zero JSON cru.
 * limits edita exatamente as chaves reais do catálogo (D18): operators e
 * messages_mes. Preço em reais no input, convertido pra cents no submit.
 */
export function TierEditModal({
  tier,
  saving,
  onClose,
  onSubmit,
}: {
  tier: TierRow;
  saving: boolean;
  onClose: () => void;
  onSubmit: (draft: TierRow) => void;
}) {
  const [name, setName] = useState(tier.name);
  const [position, setPosition] = useState(String(tier.position));
  const [price, setPrice] = useState((tier.price_cents / 100).toFixed(2));
  const [operators, setOperators] = useState(String(tier.limits.operators));
  const [messages, setMessages] = useState(String(tier.limits.messages_mes));

  const submit = () => {
    const priceNum = Number(price.replace(",", "."));
    const posNum = Number(position);
    const opsNum = Number(operators);
    const msgNum = Number(messages);
    if (!name.trim() || Number.isNaN(priceNum) || priceNum < 0) {
      toast.error("Confira nome e preço antes de salvar.");
      return;
    }
    if (!Number.isInteger(posNum) || posNum < 1 || !Number.isInteger(opsNum) || opsNum < 1 || !Number.isInteger(msgNum) || msgNum < 1) {
      toast.error("Posição e cotas devem ser inteiros ≥ 1.");
      return;
    }
    onSubmit({
      code: tier.code,
      name: name.trim(),
      position: posNum,
      price_cents: Math.round(priceNum * 100),
      limits: { operators: opsNum, messages_mes: msgNum },
    });
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="max-w-lg gap-4 p-5">
        <DialogHeader>
          <DialogTitle className="text-sm">
            Editar tier <span className="ml-1 font-mono text-xs text-muted-foreground">{tier.code}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1">
            <Label className="text-xs">Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Posição</Label>
            <Input type="number" min={1} max={99} value={position} onChange={(e) => setPosition(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Preço/mês (R$)</Label>
            <Input type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Operadores</Label>
            <Input type="number" min={1} value={operators} onChange={(e) => setOperators(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Mensagens/mês</Label>
            <Input type="number" min={1} value={messages} onChange={(e) => setMessages(e.target.value)} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" onClick={submit} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
