import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Navegação contextual das páginas PÚBLICAS (/ajuda, /privacidade).
 * O CTA do header nunca mente sobre quem está lendo:
 * 1) ?from=/app/... (injetado pelo UserMenu na /ajuda) → volta à tela exata
 *    de origem, zero query de org (vale inclusive pra multi-org);
 * 2) autenticado sem from → 1 org = fila dela; N orgs = hub /app.
 *    Nunca "passa" pela landing nem pelo hub quando há org única;
 * 3) anônimo → target null (a página oferece Entrar/Voltar à landing).
 * Flags de resolução (sessionResolved/orgsLoaded) existem pra nenhum
 * rótulo "mudar de opinião" na frente do usuário (zero flicker de CTA).
 * RLS: o select de memberships (user_id = auth.uid()) + embed de
 * organizations(slug) é permitido pela policy "members read own memberships".
 */
export function usePublicNav(from?: string) {
  const [user, setUser] = useState<{ id: string } | null | undefined>(undefined);
  const [orgSlug, setOrgSlug] = useState<string | null>(null);
  const [orgCount, setOrgCount] = useState(0);
  const [orgsLoaded, setOrgsLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(({ data }) => {
      if (alive) setUser(data.session?.user ?? null);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      if (alive) setUser(session?.user ?? null);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Resolve orgs SOMENTE quando autenticado E sem ?from (from vence: zero rede)
  useEffect(() => {
    if (!user || from) return;
    let alive = true;
    supabase
      .from("memberships")
      .select("org_id, organizations(slug)")
      .eq("user_id", user.id)
      .limit(10)
      .then(({ data }) => {
        if (!alive) return;
        const rows = (data ?? []) as { organizations?: { slug?: string } | null }[];
        const slugs = rows
          .map((r) => r.organizations?.slug)
          .filter((s): s is string => Boolean(s));
        setOrgCount(slugs.length);
        setOrgSlug(slugs[0] ?? null);
        setOrgsLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, [user, from]);

  const sessionResolved = user !== undefined;
  // Rótulos nomeiam o DESTINO (nunca "painel", que não diz painel de quê):
  // com ?from → "Voltar" (seta ←: retorna à tela exata de origem);
  // 1 org → a fila de atendimento, onde o trabalho acontece;
  // N orgs → escolha explícita de organização.
  if (from)
    return {
      loading: false,
      sessionResolved,
      authed: sessionResolved && !!user,
      target: from,
      label: "Voltar",
      back: true,
    };
  if (!sessionResolved)
    return { loading: true, sessionResolved, authed: false, target: null, label: null, back: false };
  if (!user)
    return { loading: false, sessionResolved, authed: false, target: null, label: null, back: false };
  // Autenticado sem ?from: espera as orgs antes de escolher rótulo/alvo
  // (evita flash de rótulo errado durante o load das memberships).
  if (!orgsLoaded)
    return { loading: true, sessionResolved, authed: true, target: null, label: null, back: false };
  if (orgCount === 1 && orgSlug)
    return {
      loading: false,
      sessionResolved,
      authed: true,
      target: `/app/o/${orgSlug}/fila`,
      label: "Abrir a fila de atendimento",
      back: false,
    };
  return {
    loading: false,
    sessionResolved,
    authed: true,
    target: "/app",
    label: "Escolher organização",
    back: false,
  };
}
