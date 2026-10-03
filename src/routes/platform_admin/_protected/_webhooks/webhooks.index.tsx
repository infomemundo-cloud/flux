import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Webhook as WebhookIcon,
  X,
  Loader2,
  RefreshCw,
  Copy,
  SlidersHorizontal,
  Download,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import {
  listWebhookLogs,
  listWebhookFilterOptions,
  getWebhookLogDetail,
  getWebhookStats,
} from "@/lib/webhook-delivery.functions";
import { friendlyError } from "@/lib/friendly-error";
import { pageUi, type WebhookPageUi } from "@/lib/webhook-page-ui";

export const Route = createFileRoute("/platform_admin/_protected/_webhooks/webhooks/")({
  component: PlatformAdminWebhooks,
});

const PAGE = 20;

const ACTION_LABEL: Record<string, string> = {
  auth_failed: "Token inválido",
  invalid_payload: "JSON inválido",
  validation_failed: "Validação falhou",
  contacts_update_invalid: "contacts.update inválido",
  demand_dedup: "Mensagem duplicada",
  demand_created: "Demanda criada",
  demand_reopened: "Demanda reaberta",
  internal_error: "Erro interno",
};

const OUTCOME_STYLE: Record<string, string> = {
  success: "bg-emerald-950/40 text-emerald-300 ring-emerald-900/50",
  rejected: "bg-amber-950/40 text-amber-300 ring-amber-900/50",
  error: "bg-red-950/40 text-red-300 ring-red-900/50",
};

/**
 * Logs de webhook (Fase 2, diretriz v2.2): ZERO TanStack Query nesta tela.
 * - Todo request nasce DENTRO de um handler de clique (fetch imperativo).
 * - Linhas/filtros/opções/stats/detalhes vivem no store module-scope
 *   (pageUi): trocar de aba e voltar renderiza do store, sem rede.
 * - Cascata rígida: org → token → outcome (cada um destrava o próximo).
 * - Logs: 20 por request; "Carregar mais 20..." append explícito.
 */
