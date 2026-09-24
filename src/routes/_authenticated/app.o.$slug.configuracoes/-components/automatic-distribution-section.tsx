import { useState } from "react";
import { Shuffle } from "lucide-react";
import { toast } from "sonner";

/** Seção estática de Distribuição Automática de Demandas (placeholder real). */
export function AutomaticDistributionSection() {
  const [isEnabled, setIsEnabled] = useState(false);
  const [distributionMode, setDistributionMode] = useState<"round-robin" | "lowest-load">(
    "round-robin",
  );
  const handleSave = () => {
    console.log("Salvando configurações de distribuição:", { isEnabled, distributionMode });
    toast.success("Configurações de distribuição salvas com sucesso!");
  };
  return (
    <div className="card-elevated space-y-4 p-4 sm:p-6">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
          <Shuffle className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <div>
          <h3 className="text-base font-semibold">Distribuição Automática de Demandas</h3>
          <p className="text-sm text-muted-foreground">
            Atribua novas demandas recebidas via WhatsApp automaticamente entre os membros da equipe.
          </p>
        </div>
      </div>
      <div className="space-y-4 pt-2">
        <label className="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border p-4 transition-colors hover:bg-secondary/30">
          <div className="min-w-0">
            <span className="block text-sm font-semibold">Ativar distribuição automática</span>
            <span className="block text-xs text-muted-foreground">
              Quando ligado, as novas demandas serão distribuídas conforme a regra selecionada abaixo.
            </span>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={isEnabled}
            aria-label="Ativar distribuição automática"
            onClick={() => setIsEnabled(!isEnabled)}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${isEnabled ? "bg-primary" : "bg-secondary"}`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-card shadow transition-all ${
                isEnabled ? "left-[22px]" : "left-0.5"
              }`}
            />
          </button>
        </label>
        <div
          className={`space-y-3 transition-all duration-300 ${isEnabled ? "opacity-100" : "pointer-events-none opacity-50"}`}
        >
          <span className="block text-sm font-medium text-muted-foreground">Modo de Distribuição</span>
          <div className="grid gap-3 sm:grid-cols-2">
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-all ${
                distributionMode === "round-robin"
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-secondary/30"
              }`}
            >
              <input
                type="radio"
                name="distributionMode"
                value="round-robin"
                checked={distributionMode === "round-robin"}
                onChange={() => setDistributionMode("round-robin")}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <div className="min-w-0">
                <span className="block text-sm font-semibold">Round-Robin (Revezamento)</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Distribui as demandas em fila circular sequencial entre os operadores.
                </span>
              </div>
            </label>
            <label
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-all ${
                distributionMode === "lowest-load"
                  ? "border-primary bg-primary/5"
                  : "border-border bg-card hover:bg-secondary/30"
              }`}
            >
              <input
                type="radio"
                name="distributionMode"
                value="lowest-load"
                checked={distributionMode === "lowest-load"}
                onChange={() => setDistributionMode("lowest-load")}
                className="mt-1 h-4 w-4 accent-primary"
              />
              <div className="min-w-0">
                <span className="block text-sm font-semibold">Menor Carga de Trabalho</span>
                <span className="mt-1 block text-xs text-muted-foreground">
                  Atribui para o operador com menor número de demandas em aberto.
                </span>
              </div>
            </label>
          </div>
        </div>
        <div className="flex justify-end pt-2">
          <button
            type="button"
            onClick={handleSave}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Salvar Alterações
          </button>
        </div>
      </div>
    </div>
  );
}