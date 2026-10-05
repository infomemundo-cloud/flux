import { QueryClient, keepPreviousData } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // v3.0 §2.1 — UX reativa com ZERO idle cost:
        // - SEM refetch ao trocar janela do SO (proibido pela diretriz).
        // - reconnect revalida APENAS queries stale (limitado por staleTime).
        // - SEM refetchInterval global (cada query define seu fallback
        //   explícito: fila 60s, detalhe 30s, conexão 120s).
        // - retry: 0 — repetição só via CTA/card de erro (default 3 com
        //   backoff gerava "carregamentos fantasmas" pós-erro, caso real 2026-10-04).
        refetchOnWindowFocus: false,
        refetchOnReconnect: "always",
        retry: 0,

        // Cache ativo: navegação entre rotas/abas serve da RAM (0ms rede).
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 30,

        // Mantém dados anteriores visíveis durante trocas de filtros (sem flicker).
        placeholderData: keepPreviousData,
      },
      mutations: {
        retry: 0, // mutações também sem retry silencioso
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
