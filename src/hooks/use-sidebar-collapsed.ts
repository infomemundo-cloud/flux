import { useCallback, useState } from "react";

/**
 * Estado de collapsed/expanded da sidebar.
 * Sempre inicia expandida (collapsed = false). Não persiste entre recargas
 * de propósito: como o app usa SSR, ler de localStorage no useEffect causava
 * um flash (abre expandida -> pisca -> fecha) porque o servidor não tem
 * acesso ao localStorage do navegador. Se no futuro quiser lembrar a
 * escolha do usuário sem o flash, a saída correta é migrar para cookie
 * (lido no servidor antes de renderizar) em vez de localStorage.
 */
export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false);
  const toggle = useCallback(() => setCollapsed((c) => !c), []);
  return { collapsed, toggle };
}
