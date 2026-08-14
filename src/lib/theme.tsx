import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark" | "corporate";
export const THEMES: { value: Theme; label: string; hint: string }[] = [
  { value: "light", label: "Claro", hint: "Padrão luminoso" },
  { value: "dark", label: "Escuro", hint: "Alto contraste noturno" },
  { value: "corporate", label: "Corporate", hint: "Azul de negócios" },
];

const STORAGE_KEY = "fluxo-theme";

const Ctx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: "light",
  setTheme: () => {},
});

function apply(theme: Theme) {
  const el = document.documentElement;
  el.classList.remove("dark", "corporate");
  if (theme !== "light") el.classList.add(theme);
  el.style.colorScheme = theme === "dark" ? "dark" : "light";
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    const initial: Theme =
      stored && ["light", "dark", "corporate"].includes(stored)
        ? stored
        : window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
    setThemeState(initial);
    apply(initial);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    apply(t);
    localStorage.setItem(STORAGE_KEY, t);
  }, []);

  return <Ctx.Provider value={{ theme, setTheme }}>{children}</Ctx.Provider>;
}

export function useTheme() {
  return useContext(Ctx);
}
