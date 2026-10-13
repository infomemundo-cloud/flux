import { useNavigate, useParams } from "@tanstack/react-router";
import { CheckCircle2, ArrowRight, Settings } from "lucide-react";

/**
 * Página de sucesso pós-checkout — Versão Horizontal Compacta (Flux Design System).
 * - Layout otimizado para preencher a área principal sem espaços verticais excessivos.
 * - Botões de ação dispostos na horizontal.
 */
export function SuccessStateView() {
  const navigate = useNavigate();
  const { slug } = useParams({ strict: false }) as { slug: string };

  const goConfig = () =>
    navigate({ to: "/app/o/$slug/configuracoes", params: { slug } });

  const goFila = () =>
    navigate({ to: "/app/o/$slug/fila", params: { slug } });

  return (
    <div className="h-full min-h-[80vh] flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl border border-slate-800 bg-slate-900/90 backdrop-blur-xl p-8 shadow-2xl space-y-6">
        
        {/* Cabeçalho com ícone e título alinhados */}
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <div className="space-y-1">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
              Transação Concluída
            </div>
            <h1 className="text-xl font-bold tracking-tight text-slate-100">
              Pagamento Confirmado!
            </h1>
          </div>
        </div>

        {/* Descrição e próximos passos integrados */}
        <p className="text-sm text-slate-400 leading-relaxed">
          Seu pagamento foi processado com sucesso pelo Mercado Pago e o plano da sua organização foi atualizado. Você já pode prosseguir para o atendimento ou gerenciar os detalhes da assinatura quando quiser.
        </p>

        {/* Ações na Horizontal */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
          <button
            onClick={goFila}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-950/50 hover:bg-emerald-500 active:scale-[0.98] transition-all"
          >
            Ir para a Fila
            <ArrowRight className="w-4 h-4" />
          </button>
          
          <button
            onClick={goConfig}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-4 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-all"
          >
            <Settings className="w-4 h-4 text-slate-400" />
            Gerenciar Assinatura
          </button>
        </div>

        <div className="border-t border-slate-800/60 pt-4 flex items-center justify-between text-xs text-slate-500">
          <span>Ambiente Seguro • Flux Enterprise</span>
          <span>Configurações → Financeiro</span>
        </div>
      </div>
    </div>
  );
}
