import { createContext, useContext } from "react";

export type OrgSidebarContextValue = {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  /** Restaura a preferência persistida (usado ao fechar uma demanda). */
  resetToPref?: () => void;
};

export const OrgSidebarContext = createContext<OrgSidebarContextValue | null>(null);

export function useOrgSidebar() {
  return useContext(OrgSidebarContext);
}
