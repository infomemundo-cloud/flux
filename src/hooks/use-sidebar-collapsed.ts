import { useState, useEffect, useCallback } from "react";

export function useSidebarCollapsed() {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("fluxo-sidebar-collapsed");
    if (stored === "1") setCollapsed(true);
  }, []);

  const toggle = useCallback(() => {
    setCollapsed((c) => {
      const next = !c;
      localStorage.setItem("fluxo-sidebar-collapsed", next ? "1" : "0");
      return next;
    });
  }, []);

  return { collapsed, toggle };
}
