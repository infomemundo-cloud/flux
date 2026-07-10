// Turns server errors (including zod's JSON-serialized issue arrays) into
// short, user-friendly Portuguese messages for toasts.
export function friendlyError(err: unknown, fallback = "Não foi possível concluir a ação. Tente novamente."): string {
  const raw = (err as any)?.message ?? String(err ?? "");
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      const issues = Array.isArray(parsed) ? parsed : parsed?.issues;
      if (Array.isArray(issues) && issues.length > 0) {
        return issues.map((i: any) => i?.message).filter(Boolean).join(" ") || fallback;
      }
    } catch {
      // fall through
    }
  }
  return trimmed;
}