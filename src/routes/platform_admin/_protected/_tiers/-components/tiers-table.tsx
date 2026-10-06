import { Button } from "@/components/ui/button";
import type { TierRow } from "@/lib/platform-admin/tiers.functions";

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Tabela densa do catálogo (diretriz §6): uma linha por tier, cotas em chips,
 * ação inline. Wrapper com teto de largura — sem card gigante vazio.
 */
export function TiersTable({
  tiers,
  onEdit,
}: {
  tiers: TierRow[];
  onEdit: (tier: TierRow) => void;
}) {
  return (
    <div className="max-w-5xl overflow-hidden rounded-md border border-border/50">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-border/50 bg-muted/40 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            <th className="px-3 py-2 font-medium">Code</th>
            <th className="px-3 py-2 font-medium">Nome</th>
            <th className="px-3 py-2 font-medium">Pos.</th>
            <th className="px-3 py-2 font-medium">Preço/mês</th>
            <th className="px-3 py-2 font-medium">Cotas (DT-09: não aplicadas)</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody>
          {tiers.map((t) => (
            <tr key={t.code} className="border-b border-border/50 last:border-0 hover:bg-muted/30">
              <td className="px-3 py-2 font-mono text-[11px]">{t.code}</td>
              <td className="px-3 py-2 font-medium">{t.name}</td>
              <td className="px-3 py-2 text-muted-foreground">{t.position}</td>
              <td className="px-3 py-2">{brl(t.price_cents)}</td>
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1 rounded-full border border-border/50 bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground">
                  {t.limits.operators} ops · {t.limits.messages_mes.toLocaleString("pt-BR")} msg/mês
                </span>
              </td>
              <td className="px-3 py-2 text-right">
                <Button variant="ghost" size="sm" onClick={() => onEdit(t)}>
                  Editar
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
