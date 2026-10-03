import { createHash } from "node:crypto";

/** Contrato de flag vinda do Postgres (feature_flags). */
export interface FlagDefinition {
  id: string;
  key: string;
  description: string;
  default_state: boolean;
  rollout_percent: number;
  enabled_for_tags: string[];
  active: boolean;
}

/** Override por tenant (feature_flag_overrides). */
export interface FlagOverride {
  id: string;
  flag_id: string;
  org_id: string;
  enabled: boolean;
}

/** Contexto de avaliação de um tenant. */
export interface FlagContext {
  orgId: string;
  orgTags: string[];
  overridesByFlagId: Record<string, boolean>;
}

/** Regra que venceu a precedência (exibida no simulador). */
export type FlagRule = "kill_switch" | "override" | "tag" | "rollout" | "default";

export interface FlagEvaluation {
  id: string;
  key: string;
  enabled: boolean;
  rule: FlagRule;
}

/**
 * Bucket determinístico 0-99: sha256(flag_key:org_id) → primeiros 4 bytes.
 * O mesmo par (flag, org) cai SEMPRE no mesmo bucket → rollout estável,
 * sem estado e sem storage (padrão de mercado pra rollout determinístico).
 */
export function rolloutBucket(flagKey: string, orgId: string): number {
  const digest = createHash("sha256").update(`${flagKey}:${orgId}`).digest();
  return digest.readUInt32BE(0) % 100;
}

/**
 * Precedência FIXA (espelhada no header da migration):
 * 1) kill-switch (active=false) → false, ignora tudo;
 * 2) override explícito por tenant;
 * 3) intersecção de tags (grupo);
 * 4) rollout % — gate de MÃO DUPLA quando percent > 0 (bucket < percent
 *    liga; bucket >= percent desliga);
 * 5) default_state — só alcançado quando rollout_percent === 0.
 */
export function evaluateFlag(flag: FlagDefinition, ctx: FlagContext): FlagEvaluation {
  if (!flag.active) {
    return { id: flag.id, key: flag.key, enabled: false, rule: "kill_switch" };
  }
  const override = ctx.overridesByFlagId[flag.id];
  if (typeof override === "boolean") {
    return { id: flag.id, key: flag.key, enabled: override, rule: "override" };
  }
  if (
    flag.enabled_for_tags.length > 0 &&
    flag.enabled_for_tags.some((t) => ctx.orgTags.includes(t))
  ) {
    return { id: flag.id, key: flag.key, enabled: true, rule: "tag" };
  }
  if (flag.rollout_percent > 0) {
    const bucket = rolloutBucket(flag.key, ctx.orgId);
    return {
      id: flag.id,
      key: flag.key,
      enabled: bucket < flag.rollout_percent,
      rule: "rollout",
    };
  }
  return { id: flag.id, key: flag.key, enabled: flag.default_state, rule: "default" };
}

export function evaluateAllFlags(flags: FlagDefinition[], ctx: FlagContext): FlagEvaluation[] {
  return flags.map((f) => evaluateFlag(f, ctx));
}

/** Mapa key→boolean pra consumo rápido no tenant (hook das fases futuras). */
export function toFlagMap(evals: FlagEvaluation[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const e of evals) out[e.key] = e.enabled;
  return out;
}
