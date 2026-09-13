import { createContext, useContext } from "react";

type FilaSidebarState = {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
};

// Existe só pra o botão "‹ recolher fila" do cabeçalho do painel de detalhe
// (renderizado dentro do <Outlet/> de app.o.$slug.fila.tsx) conseguir controlar
// o `collapsed` que vive no estado da FilaPage — são componentes de rotas
// diferentes, então precisam de um jeito de se falar que não seja prop direta.
export const FilaSidebarContext = createContext<FilaSidebarState | null>(null);

export function useFilaSidebar() {
  return useContext(FilaSidebarContext);
}