function PlatformAdminWebhooks() {
  const listFn = useServerFn(listWebhookLogs);
  const statsFn = useServerFn(getWebhookStats);
  const optionsFn = useServerFn(listWebhookFilterOptions);
  const detailFn = useServerFn(getWebhookLogDetail);

  const [ui, setUi] = useState<WebhookPageUi>(pageUi);
  const [busy, setBusy] = useState({
    options: false,
    logs: false,
    more: false,
    stats: false,
    detail: false,
  });
  const [detailId, setDetailId] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** Escreve no store (sempre) e no state (só montado). */
  const commit = (patch: Partial<WebhookPageUi>) => {
    Object.assign(pageUi, patch);
    if (mounted.current) setUi({ ...pageUi });
  };
  const setBusySafe = (patch: Partial<typeof busy>) => {
    if (mounted.current) setBusy((b) => ({ ...b, ...patch }));
  };

  const loadOptions = async () => {
    setBusySafe({ options: true });
    try {
      const res = await optionsFn();
      commit({ options: res, filtersLoaded: true, optionsError: null });
    } catch (e) {
      commit({ optionsError: friendlyError(e) });
    } finally {
      setBusySafe({ options: false });
    }
  };

  const loadStats = async () => {
    setBusySafe({ stats: true });
    try {
      const res = await statsFn();
      commit({ stats: res, statsError: null });
    } catch (e) {
      commit({ statsError: friendlyError(e) });
    } finally {
      setBusySafe({ stats: false });
    }
  };

  const loadLogs = async (append: boolean) => {
    setBusySafe(append ? { more: true } : { logs: true });
    try {
      const res = await listFn({
        data: {
          orgId: ui.orgId || undefined,
          tokenId: ui.tokenId || undefined,
          outcome: (ui.outcome || undefined) as any,
          offset: append ? ui.rows.length : 0,
          limit: PAGE,
        },
      });
      commit({
        rows: append ? [...ui.rows, ...res.rows] : res.rows,
        total: res.total,
        applied: append ? ui.applied : { orgId: ui.orgId, tokenId: ui.tokenId, outcome: ui.outcome },
        loadedOnce: true,
        logsError: null,
      });
    } catch (e) {
      commit({ logsError: friendlyError(e) });
    } finally {
      setBusySafe({ logs: false, more: false });
    }
  };

  const openDetail = async (id: string) => {
    setDetailId(id);
    if (pageUi.detailById[id]) return; // cache do store: zero request
    setBusySafe({ detail: true });
    try {
      const res = await detailFn({ data: { id: Number(id) } });
      commit({ detailById: { ...pageUi.detailById, [id]: res }, detailError: null });
    } catch (e) {
      commit({ detailError: friendlyError(e) });
    } finally {
      setBusySafe({ detail: false });
    }
  };

  const tokenOptions = useMemo(() => {
    if (!ui.options?.tokens) return [];
    return ui.orgId ? ui.options.tokens.filter((t: any) => t.org_id === ui.orgId) : [];
  }, [ui.options, ui.orgId]);

  const filtersDirty =
    ui.orgId !== ui.applied.orgId ||
    ui.tokenId !== ui.applied.tokenId ||
    ui.outcome !== ui.applied.outcome;

  const detail = detailId ? ui.detailById[detailId] ?? null : null;

  return (
    <div className="p-5 space-y-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight">Logs de Webhook</h1>
        <p className="text-xs text-slate-400 mt-0.5">
          Entregas cross-tenant — filtro de valor: só erros, falhas e sucessos de negócio.
          Retenção: 90 dias. Nada carrega sem o seu clique.
        </p>
      </div>

      {/* Stats: placeholders até o usuário pedir */}
      <div className="space-y-2">
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: "Total", tone: "text-slate-100", border: "border-slate-800", value: ui.stats?.total },
            { label: "Sucesso", tone: "text-emerald-200", border: "border-emerald-900/50", value: ui.stats?.byOutcome.success },
            { label: "Rejeitado", tone: "text-amber-200", border: "border-amber-900/50", value: ui.stats?.byOutcome.rejected },
            { label: "Erro", tone: "text-red-200", border: "border-red-900/50", value: ui.stats?.byOutcome.error },
          ].map((c) => (
            <div key={c.label} className={`rounded-lg border ${c.border} bg-slate-900/40 p-3`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wide text-slate-500">{c.label}</span>
                {c.label === "Total" && (
                  <button
                    onClick={loadStats}
                    disabled={busy.stats}
                    title={ui.stats ? "Atualizar stats" : "Carregar stats"}
                    className="inline-flex h-6 w-6 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-700/60 hover:text-slate-100 disabled:opacity-50"
                  >
                    {busy.stats ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  </button>
                )}
              </div>
              <div className={`mt-1 text-lg font-bold tabular-nums ${c.tone}`}>
                {!ui.stats ? "—" : (c.value ?? 0).toLocaleString("pt-BR")}
              </div>
            </div>
          ))}
        </div>
        {ui.statsError && (
          <div className="flex items-center gap-2 text-[11px] text-red-300">
            {ui.statsError}
            <button
              onClick={loadStats}
              className="inline-flex h-6 items-center gap-1 rounded bg-slate-800 px-2 text-[10px] font-semibold text-slate-200 transition hover:bg-slate-700"
            >
              <RefreshCw className="h-3 w-3" /> Tentar de novo
            </button>
          </div>
        )}
      </div>

      {/* Filtros em cascata rígida: org → token → outcome */}
      <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-3">
        {!ui.filtersLoaded ? (
          <button
            onClick={loadOptions}
            disabled={busy.options}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-[11px] font-semibold text-slate-200 transition hover:bg-slate-700 disabled:opacity-50"
          >
            {busy.options ? <Loader2 className="h-3 w-3 animate-spin" /> : <SlidersHorizontal className="h-3.5 w-3.5" />}
            Carregar filtros
          </button>
        ) : ui.optionsError ? (
          <div className="flex items-center gap-2 text-[11px] text-red-300">
            {ui.optionsError}
            <button
              onClick={loadOptions}
              className="inline-flex h-6 items-center gap-1 rounded bg-slate-800 px-2 text-[10px] font-semibold text-slate-200 transition hover:bg-slate-700"
            >
              <RefreshCw className="h-3 w-3" /> Tentar de novo
            </button>
          </div>
        ) : (
          <div className="flex flex-wrap items-end gap-2">
            <div className="min-w-[180px]">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                1. Org
              </label>
              <select
                value={ui.orgId}
                onChange={(e) => commit({ orgId: e.target.value, tokenId: "", outcome: "" })}
                className="h-8 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 text-[11px] text-slate-100 outline-none focus:border-slate-500"
              >
                <option value="">— escolher —</option>
                {(ui.options?.orgs ?? []).map((o: any) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[180px]">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                2. Token {!ui.orgId && "(escolha a org)"}
              </label>
              <select
                value={ui.tokenId}
                onChange={(e) => commit({ tokenId: e.target.value, outcome: "" })}
                disabled={!ui.orgId}
                className="h-8 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 text-[11px] text-slate-100 outline-none focus:border-slate-500 disabled:opacity-50"
              >
                <option value="">— escolher —</option>
                {tokenOptions.map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-[140px]">
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                3. Outcome {!ui.tokenId && "(escolha o token)"}
              </label>
              <select
                value={ui.outcome}
                onChange={(e) => commit({ outcome: e.target.value })}
                disabled={!ui.tokenId}
                className="h-8 w-full rounded-lg border border-slate-700 bg-slate-950 px-2 text-[11px] text-slate-100 outline-none focus:border-slate-500 disabled:opacity-50"
              >
                <option value="">— escolher —</option>
                <option value="success">success</option>
                <option value="rejected">rejected</option>
                <option value="error">error</option>
              </select>
            </div>
            <button
              onClick={() => commit({ orgId: "", tokenId: "", outcome: "" })}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-[11px] font-semibold text-slate-200 transition hover:bg-slate-700"
            >
              <X className="h-3 w-3" /> Limpar
            </button>
            {filtersDirty && ui.loadedOnce && (
              <span className="pb-1.5 text-[10px] font-semibold text-amber-300">
                filtros alterados — clique em Carregar logs pra aplicar
              </span>
            )}
          </div>
        )}
      </div>

      {/* Toolbar de logs */}
      <div className="flex items-center justify-between">
        <div className="text-[10px] text-slate-500 tabular-nums">
          {ui.loadedOnce
            ? `${ui.rows.length} de ${ui.total} registros carregados`
            : "nenhum request feito ainda"}
        </div>
        <div className="flex items-center gap-2">
          {ui.loadedOnce && ui.rows.length < ui.total && (
            <button
              onClick={() => loadLogs(true)}
              disabled={busy.more}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-900 px-3 text-[11px] font-semibold text-slate-200 transition hover:bg-slate-800 disabled:opacity-50"
            >
              {busy.more && <Loader2 className="h-3 w-3 animate-spin" />}
              Carregar mais {PAGE}...
            </button>
          )}
          <button
            onClick={() => loadLogs(false)}
            disabled={busy.logs}
            className="group inline-flex h-9 items-center gap-2 rounded-lg bg-slate-100 pl-3 pr-2 text-[11px] font-bold text-slate-950 shadow-sm ring-1 ring-slate-400/40 transition hover:bg-white hover:ring-slate-300 disabled:opacity-50"
          >
            {busy.logs ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5 transition group-hover:translate-y-px" />
            )}
            {ui.loadedOnce ? "Recarregar logs" : "Carregar logs"}
            <span className="rounded-md bg-slate-950/10 px-1.5 py-0.5 text-[10px] font-bold tabular-nums">
              {PAGE}
            </span>
            <ChevronDown className="h-3 w-3 text-slate-500" />
          </button>
        </div>
      </div>

      {/* Tabela */}
      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-semibold">Data</th>
                <th className="px-3 py-2 font-semibold">Org</th>
                <th className="px-3 py-2 font-semibold">Token</th>
                <th className="px-3 py-2 font-semibold">Ação</th>
                <th className="px-3 py-2 font-semibold">Outcome</th>
                <th className="px-3 py-2 font-semibold">Status</th>
                <th className="px-3 py-2 font-semibold">Latência</th>
                <th className="px-3 py-2 font-semibold">Protocolo</th>
              </tr>
            </thead>
            <tbody>
              {ui.rows.map((r: any) => (
                <tr
                  key={r.id}
                  onClick={() => openDetail(String(r.id))}
                  className="cursor-pointer border-b border-slate-800/60 last:border-0 transition hover:bg-slate-800/30"
                >
                  <td className="px-3 py-2 text-[11px] tabular-nums text-slate-300">
                    {new Date(r.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td className="max-w-[140px] truncate px-3 py-2 text-[11px] text-slate-200">
                    {r.organizations?.name ?? "—"}
                  </td>
                  <td className="max-w-[140px] truncate px-3 py-2 font-mono text-[11px] text-slate-400">
                    {r.webhook_tokens?.name ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-slate-200">
                    {ACTION_LABEL[r.action] ?? r.action}
                  </td>
                  <td className="px-3 py-2">
                    <span
                      className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${OUTCOME_STYLE[r.outcome]}`}
                    >
                      {r.outcome}
                    </span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-[11px] text-slate-400">{r.status ?? "—"}</td>
                  <td className="px-3 py-2 tabular-nums text-[11px] text-slate-400">
                    {r.latency_ms != null ? `${r.latency_ms}ms` : "—"}
                  </td>
                  <td className="max-w-[110px] truncate px-3 py-2 font-mono text-[10px] text-slate-500">
                    {r.protocol ?? "—"}
                  </td>
                </tr>
              ))}
              {!ui.loadedOnce && (
                <tr>
                  <td colSpan={8} className="px-3 py-14 text-center">
                    <WebhookIcon className="mx-auto h-4 w-4 text-slate-500" />
                    <div className="mt-2 text-xs font-semibold text-slate-300">
                      Nenhuma entrega carregada
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      Configure os filtros em cascata (se quiser) e clique em "Carregar logs".
                    </div>
                  </td>
                </tr>
              )}
              {ui.loadedOnce && ui.rows.length === 0 && !ui.logsError && (
                <tr>
                  <td colSpan={8} className="px-3 py-14 text-center">
                    <WebhookIcon className="mx-auto h-4 w-4 text-slate-500" />
                    <div className="mt-2 text-xs font-semibold text-slate-300">
                      Nenhuma entrega com esses filtros
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {ui.logsError && (
          <div className="border-t border-slate-800 px-3 py-3 text-[11px] text-red-300">
            {ui.logsError} — clique em "Recarregar logs" pra tentar de novo.
          </div>
        )}
      </div>

      {/* Modal de detalhe (cache no store: 2º clique = zero request) */}
      {detailId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-slate-900 p-6 shadow-xl ring-1 ring-slate-800">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-100">Detalhe da Entrega</h2>
              <button onClick={() => setDetailId(null)} className="text-slate-400 hover:text-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            {ui.detailError && !detail ? (
              <div className="rounded-xl bg-slate-900/70 p-4 ring-1 ring-red-900/60">
                <div className="text-sm font-bold text-red-300">Falha ao carregar o detalhe</div>
                <p className="mt-1 break-all text-[11px] text-slate-400">{ui.detailError}</p>
              </div>
            ) : busy.detail && !detail ? (
              <div className="flex items-center gap-2 text-xs text-slate-500">
                <Loader2 className="h-3 w-3 animate-spin" /> Carregando...
              </div>
            ) : detail ? (
              <div className="space-y-3 overflow-y-auto pr-2">
                <div className="grid grid-cols-2 gap-3 text-[11px]">
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Ação</div>
                    <div className="mt-0.5 text-slate-100">{ACTION_LABEL[detail.action] ?? detail.action}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Outcome</div>
                    <div className="mt-0.5">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ring-1 ${OUTCOME_STYLE[detail.outcome]}`}>
                        {detail.outcome}
                      </span>
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Org</div>
                    <div className="mt-0.5 text-slate-100">{detail.organizations?.name ?? "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Token</div>
                    <div className="mt-0.5 font-mono text-[11px] text-slate-300">
                      {detail.webhook_tokens?.name ?? "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Latência</div>
                    <div className="mt-0.5 tabular-nums text-slate-100">
                      {detail.latency_ms != null ? `${detail.latency_ms}ms` : "—"}
                    </div>
                  </div>
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Status</div>
                    <div className="mt-0.5 tabular-nums text-slate-100">{detail.status ?? "—"}</div>
                  </div>
                </div>
                {detail.error && (
                  <div>
                    <div className="text-[10px] uppercase tracking-wide text-red-400">Erro</div>
                    <div className="mt-0.5 break-all rounded border border-red-900/60 bg-red-950/30 p-2 font-mono text-[10px] text-red-200">
                      {detail.error}
                    </div>
                  </div>
                )}
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <div className="text-[10px] uppercase tracking-wide text-slate-500">Payload (redacted)</div>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(JSON.stringify(detail.payload ?? {}, null, 2));
                        toast.success("Payload copiado.");
                      }}
                      className="inline-flex h-6 items-center gap-1 rounded bg-slate-800 px-1.5 text-[9px] font-semibold text-slate-300 transition hover:bg-slate-700"
                    >
                      <Copy className="h-3 w-3" /> Copiar
                    </button>
                  </div>
                  <pre className="max-h-72 overflow-auto rounded-lg border border-slate-700 bg-slate-950 p-3 font-mono text-[10px] leading-relaxed text-slate-300">
                    {JSON.stringify(detail.payload ?? {}, null, 2)}
                  </pre>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
