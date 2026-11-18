import { useCallback, useEffect, useRef, useState } from "react";

const KEY = "flux:sidebar-collapsed";

/**
 * Preferência persistida da sidebar principal.
 * DECISÃO NOVA: default = RECOLHIDA (padrão da maioria dos templates/helpdesks);
 * o usuário expande pelo toggle e a escolha fica salva entre sessões.
 * SSR-safe: sem window/storage no servidor, cai no default recolhido
 * (mesmo valor do primeiro paint client → zero flash).
 */
function readPref(): boolean {
  try {
    if (typeof window === "undefined") return true;
    const v = window.localStorage.getItem(KEY);
    if (v === "0") return false; // usuário escolheu expandida
    if (v === "1") return true; // usuário escolheu recolhida
  } catch {
    /* storage indisponível (privado/embed) → default */
  }
  return true;
}

export function useSidebarCollapsed() {
  const [pref, setPref] = useState<boolean>(readPref);
  // Estado efetivo: começa na preferência; o foco em demanda pode recolher
  // temporariamente sem gravar isso como preferência do usuário.
  const [collapsed, setCollapsedState] = useState<boolean>(pref);
  const prefRef = useRef(pref);
  prefRef.current = pref;

  /** Auto-collapse/restore do foco em demanda — NÃO persiste. */
  const setCollapsed = useCallback((v: boolean) => setCollapsedState(v), []);

  /** Toggle manual do usuário — persiste a preferência. */
  const toggle = useCallback(() => {
    setCollapsedState((c) => {
      const next = !c;
      setPref(next);
      return next;
    });
  }, []);

  /** Ao sair do foco em demanda: volta à preferência persistida. */
  const resetToPref = useCallback(() => setCollapsedState(prefRef.current), []);

  useEffect(() => {
    try {
      window.localStorage.setItem(KEY, pref ? "1" : "0");
    } catch {
      /* ignora storage indisponível */
    }
  }, [pref]);

  return { collapsed, setCollapsed, toggle, resetToPref };
}
