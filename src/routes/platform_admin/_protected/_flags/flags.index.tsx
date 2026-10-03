import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useEffect } from "react";
import {
  Flag as FlagIcon,
  Plus,
  X,
  Pencil,
  SlidersHorizontal,
  Trash2,
  FlaskConical,
  Search,
} from "lucide-react";
import { RowMenu } from "@/components/row-menu";
import { toast } from "sonner";
import {
  listFeatureFlags,
  createFeatureFlag,
  updateFeatureFlag,
  deleteFeatureFlag,
  upsertFlagOverride,
  deleteFlagOverride,
  searchOrganizations,
  evaluateFeatureFlags,
} from "@/lib/feature-flag.functions";
import { getPlatformAdminSession } from "@/lib/platform-admin.functions";
import { friendlyError } from "@/lib/friendly-error";

export const Route = createFileRoute("/platform_admin/_protected/_flags/flags/")({
  component: PlatformAdminFlags,
});

type FlagsCache = { flags: any[]; overrides: any[] };
type Modal =
  | { type: "edit"; flag: any | null }
  | { type: "overrides"; flag: any }
  | { type: "sim" }
  | null;

const RULE_LABEL: Record<string, string> = {
  kill_switch: "kill-switch",
  override: "override",
  tag: "grupo/tag",
  rollout: "rollout %",
  default: "padrão",
};

/**
 * Gestão de feature flags (Fase 1.9): tabela densa + modais compactos.
 * - Kill-switch e edits atualizam o cache localmente (zero refetch, §2).
 * - Simulador de tenant: prova a precedência sem wire de gate no produto.
 * - Gestão = superadmin (ROLE_ACTIONS.flagManagement); demais papéis leem.
 */
