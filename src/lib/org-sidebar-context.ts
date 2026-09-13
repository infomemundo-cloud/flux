import { createContext, useContext } from "react";

type OrgSidebarState = {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
};

// Mesma ideia do FilaSidebarContext, um nível acima: a FilaPage precisa
// recolher a sidebar principal (ícones) automaticamente quando uma demanda
// é aberta ("Estado 2: Foco no Atendimento"), e ela vive dentro do <Outlet/>
// do OrgLayout — não dá pra passar prop direto por um componente de rota
// diferente, então atravessa por aqui.
export const OrgSidebarContext = createContext<OrgSidebarState | null>(null);

export function useOrgSidebar() {
  return useContext(OrgSidebarContext);
}
