import { QueryClient } from "@tanstack/react-query";
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
        // Rede de segurança: se o canal em tempo real cair, as telas
        // continuam se atualizando sozinhas sem F5.
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
        refetchInterval: 15_000,
        // Cache ativo: ao voltar para uma aba já visitada o conteúdo aparece
        // na hora e revalida em segundo plano.
        staleTime: 1000 * 60 * 5,
        gcTime: 1000 * 60 * 30,
        placeholderData: (prev: unknown) => prev,


  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
