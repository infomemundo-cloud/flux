/**
 * Circuit breaker do par login ↔ shell do platform_admin.
 * Redirects que se apontam mutuamente podem entrar em ciclo síncrono
 * (aba congela em "Página sem resposta"). Este guard conta hops em uma
 * janela de 5s: acima de 2, o ciclo é interrompido e uma tela de
 * diagnóstico aparece NO LUGAR do próximo redirect.
 */
const KEY = "flux_pa_redirect_hops";
const WINDOW_MS = 5_000;
const MAX_HOPS = 2;

export function bumpRedirectHops(): number {
  try {
    const now = Date.now();
    const raw = sessionStorage.getItem(KEY);
    const prev = raw ? (JSON.parse(raw) as { t: number; n: number }) : { t: 0, n: 0 };
    const n = now - prev.t < WINDOW_MS ? prev.n + 1 : 1;
    sessionStorage.setItem(KEY, JSON.stringify({ t: now, n }));
    return n;
  } catch {
    return 1; // sessionStorage indisponível: não bloqueia navegação
  }
}

export function redirectLoopDetected(): boolean {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return false;
    const { t, n } = JSON.parse(raw) as { t: number; n: number };
    return Date.now() - t < WINDOW_MS && n > MAX_HOPS;
  } catch {
    return false;
  }
}

export function resetRedirectHops(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}
