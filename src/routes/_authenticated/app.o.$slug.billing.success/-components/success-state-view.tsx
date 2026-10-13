import { useNavigate, useParams } from "@tanstack/react-router";
import { CheckCircle2, ArrowRight, ShieldCheck } from "lucide-react";

/**
 * Página de sucesso pós-checkout — Versão Elegante & Refinada (Flux Design System).
 * 
 * - Mantém a segurança da versão mínima (sem polling complexo).
 * - Adota a identidade visual corporativa (fundo slate dark, card elevado, bordas sutis).
 * - Oferece uma transição fluida para o painel de configurações ou fila.
 */
export function SuccessStateView() {
  const navigate = useNavigate();
  const { slug } = useParams({ strict: false }) as { slug: string };

  const goConfig = () =>
    navigate({ to: "/app/o/$slug/configuracoes", params: { slug } });

  const goFila = () =>
    navigate({ to: "/app/o/$slug/fila", params: { slug } });

  return (
    <div className="min-h-dvh bg-slate-950 text-slate-50 flex items-center justify-center p-4 selection:bg-emerald-500/30 selection:text-emerald-200">
      {/* Background glow sutil para dar profundidade */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-emerald-500/10 blur-[120px] rounded-full" />
      </div>

      <div className="relative w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900/80 backdrop-xl p-8 text-center shadow-2xl space-y-6">
        
        {/* Ícone de Sucesso com Animação/Glow */}
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 shadow-inner">
          <CheckCircle2 className="h-8 w-8 animate-in zoom-in duration-300" />
        </div>

        <div className="space-y-2">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-1">
            <ShieldCheck className="w-3.5 h-3.5" />
            Transação Segura
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-100">
            Pagamento Confirmado!
          </h1>
          <p className="text-sm text-slate-400 leading-relaxed px-2">
            Seu pagamento foi processado com sucesso pelo Mercado Pago. Sua operação está sendo liberada.
          </p>
        </div>

        {/* Card Informativo secundário */}
        <div className="rounded-xl bg-slate-950/50 border border-slate-800/80 p-3.5 text-left space-y-1">
          <div className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Próximos passos
          </div>
          <p className="text-xs text-slate-400">
            O webhook do Mercado Pago já atualizou o seu plano. Você pode conferir os detalhes e notas fiscais em Configurações → Financeiro.
          </p>
        </div>

        {/* Ações */}
        <div className="space-y-2.5 pt-2">
          <button
            onClick={goFila}
            className="w-full inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white shadow-lg shadow-emerald-950/50 hover:bg-emerald-500 active:scale-[0.98] transition-all"
          >
            Ir para a Fila de Atendimento
            <ArrowRight className="w-4 h-4" />
          </button>
          
          <button
            onClick={goConfig}
            className="w-full inline-flex h-10 items-center justify-center rounded-xl border border-slate-800 bg-slate-900/50 px-4 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-slate-100 transition-all"
          >
            Gerenciar Assinatura (Financeiro)
          </button>
        </div>

        <p className="text-[11px] text-slate-500 pt-1">
          Flux Enterprise Billing • Ambiente Seguro
        </p>
      </div>
    </div>
  );
}