function PlatformAdminFlags() {
  const qc = useQueryClient();
  const listFn = useServerFn(listFeatureFlags);
  const createFn = useServerFn(createFeatureFlag);
  const updateFn = useServerFn(updateFeatureFlag);
  const deleteFn = useServerFn(deleteFeatureFlag);
  const upsertOverrideFn = useServerFn(upsertFlagOverride);
  const deleteOverrideFn = useServerFn(deleteFlagOverride);
  const sessionFn = useServerFn(getPlatformAdminSession);

  const [modal, setModal] = useState<Modal>(null);

  const { data: session } = useQuery({
    queryKey: ["platform-admin-session"],
    queryFn: () => sessionFn(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  const canManage = session?.role === "superadmin";

  const { data, isLoading } = useQuery({
    queryKey: ["feature-flags"],
    queryFn: () => listFn(),
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  const patchCache = (fn: (old: FlagsCache) => FlagsCache) =>
    qc.setQueriesData<FlagsCache>({ queryKey: ["feature-flags"] }, (old: any) =>
      old ? fn(old) : old,
    );

  const saveFlag = useMutation({
    mutationFn: (v: { id?: string; payload: any }) =>
      v.id ? updateFn({ data: { id: v.id, ...v.payload } }) : createFn({ data: v.payload }),
    onSuccess: (row: any, vars) => {
      patchCache((old) =>
        vars.id
          ? { ...old, flags: old.flags.map((f) => (f.id === vars.id ? { ...f, ...row } : f)) }
          : { ...old, flags: [...old.flags, row].sort((a, b) => a.key.localeCompare(b.key)) },
      );
      setModal(null);
      toast.success(vars.id ? "Flag atualizada." : "Flag criada.");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const toggleActive = useMutation({
    mutationFn: (v: { id: string; active: boolean }) =>
      updateFn({ data: { id: v.id, active: v.active } }),
    onSuccess: (_r, vars) => {
      patchCache((old) => ({
        ...old,
        flags: old.flags.map((f) => (f.id === vars.id ? { ...f, active: vars.active } : f)),
      }));
      toast.success(vars.active ? "Kill-switch desligado (flag viva)." : "Kill-switch ATIVO.");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const removeFlag = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: (_r, id) => {
      patchCache((old) => ({
        flags: old.flags.filter((f) => f.id !== id),
        overrides: old.overrides.filter((o) => o.flag_id !== id),
      }));
      toast.success("Flag excluída.");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const saveOverride = useMutation({
    mutationFn: (v: { flagId: string; orgId: string; enabled: boolean; orgName: string }) =>
      upsertOverrideFn({ data: { flagId: v.flagId, orgId: v.orgId, enabled: v.enabled } }),
    onSuccess: (row: any, vars) => {
      patchCache((old) => {
        const others = old.overrides.filter(
          (o) => !(o.flag_id === vars.flagId && o.org_id === vars.orgId),
        );
        return {
          ...old,
          overrides: [
            { ...row, organizations: { id: vars.orgId, name: vars.orgName } },
            ...others,
          ],
        };
      });
      toast.success("Override salvo.");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const removeOverride = useMutation({
    mutationFn: (id: string) => deleteOverrideFn({ data: { id } }),
    onSuccess: (_r, id) => {
      patchCache((old) => ({ ...old, overrides: old.overrides.filter((o) => o.id !== id) }));
      toast.success("Override removido.");
    },
    onError: (e) => toast.error(friendlyError(e)),
  });

  const flags = data?.flags ?? [];
  const overrides = data?.overrides ?? [];

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold tracking-tight">Feature Flags</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Liberação por tenant, grupo (tags) e rollout % — precedência: override → tag →
            rollout → padrão
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setModal({ type: "sim" })}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-800 px-3 text-[11px] font-semibold text-slate-200 transition hover:bg-slate-700"
          >
            <FlaskConical className="h-3.5 w-3.5" /> Simulador
          </button>
          {canManage && (
            <button
              onClick={() => setModal({ type: "edit", flag: null })}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-slate-100 px-3 text-[11px] font-bold text-slate-950 transition hover:bg-white"
            >
              <Plus className="h-3.5 w-3.5" /> Nova Flag
            </button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/40">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-800 text-[10px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 font-semibold">Key</th>
                <th className="px-3 py-2 font-semibold">Descrição</th>
                <th className="px-3 py-2 font-semibold">Default</th>
                <th className="px-3 py-2 font-semibold">Rollout</th>
                <th className="px-3 py-2 font-semibold">Tags</th>
                <th className="px-3 py-2 font-semibold">Overrides</th>
                <th className="px-3 py-2 font-semibold">Kill-switch</th>
                <th className="px-3 py-2 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {flags.map((f: any) => {
                const fOverrides = overrides.filter((o) => o.flag_id === f.id);
                return (
                  <tr
                    key={f.id}
                    className="border-b border-slate-800/60 last:border-0 transition hover:bg-slate-800/30"
                  >
                    <td className="px-3 py-2">
                      <div className="font-mono text-[11px] font-semibold text-slate-100">
                        {f.key}
                      </div>
                    </td>
                    <td className="max-w-[220px] truncate px-3 py-2 text-[11px] text-slate-400">
                      {f.description || "—"}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          f.default_state
                            ? "rounded bg-emerald-950/50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300"
                            : "rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400"
                        }
                      >
                        {f.default_state ? "on" : "off"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-[11px] tabular-nums text-slate-300">
                      {f.rollout_percent > 0 ? `${f.rollout_percent}%` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        {f.enabled_for_tags.length === 0 && (
                          <span className="text-[11px] text-slate-600">—</span>
                        )}
                        {f.enabled_for_tags.slice(0, 2).map((t: string) => (
                          <span
                            key={t}
                            className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-300"
                          >
                            {t}
                          </span>
                        ))}
                        {f.enabled_for_tags.length > 2 && (
                          <span className="text-[10px] text-slate-500">
                            +{f.enabled_for_tags.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-300">
                        {fOverrides.length}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      {canManage ? (
                        <button
                          onClick={() => toggleActive.mutate({ id: f.id, active: !f.active })}
                          disabled={toggleActive.isPending}
                          className={
                            f.active
                              ? "inline-flex h-6 items-center rounded-full bg-emerald-950/60 px-2 text-[10px] font-bold text-emerald-300 ring-1 ring-emerald-900/60 transition hover:bg-emerald-900/60"
                              : "inline-flex h-6 items-center rounded-full bg-red-950/60 px-2 text-[10px] font-bold text-red-300 ring-1 ring-red-900/60 transition hover:bg-red-900/60"
                          }
                        >
                          {f.active ? "ativo" : "morto"}
                        </button>
                      ) : (
                        <span className="text-[10px] text-slate-500">
                          {f.active ? "ativo" : "morto"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <RowMenu
                        items={[
                          {
                            label: "Editar",
                            icon: <Pencil className="h-3.5 w-3.5" />,
                            disabled: !canManage,
                            onClick: () => setModal({ type: "edit", flag: f }),
                          },
                          {
                            label: "Overrides",
                            icon: <SlidersHorizontal className="h-3.5 w-3.5" />,
                            onClick: () => setModal({ type: "overrides", flag: f }),
                          },
                          {
                            label: "Excluir",
                            icon: <Trash2 className="h-3.5 w-3.5" />,
                            danger: true,
                            disabled: !canManage,
                            onClick: () => removeFlag.mutate(f.id),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                );
              })}
              {!isLoading && flags.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-14 text-center">
                    <FlagIcon className="mx-auto h-4 w-4 text-slate-500" />
                    <div className="mt-2 text-xs font-semibold text-slate-300">
                      Nenhuma feature flag
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-500">
                      Crie flags ouro (críticas/comercializáveis) — o restante do produto
                      passa a consultá-las nas fases donas de cada feature.
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal?.type === "edit" && (
        <FlagModal
          flag={modal.flag}
          onClose={() => setModal(null)}
          onSave={(payload) => saveFlag.mutate({ id: modal.flag?.id, payload })}
          pending={saveFlag.isPending}
        />
      )}
      {modal?.type === "overrides" && (
        <OverridesModal
          flag={modal.flag}
          overrides={overrides.filter((o) => o.flag_id === modal.flag.id)}
          canManage={canManage}
          onClose={() => setModal(null)}
          onSave={(v) => saveOverride.mutate({ ...v, flagId: modal.flag.id })}
          onRemove={(id) => removeOverride.mutate(id)}
          pending={saveOverride.isPending}
        />
      )}
      {modal?.type === "sim" && <SimulatorModal onClose={() => setModal(null)} />}
    </div>
  );
}

/** Modal criar/editar flag — compacto, sem w-full desnecessário. */
function FlagModal({
  flag,
  onClose,
  onSave,
  pending,
}: {
  flag: any | null;
  onClose: () => void;
  onSave: (payload: any) => void;
  pending: boolean;
}) {
  const [key, setKey] = useState(flag?.key ?? "");
  const [description, setDescription] = useState(flag?.description ?? "");
  const [defaultState, setDefaultState] = useState(flag?.default_state ?? false);
  const [rollout, setRollout] = useState(flag?.rollout_percent ?? 0);
  const [tags, setTags] = useState<string>((flag?.enabled_for_tags ?? []).join(", "));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 p-6 shadow-xl ring-1 ring-slate-800">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-100">
            {flag ? "Editar Flag" : "Nova Flag"}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave({
              key,
              description,
              default_state: defaultState,
              rollout_percent: rollout,
              enabled_for_tags: tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean),
            });
          }}
          className="space-y-3"
        >
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-400">Key</label>
            <input
              required
              disabled={!!flag}
              value={key}
              onChange={(e) => setKey(e.target.value.toLowerCase())}
              placeholder="demandas_ia"
              className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 font-mono text-[11px] text-slate-100 outline-none transition focus:border-slate-500 disabled:opacity-50"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-400">
              Descrição
            </label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="O que esta flag controla"
              className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-[11px] text-slate-100 outline-none transition focus:border-slate-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-slate-400">
                Rollout % (0-100)
              </label>
              <input
                type="number"
                min={0}
                max={100}
                value={rollout}
                onChange={(e) => setRollout(Number(e.target.value))}
                className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-[11px] tabular-nums text-slate-100 outline-none transition focus:border-slate-500"
              />
            </div>
            <div className="flex items-end pb-1">
              <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-300">
                <input
                  type="checkbox"
                  checked={defaultState}
                  onChange={(e) => setDefaultState(e.target.checked)}
                  className="h-3.5 w-3.5 accent-slate-100"
                />
                Default on
              </label>
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-slate-400">
              Tags de grupo (separadas por vírgula)
            </label>
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="beta, enterprise"
              className="h-9 w-full rounded-lg border border-slate-700 bg-slate-950 px-3 text-[11px] text-slate-100 outline-none transition focus:border-slate-500"
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="h-9 flex-1 rounded-lg bg-slate-800 text-xs font-semibold text-slate-200 transition hover:bg-slate-700"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={pending || !key}
              className="h-9 flex-1 rounded-lg bg-slate-100 text-xs font-bold text-slate-950 transition hover:bg-white disabled:opacity-50"
            >
              {pending ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/** Picker de org com busca debounced (compartilhado por overrides/simulador). */
function OrgPicker({ onPick }: { onPick: (org: any) => void }) {
  const searchFn = useServerFn(searchOrganizations);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 400);
    return () => clearTimeout(t);
  }, [search]);
  const { data: orgs } = useQuery({
    queryKey: ["org-search", debounced],
    queryFn: () => searchFn({ data: { search: debounced || undefined } }),
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  return (
    <div className="space-y-1.5">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar org..."
          className="h-8 w-full rounded-lg border border-slate-700 bg-slate-950 pl-8 pr-2 text-[11px] text-slate-100 outline-none transition focus:border-slate-500"
        />
      </div>
      <div className="max-h-32 overflow-y-auto rounded-lg border border-slate-800">
        {(orgs ?? []).map((o: any) => (
          <button
            key={o.id}
            type="button"
            onClick={() => onPick(o)}
            className="flex w-full items-center justify-between px-2.5 py-1.5 text-left text-[11px] text-slate-300 transition hover:bg-slate-800"
          >
            <span className="truncate">{o.name}</span>
            <span className="ml-2 shrink-0 text-[9px] text-slate-500">
              {(Array.isArray(o.tags) ? o.tags : []).join(", ") || "sem tags"}
            </span>
          </button>
        ))}
        {(orgs ?? []).length === 0 && (
          <div className="px-2.5 py-2 text-[10px] text-slate-500">Nenhuma org encontrada.</div>
        )}
      </div>
    </div>
  );
}

/** Modal de overrides por org. */
function OverridesModal({
  flag,
  overrides,
  canManage,
  onClose,
  onSave,
  onRemove,
  pending,
}: {
  flag: any;
  overrides: any[];
  canManage: boolean;
  onClose: () => void;
  onSave: (v: { orgId: string; enabled: boolean; orgName: string }) => void;
  onRemove: (id: string) => void;
  pending: boolean;
}) {
  const [enabled, setEnabled] = useState(true);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 p-6 shadow-xl ring-1 ring-slate-800">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-100">
            Overrides — <span className="font-mono text-[11px]">{flag.key}</span>
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="space-y-2">
          {overrides.map((o) => (
            <div
              key={o.id}
              className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5"
            >
              <div className="min-w-0 text-[11px] font-semibold text-slate-200 truncate">
                {o.organizations?.name ?? "Org removida"}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <span
                  className={
                    o.enabled
                      ? "rounded bg-emerald-950/50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-300"
                      : "rounded bg-red-950/50 px-1.5 py-0.5 text-[10px] font-semibold text-red-300"
                  }
                >
                  {o.enabled ? "on" : "off"}
                </span>
                {canManage && (
                  <button
                    onClick={() => onRemove(o.id)}
                    className="text-slate-500 transition hover:text-red-300"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
          {overrides.length === 0 && (
            <div className="rounded-lg border border-slate-800 px-2.5 py-3 text-center text-[10px] text-slate-500">
              Nenhum override — vale a precedência tag → rollout → default.
            </div>
          )}
        </div>
        {canManage && (
          <div className="mt-4 space-y-2 border-t border-slate-800 pt-3">
            <OrgPicker onPick={(org) => onSave({ orgId: org.id, enabled, orgName: org.name })} />
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-300">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => setEnabled(e.target.checked)}
                  className="h-3.5 w-3.5 accent-slate-100"
                />
                Override = on
              </label>
              <span className="text-[10px] text-slate-500">
                clique numa org acima pra salvar
              </span>
            </div>
            {pending && <div className="text-[10px] text-slate-500">Salvando...</div>}
          </div>
        )}
      </div>
    </div>
  );
}

/** Simulador de tenant: prova a precedência sem wire de gate no produto. */
function SimulatorModal({ onClose }: { onClose: () => void }) {
  const evalFn = useServerFn(evaluateFeatureFlags);
  const [org, setOrg] = useState<any | null>(null);
  const { data: evalResult, isLoading } = useQuery({
    queryKey: ["flag-sim", org?.id],
    queryFn: () => evalFn({ data: { orgId: org.id } }),
    enabled: !!org,
    staleTime: 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 p-6 shadow-xl ring-1 ring-slate-800">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-sm font-bold text-slate-100">
            <FlaskConical className="h-4 w-4" /> Simulador de Tenant
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>
        <OrgPicker onPick={setOrg} />
        {org && (
          <div className="mt-3 space-y-1.5 border-t border-slate-800 pt-3">
            <div className="text-[10px] uppercase tracking-wide text-slate-500">
              {evalResult?.orgName ?? org.name} — regra vencedora por flag
            </div>
            {isLoading && <div className="text-[11px] text-slate-500">Avaliando...</div>}
            {evalResult?.flags.map((f: any) => (
              <div
                key={f.id}
                className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 px-2.5 py-1.5"
              >
                <span className="font-mono text-[11px] text-slate-200">{f.key}</span>
                <div className="flex items-center gap-1.5">
                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400">
                    {RULE_LABEL[f.rule]}
                  </span>
                  <span
                    className={
                      f.enabled
                        ? "rounded bg-emerald-950/50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-300"
                        : "rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-slate-500"
                    }
                  >
                    {f.enabled ? "ON" : "OFF"}
                  </span>
                </div>
              </div>
            ))}
            {evalResult && evalResult.flags.length === 0 && (
              <div className="text-[11px] text-slate-500">Nenhuma flag cadastrada.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
